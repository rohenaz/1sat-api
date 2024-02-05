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

export const loadV1TickerDetails = async (tickersV1: BSV20V1[], info: ChainInfo) => {
  const tickers = tickersV1.map((t) => t.tick);
  console.log("Loading v1 ticker details for", tickers)

  // const details = await fetchTokensDetails<BSV20Details>(tickers, AssetType.BSV20);
  // console.log("Fetch v1 ticker details", details.length, tickers.length, tickersV1.length)
  // merge back in passed in values
  // let merged: BSV20Details[] = [];
  // for (const ticker of details) {
  //   let t = tickersV1.find((t) => t.tick === ticker.tick);
  //   if (t) {
  //     t = Object.assign(ticker, t);
  //     merged.push(t as BSV20Details);
  //   }
  // }

  const results: MarketDataV1[] = [];

  for (const tick of tickers) {
    console.log("Processing", { ticker: tick })
    // check cache for sales token-${assetType}-${tick}
    const cached = await redis.get(`token-${AssetType.BSV20}-${tick.toLowerCase()}`);
    if (!cached) {
      console.log("No cached data for", tick)
      continue;
    }
    const ticker = JSON.parse(cached) as BSV20Details;
    const price = ticker.sales.length > 0 ? parseFloat((ticker.sales[0] as ListingsV1)?.pricePer) : 0;
    const marketCap = calculateMarketCap(price, parseInt(ticker.max));
    const pctChange = await setPctChange(ticker.tick, ticker.sales, info.blocks);

    results.push({
      price,
      pctChange,
      marketCap,
      ...ticker,
    });
  }
  // get the cachged tickers
  const cachedTickers = await redis.get(`tickers-${AssetType.BSV20}`);
  const cTickers = cachedTickers ? JSON.parse(cachedTickers) : [];
  // merge them with results
  const merged = cTickers.map((t: any) => {
    const result = results.find((r) => r.tick === t.tick);
    if (result) {
      Object.assign(t, result);
    }
    return t;
  });
  // cache
  await redis.set(`tickers-${AssetType.BSV20}`, JSON.stringify(merged), "EX", defaults.expirationTime);
  return results;
}
