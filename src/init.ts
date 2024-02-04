import { redis } from ".";
import { API_HOST, AssetType, defaults } from "./constants";
import { BSV20V1, BSV20V1Details, BSV20V2, BSV20V2Details, ListingsV1, MarketDataV1 } from "./types/bsv20";
import { calculateMarketCap, fetchChainInfo, fetchJSON, fetchTokensDetails, setPctChange } from "./utils";


// on boot up we get all the tickers and cache them
export const loadV1Tickers = async (): Promise<MarketDataV1[]> => {
  const urlV1Tokens = `${API_HOST}/api/bsv20?limit=100&offset=0&sort=height&dir=desc&included=true`;
  const tickersV1 = await fetchJSON<BSV20V1[]>(urlV1Tokens);
  return await loadV1TickerDetails(tickersV1);
}

type TickerName = {
  tick: string, // tick || sym
  id: string, // tick || id
  type: AssetType.BSV20 | AssetType.BSV20V2
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
  const ticker = (await response.json()) as BSV20V2[]
  return (ticker || []).map((t) => {
    const v2 = t as BSV20V2
    return {
      tick: v2.sym,
      id: v2.id,
      icon: v2.icon,
      type: AssetType.BSV20V2
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
  const tickersV2 = await fetchJSON<BSV20V2[]>(urlV2Tokens);
  return await loadV2TickerDetails(tickersV2);
}

export const loadV2TickerDetails = async (tickersV2: BSV20V2[]) => {
  const info = await fetchChainInfo()

  const tickers = tickersV2.map((t) => t.id);
  const details = await fetchTokensDetails<BSV20V2Details>(tickers, AssetType.BSV20V2);

  // merge back in passed in values
  let merged: BSV20V2Details[] = []
  for (const ticker of details) {
    let t = tickersV2.find((t) => t.id === ticker.id);
    if (t) {
      t = Object.assign(ticker, t);
      merged.push(t as BSV20V2Details);
    }
  }
  for (const ticker of merged) {
    const pctChange = await setPctChange(ticker.id, [], info.blocks);
    await redis.set(`pctChange-${ticker.id}`, pctChange, "EX", defaults.expirationTime);
  }
  // cache
  await redis.set(`tickers-${AssetType.BSV20V2}`, JSON.stringify(merged), "EX", defaults.expirationTime);
  return merged;
}

export const loadV1TickerDetails = async (tickersV1: BSV20V1[]) => {
  const info = await fetchChainInfo()
  const tickers = tickersV1.map((t) => t.tick);
  const details = await fetchTokensDetails<BSV20V1Details>(tickers, AssetType.BSV20);

  // merge back in passed in values
  let merged: BSV20V1Details[] = [];
  for (const ticker of details) {
    let t = tickersV1.find((t) => t.tick === ticker.tick);
    if (t) {
      t = Object.assign(ticker, t);
      merged.push(t as BSV20V1Details);
    }
  }

  const results: MarketDataV1[] = [];

  for (const ticker of merged) {
    // check cache for sales token-${assetType}-${tick}
    const cached = await redis.get(`token-${AssetType.BSV20}-${ticker.tick.toLowerCase()}`);
    if (cached) {
      // load values to tick
      Object.assign(ticker, JSON.parse(cached))
    }
    const price = ticker.sales.length > 0 ? parseFloat((ticker.sales[0] as ListingsV1)?.pricePer) : 0;
    const marketCap = calculateMarketCap(price, parseInt(ticker.max));
    const pctChange = await setPctChange(ticker.tick, [], info.blocks);

    results.push({
      price,
      pctChange,
      marketCap,
      ...ticker,
    });
  }
  // cache
  await redis.set(`tickers-${AssetType.BSV20}`, JSON.stringify(results), "EX", defaults.expirationTime);
  return results;
}
