import { ChainInfo, redis } from ".";
import { API_HOST, AssetType, defaults } from "./constants";
import { BSV20Details, BSV20V1, BSV21, BSV21Details, ListingsV1, MarketDataV1 } from "./types/bsv20";
import { calculateMarketCap, fetchChainInfo, fetchJSON, fetchTokensDetails, setPctChange } from "./utils";


// on boot up we get all the tickers and cache them
export const fetchV1Tickers = async (fetchDetails = true): Promise<MarketDataV1[]> => {
  const urlV1Tokens = `${API_HOST}/api/bsv20?limit=100&offset=0&sort=height&dir=desc&included=true`;
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
}

const fetchV1TickerNames = async (offset: number, resultsPerPage: number, included: boolean) => {
  const url = `${API_HOST}/api/bsv20?limit=${resultsPerPage}&offset=${offset}&included=${included}`
  const response = await fetch(url)
  const ticker = await response.json() as BSV20V1[]
  return (ticker || []).map((t) => {
    const v1 = t as BSV20V1
    return {
      tick: v1.tick,
      id: v1.tick,
      type: AssetType.BSV20
    } as TickerName
  })
}

const fetchV2TickerNames = async (offset: number, resultsPerPage: number) => {
  const url = `${API_HOST}/api/bsv20/v2?limit=${resultsPerPage}&offset=${offset}`
  const response = await fetch(url)
  const ticker = (await response.json()) as BSV21[]
  return (ticker || []).map((t) => {
    const v2 = t as BSV21
    return {
      tick: v2.sym,
      id: v2.id,
      icon: v2.icon,
      type: AssetType.BSV21
    } as TickerName
  })
}

export const loadAllV1Names = async (): Promise<void> => {
  // hit the list endpoint over and over
  let page = 0;
  let includedCount = 0
  let resultsPerPage = 200;

  let done = false
  while (!done) {
    const offset = page * resultsPerPage;
    let results = await fetchV1TickerNames(offset, resultsPerPage, true)
    page++
    if (!results || !results.length) {
      done = true
      continue
    }
    includedCount += results.length
    for (const result of results) {
      await redis.set(`autofill-${result.tick}`, JSON.stringify(result));
    }
  }

  // reset flags
  page = 0;
  done = false;

  let unincludedCount = 0;
  while (!done) {
    const offset = page * resultsPerPage;
    let results = await fetchV1TickerNames(offset, resultsPerPage, false)
    page++
    if (!results || !results.length) {
      done = true;
      continue
    }
    unincludedCount += results.length

    for (const result of results) {
      await redis.set(`autofill-${result.tick}`, JSON.stringify(result));
    }
  }
  console.log("All tickers cached for autofill", includedCount, unincludedCount)
}

export const loadAllV2Names = async (): Promise<void> => {
  // TODO: implement 
}

export const fetchV2Tickers = async () => {
  const urlV2Tokens = `${API_HOST}/api/bsv20/v2?limit=100&offset=0&included=true`;
  const tickersV2 = await fetchJSON<BSV21[]>(urlV2Tokens);
  if (!tickersV2 || !tickersV2.length) {
    return []
  }
  return await loadV2TickerDetails(tickersV2);
}

export const loadV2TickerDetails = async (tickersV2: BSV21[]) => {
  const info = await fetchChainInfo()

  const tickers = tickersV2.map((t) => t.id);
  const details = await fetchTokensDetails<BSV21Details>(tickers, AssetType.BSV21);

  // merge back in passed in values
  let merged: BSV21Details[] = []
  for (const ticker of details) {
    let t = tickersV2.find((t) => t.id === ticker.id);
    if (t) {
      Object.assign(ticker, t);
    }
    merged.push(ticker as BSV21Details);
  }
  for (const ticker of merged) {
    const pctChange = await setPctChange(ticker.id, ticker.sales, info.blocks);
    await redis.set(`pctChange-${ticker.id}`, pctChange, "EX", defaults.expirationTime);
  }
  // cache
  if (merged.length > 0) {
    await redis.set(`tickers-${AssetType.BSV21}`, JSON.stringify(merged), "EX", defaults.expirationTime);
  }
  return merged;
}

// saves tickers to caches and adds pctChange
export const loadV1TickerDetails = async (tickersV1: BSV20V1[], info: ChainInfo) => {
  const results: MarketDataV1[] = [];
  for (const t of tickersV1) {
    const tick = t.tick;
    // check cache for sales token-${assetType}-${tick}
    const cached = (await redis.get(`token-${AssetType.BSV20}-${tick.toLowerCase()}`) || "{}") as string;
    const parsed = JSON.parse(cached);
    const ticker = Object.assign(parsed, t) as BSV20Details;
    const price = ticker.sales.length > 0 ? parseFloat((ticker.sales[0] as ListingsV1)?.pricePer) : 0;
    const marketCap = calculateMarketCap(price, parseInt(ticker.max));
    const pctChange = await setPctChange(ticker.tick, ticker.sales, info.blocks);

    const result = {
      price,
      pctChange,
      marketCap,
      ...ticker,
    } as MarketDataV1

    await redis.set(`token-${AssetType.BSV20}-${tick}`, JSON.stringify(result), "EX", defaults.expirationTime);
    results.push(result);
  }
  // get the tickers and merge in the new values
  const redisTickers = await redis.get(`tickers-${AssetType.BSV20}`);
  let tickers = (redisTickers ? JSON.parse(redisTickers) : []) as MarketDataV1[];
  tickers = tickers.map((t: any) => {
    // merge
    const ticker = results.find((r) => r.tick === t.tick);
    if (ticker) {
      Object.assign(t, ticker);
    }
    return t;
  })
  await redis.set(`tickers-${AssetType.BSV20}`, JSON.stringify(tickers), "EX", defaults.expirationTime);
  return results;
}
