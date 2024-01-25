import { redis } from ".";
import { API_HOST, AssetType, defaults } from "./constants";
import { BSV20V1, BSV20V1Details, BSV20V2, BSV20V2Details, ListingsV1, MarketDataV1 } from "./types/bsv20";
import { fetchChainInfo, fetchJSON, fetchTokensDetails, setPctChange } from "./utils";

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
    const marketCap = calculateMarketCap(price, parseInt(ticker.max), ticker.dec);
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


const calculateMarketCap = (price: number, amount: number, dec: number): number => {
  return (price * amount) / 10 ** dec;
};