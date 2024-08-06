import { type ChainInfo, redis } from ".";
import { API_HOST, AssetType, bsv21Blacklist } from "./constants";
import type { BSV20V1, BSV21, Holder, ListingsV1, ListingsV2, MarketDataV1, MarketDataV2 } from "./types/bsv20";
import { calculateMarketCap, fetchChainInfo, fetchJSON, setPctChange } from "./utils";


// on boot up we get all the tickers and cache them
export const fetchV1Tickers = async (): Promise<MarketDataV1[]> => {
  const urlV1Tokens = `${API_HOST}/bsv20?limit=100&offset=0&sort=height&dir=desc&included=true`;
  const tickersV1 = (await fetchJSON<BSV20V1[]>(urlV1Tokens)) || [];
  console.log("Fetched v1 tickers", tickersV1.length)

  const info = await fetchChainInfo()

  return await loadV1TickerDetails(tickersV1, info);
}

type TickerName = {
  tick: string, // tick || sym
  id: string, // tick || id
  type: AssetType.BSV20 | AssetType.BSV21
  icon?: string
  num: number
  contract?: string
}

const fetchV1TickerNames = async (offset: number, resultsPerPage: number, included: boolean) => {
  const url = `${API_HOST}/bsv20?limit=${resultsPerPage}&sort=height&dir=asc&offset=${offset}&included=${included}`
  console.log("Fetching", url)
  const response = await fetch(url)
  const ticker = await response.json() as BSV20V1[]
  const tickers = (ticker || []).map((t, idx) => {
    const v1 = t as BSV20V1
    return {
      tick: v1.tick,
      id: v1.tick,
      type: AssetType.BSV20,
      num: idx + 1 + offset,
      height: v1.height,
      idx: v1.idx,
    } as TickerName
  })
  console.log("Fetched", tickers.length, "tickers")
  return tickers
}

const fetchV2TickerNames = async (offset: number, resultsPerPage: number, included: boolean) => {
  const url = `${API_HOST}/bsv20/v2?limit=${resultsPerPage}&offset=${offset}&included=${included}`
  const response = await fetch(url)
  const ticker = (await response.json()) as BSV21[]
  return (ticker || []).filter((v2) => {
    return v2.sym && v2.id
  }).map((t) => {
    const v2 = t as BSV21
    const res = {
      tick: v2.sym,
      id: v2.id,
      icon: v2.icon,
      type: AssetType.BSV21
    } as TickerName
    if (v2.data?.insc?.json?.contract) {
      res.contract = v2.data.insc.json.contract
    }
    return res
  })
}

export const loadAllV1Names = async (): Promise<void> => {
  // hit the list endpoint over and over
  let offset = (await redis.hlen(`autofill-${AssetType.BSV20}`)) || 0
  let includedCount = 0;
  let unincludedCount = 0;
  let resultsPerPage = 200;

  while (true) {
    // const offset = page * resultsPerPage;
    const results = await fetchV1TickerNames(offset, resultsPerPage, false)
    // page++
    if (!results) {
      break
    }
    offset += results.length
    unincludedCount += results.length

    for (const result of results) {
      console.log("AutoFill", result.tick, result.tick.toLowerCase())
      await redis.hset(`autofill-${AssetType.BSV20}`, result.tick.toLowerCase(), JSON.stringify(result));
    }
    if (results.length < resultsPerPage) {
      break
    }
  }
  console.log("All tickers cached for autofill", includedCount, unincludedCount)
}

export const loadIncludedV2Names = async (): Promise<void> => {
  // TODO: implement 
  let offset = (await redis.hlen(`autofill-${AssetType.BSV21}`)) || 0
  let includedCount = 0;
  const resultsPerPage = 200;

  while (true) {
    // const offset = page * resultsPerPage;
    const results = await fetchV2TickerNames(offset, resultsPerPage, true)
    // page++
    if (!results) {
      break
    }
    offset += results.length
    includedCount += results.length

    for (const result of results) {
      console.log("AutoFill", result.tick, result.id)
      await redis.hset(`autofill-${AssetType.BSV21}`, `${result.tick.toLowerCase()}-${result.id.toLowerCase()}`, JSON.stringify(result));
    }
    if (results.length < resultsPerPage) {
      break
    }
  }
  console.log("All v2 tickers cached for autofill", includedCount, includedCount)
}

export const fetchV2Tickers = async () => {
  const urlV2Tokens = `${API_HOST}/bsv20/v2?limit=100&offset=0&included=true`;
  const tickersV2 = await fetchJSON<BSV21[]>(urlV2Tokens);
  if (!tickersV2 || !tickersV2.length) {
    return []
  }
  const info = await fetchChainInfo()
  return await loadV2TickerDetails(tickersV2.filter((t) => {
    return bsv21Blacklist.includes(t.id) === false
  }), info);
}

// saves tickers to caches and adds pctChange
export const loadV1TickerDetails = async (tickersV1: BSV20V1[], info: ChainInfo) => {
  const results: MarketDataV1[] = [];
  for (const t of tickersV1) {
    const tick = t.tick;
    // check cache for sales token-${assetType}-${tick}
    const cached = (await redis.get(`token-${AssetType.BSV20}-${tick.toLowerCase()}`) || "{}") as string;
    const parsed = JSON.parse(cached);
    const ticker = Object.assign(parsed, t) as MarketDataV1;
    let sales = [] as ListingsV1[];

    await Promise.all([
      (async () => {
        const urlSales = `${API_HOST}/bsv20/market/sales?dir=desc&limit=20&offset=0&tick=${tick}`;
        sales = (await fetchJSON<ListingsV1[]>(urlSales) || [])
      })(),
      (async () => {
        const urlListings = `${API_HOST}/bsv20/market?sort=price_per_token&dir=asc&limit=20&offset=0&tick=${tick}`;
        const key = `listings-${AssetType.BSV20}-${tick.toLowerCase()}`;
        const pipeline = redis.pipeline().del(key);
        for (const listing of (await fetchJSON<ListingsV1[]>(urlListings) || [])) {
          pipeline.hset(key, `${listing.txid}_${listing.vout}`, JSON.stringify(listing))
        }
        await pipeline.exec()
      })(),
      (async () => {
        if (!ticker.holders) {
          ticker.holders = [];
          const urlHolders = `${API_HOST}/bsv20/tick/${tick}/holders?limit=20&offset=0`;
          ticker.holders = (await fetchJSON(urlHolders) || [])
          // TODO: For some reason accounts is not populated
          if (!ticker.accounts || ticker.accounts === 0) {
            ticker.accounts = ticker.holders.length;
          }
        }
      })(),
      (async () => {
        if (ticker.included) {
          await redis.zadd(`included-${AssetType.BSV20}`, 'NX', Date.now(), ticker.tick.toLowerCase())
        }
      })(),
    ])

    const price = sales.length > 0 ? Number.parseFloat(sales[0]?.pricePer) : 0;
    const marketCap = calculateMarketCap(price, Number.parseInt(ticker.max));
    const pctChange = await setPctChange(ticker.tick, sales, info.blocks);
    const lastSaleHeight = sales.length > 0 ? sales[0]?.spendHeight || 0 : undefined;

    const result = {
      ...ticker,
      price,
      pctChange,
      marketCap,
      lastSaleHeight,
    } as MarketDataV1

    const autofillData = await redis.hget(`autofill-${AssetType.BSV20}`, ticker.tick.toLowerCase());
    if (autofillData) {
      const autofill = JSON.parse(autofillData);
      result.num = autofill.num;
    }

    await redis.set(`token-${AssetType.BSV20}-${tick.toLowerCase()}`, JSON.stringify(result)) //, "EX", defaults.expirationTime);
    results.push(result);
  }

  return results
}

export const loadV2TickerDetails = async (tickersV2: BSV21[], info: ChainInfo) => {
  const results: MarketDataV2[] = [];
  for (const t of tickersV2) {
    if (bsv21Blacklist.includes(t.id)) {
      continue
    }
    const id = t.id;
    const cached = (await redis.get(`token-${AssetType.BSV21}-${id}`) || "{}") as string;
    const parsed = JSON.parse(cached);
    const ticker = Object.assign(parsed, t) as MarketDataV2;

    const [contractData, sales, listings, holders] = await Promise.all([
      fetchContractData(id, ticker),
      fetchSales(id),
      fetchListings(id),
      fetchHolders(id, ticker),
    ]);

    await updateListingsCache(id, listings);
    await updateIncludedCache(id, ticker);

    const price = sales.length > 0 ? Number.parseFloat(sales[0]?.pricePer) : 0;
    const lastSaleHeight = sales.length > 0 ? sales[0]?.spendHeight || 0 : undefined;
    const marketCap = calculateMarketCap(price, Number.parseInt(ticker.amt));
    const pctChange = await setPctChange(id, sales, info.blocks);

    const result = {
      ...ticker,
      price,
      pctChange,
      marketCap,
      lastSaleHeight,
    } as MarketDataV2;

    await redis.set(`token-${AssetType.BSV21}-${id}`, JSON.stringify(result));
    results.push(result);
  }
  return results;
};

async function fetchContractData(id: string, ticker: MarketDataV2): Promise<Partial<BSV21>> {
  const url = `${API_HOST}/content/${id}?fuzzy=false`;
  const contractData = await fetchJSON(url) as Partial<BSV21>

  // pow20
  if (contractData && contractData.contract === "pow-20") {

    updateTickerWithPow20Data(ticker, contractData);

    return contractData;
  }

  // lock to mint
  if (contractData && contractData.contract === "LockToMintBsv20") {
    updateTickerWithLTMData(ticker, contractData);
    return contractData;
  }

  return {};
}

async function fetchSales(id: string): Promise<ListingsV2[]> {
  const urlSales = `${API_HOST}/bsv20/market/sales?dir=desc&limit=20&offset=0&id=${id}`;
  const sales = await fetchJSON<ListingsV2[]>(urlSales);
  return sales || [];
}

async function fetchListings(id: string): Promise<ListingsV2[]> {
  const urlListings = `${API_HOST}/bsv20/market?sort=price_per_token&dir=asc&limit=20&offset=0&id=${id}`;
  const listings = await fetchJSON<ListingsV2[]>(urlListings);
  return listings || [];
}

async function fetchHolders(id: string, ticker: MarketDataV2): Promise<void> {
  if (!ticker.holders) {
    const urlHolders = `${API_HOST}/bsv20/id/${id}/holders?limit=20&offset=0`;
    const holders = await fetchJSON(urlHolders) as Holder[];
    ticker.holders = holders || [];
  }
}

function updateTickerWithPow20Data(ticker: MarketDataV2, pow20Data: Partial<BSV21>): void {
  const { contract, startingReward, difficulty } = pow20Data;
  console.log({ contract, startingReward, difficulty });
  ticker.contract = contract;
  ticker.startingReward = startingReward;
  ticker.difficulty = difficulty;
}

function updateTickerWithLTMData(ticker: MarketDataV2, ltmData: Partial<BSV21>): void {
  const { contract, contractStart, lockTime, lockPerToken } = ltmData;
  console.log({ contract, contractStart, lockTime, lockPerToken });
  ticker.contract = contract;
  ticker.contractStart = contractStart;
  ticker.lockTime = lockTime;
  ticker.lockPerToken = lockPerToken;
}

async function updateListingsCache(id: string, listings: ListingsV2[]): Promise<void> {
  const key = `listings-${AssetType.BSV21}-${id}`;
  const pipeline = redis.pipeline().del(key);
  for (const listing of listings) {
    pipeline.hset(key, `${listing.txid}_${listing.vout}`, JSON.stringify(listing));
  }
  await pipeline.exec();
}

async function updateIncludedCache(id: string, ticker: MarketDataV2): Promise<void> {
  if (ticker.included) {
    await redis.zadd(`included-${AssetType.BSV21}`, "NX", Date.now(), id);
  }
}