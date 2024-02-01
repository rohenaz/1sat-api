import EventSource from "eventsource";
import { redis } from ".";
import { API_HOST, AssetType, defaults } from "./constants";
import { BSV20V1, BSV20V1Details, BSV20V2, BSV20V2Details, ListingsV1, MarketDataV1 } from "./types/bsv20";
import { calculateMarketCap, fetchChainInfo, fetchJSON, fetchTokensDetails, setPctChange } from "./utils";


// on boot up we get all the tickers and cache them
export const loadV1Tickers = async (): Promise<MarketDataV1[]> => {
  const urlV1Tokens = `${API_HOST}/api/bsv20?limit=100&offset=0&sort=height&dir=desc&included=true`;
  const tickersV1 = await fetchJSON<BSV20V1[]>(urlV1Tokens);
  const info = await fetchChainInfo()
  const tickers = tickersV1.map((t) => t.tick);
  const details = await fetchTokensDetails<BSV20V1Details>(tickers, AssetType.BSV20);

  const results: MarketDataV1[] = [];
  for (const ticker of details) {

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

  await redis.set(`tickers-${AssetType.BSV20}`, JSON.stringify(results), "EX", defaults.expirationTime);

  return results
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

// const knownV1Tickers = useSignal(["FIRE", "PEPE", "LOVE"]);
// const knownV2Tickers = useSignal(["1bff350b55a113f7da23eaba1dc40a7c5b486d3e1017cda79dbe6bd42e001c81_0"]);
// let loadedKnownTickers = useSignal(false);

// const fire = async () => {
//   const url = `${API_HOST}/api/bsv20?limit=20&sort=pct_minted&dir=desc&included=true`;

//   const resp = await fetchJSON<BSV20V1[]>(url);
//   knownV1Tickers.value = resp.map((t: any) => t.tick);
//   // now add unincluded
//   const urlUnincluded = `${API_HOST}/api/bsv20?limit=1000&sort=pct_minted&dir=desc&included=false`;
//   const { promise: promiseUnincluded } = http.customFetch<any>(
//     urlUnincluded
//   );
//   const respUnincluded = await promiseUnincluded;
//   knownV1Tickers.value = knownV1Tickers.value.concat(
//     respUnincluded.map((t: any) => t.tick)
//   );

//   // now add the v2 tokens
//   const urlV2 = `${API_HOST}/api/bsv20/v2?limit=200&sort=fund_balance&dir=desc`;
//   const { promise: promiseV2 } = http.customFetch<any>(urlV2);
//   const respV2 = await promiseV2;
//   knownV2Tickers.value = knownV2Tickers.value.concat(
//     respV2.map((t: any) => t.id)
//   );
//   // log the total length
//   console.log("Known tickers: ", knownV1Tickers.value.join(" "));
// };

export const loadV2Tickers = async () => {
  const urlV2Tokens = `${API_HOST}/api/bsv20/v2?limit=100&offset=0&included=true`;
  const tickersV2 = await fetchJSON<BSV20V2[]>(urlV2Tokens);
  const info = await fetchChainInfo()
  const tickers = tickersV2.map((t) => t.id);
  const details = await fetchTokensDetails<BSV20V2Details>(tickers, AssetType.BSV20V2);

  for (const ticker of details) {
    const pctChange = await setPctChange(ticker.id, [], info.blocks);
    await redis.set(`pctChange-${ticker.id}`, pctChange, "EX", defaults.expirationTime);

  }
  // cache
  await redis.set(`tickers-${AssetType.BSV20V2}`, JSON.stringify(details), "EX", defaults.expirationTime);
}

interface BalanceUpdate {
  tick?: string,
  id?: string,
  fundTotal: number,
  pendingOps: number,
  fundUsed: number,
}

export const sseInit = async () => {
  const sse = new EventSource(`${API_HOST}/api/subscribe?channel=v1funding&channel=v2funding`);
  sse.addEventListener("v1funding", async (event) => {
    console.log("V1 Funding", event.data);
    const data = JSON.parse(event.data) as BalanceUpdate;
    const { tick, fundTotal, fundUsed, pendingOps } = data;
    const assetType = AssetType.BSV20;

    const t = await redis.get(`token-${assetType}-${tick}`);
    const ticker = t ? JSON.parse(t) : null;
    if (ticker) {
      ticker.fundTotal = fundTotal;
      ticker.pendingOps = pendingOps;
      ticker.fundUsed = fundUsed;
      ticker.fundBalance = (fundTotal - fundUsed).toString();
      await redis.set(`token-${AssetType.BSV20}-${tick}`, JSON.stringify(ticker), "EX", defaults.expirationTime);
    }
  })
  sse.addEventListener("v2funding", async (event) => {
    console.log("V2 Funding", event.data);
    const data = JSON.parse(event.data) as BalanceUpdate;
    const { id, fundTotal, fundUsed, pendingOps } = data;
    const assetType = AssetType.BSV20;

    const t = await redis.get(`token-${assetType}-${id}`);
    const ticker = t ? JSON.parse(t) : null;
    if (ticker) {
      ticker.fundTotal = fundTotal;
      ticker.pendingOps = pendingOps;
      ticker.fundUsed = fundUsed;
      ticker.fundBalance = (fundTotal - fundUsed).toString();
      await redis.set(`token-${AssetType.BSV20V2}-${id}`, JSON.stringify(ticker), "EX", defaults.expirationTime);
    }
  })
  sse.onopen = (event) => {
    console.log("SSE Open", event);
  }
  sse.onmessage = (event) => {
    console.log("SSE", event.data);


  };
  sse.onerror = (event) => {
    console.error("SSE Error", event);
  };
  return sse;
}
