import { redis } from ".";
import { API_HOST, AssetType, defaults } from "./constants";
import { BSV20V1, BSV20V2 } from "./types/bsv20";
import { fetchChainInfo, fetchJSON, setPctChange } from "./utils";

// on boot up we get all the tickers and cache them
export const loadV1Tickers = async () => {
  // check cache
  const cached = await redis.get(`tickers-${AssetType.BSV20}`);
  if (cached) {
    return;
  }
  const urlV1Tokens = `${API_HOST}/api/bsv20?limit=100&offset=0&sort=height&dir=desc&included=true`;
  const tickersV1 = await fetchJSON<BSV20V1[]>(urlV1Tokens);
  const info = await fetchChainInfo()
  for (const ticker of tickersV1) {
    const pctChange = await setPctChange(ticker.tick, [], info.blocks);
    await redis.set(`pctChange-${ticker.tick}`, pctChange, "EX", defaults.expirationTime);
  }
  // cache
  await redis.set(`tickers-${AssetType.BSV20}`, JSON.stringify(tickersV1), "EX", defaults.expirationTime);
}

export const loadV2Tickers = async () => {
  // check cache
  const cached = await redis.get(`tickers-${AssetType.BSV20V2}`);
  if (cached) {
    return;
  }
  const urlV2Tokens = `${API_HOST}/api/bsv20/v2?limit=100&offset=0&included=true`;
  const tickersV2 = await fetchJSON<BSV20V2[]>(urlV2Tokens);
  const info = await fetchChainInfo()
  for (const ticker of tickersV2) {
    const pctChange = await setPctChange(ticker.id, [], info.blocks);
    await redis.set(`pctChange-${ticker.id}`, pctChange, "EX", defaults.expirationTime);
  }
  // cache
  await redis.set(`tickers-${AssetType.BSV20V2}`, JSON.stringify(tickersV2), "EX", defaults.expirationTime);
}
