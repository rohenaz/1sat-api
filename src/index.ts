import { Elysia, t } from 'elysia';
import Redis from "ioredis";
import { API_HOST, AssetType } from './constants';
import { BSV20TXO } from './types/ordinals';

const redis = new Redis(`${process.env.REDIS_URL}`);

redis.on("connect", () => console.log("Connected to Redis"));
redis.on("error", (err) => console.error("Redis Error", err));

const app = new Elysia().get("/", ({ set }) => {
  set.headers["Content-Type"] = "text/html";
  // sweet ascii art from the 90s
  return `
  :)
  `;
}).get('/market/:assetType', async ({ set, params }) => {
  // check cache for results
  console.log(params.assetType)
  try {
    let market = await redis.get(`market-${params.assetType}`);
    console.log("In cache?", market)
    // if not cached or expired, hit several market endpoints and return the aggregated data
    if (!market) {
      // store results in cache with 
      const marketData = await fetchMarketData(params.assetType as AssetType);
      redis.set(`market-${params.assetType}`, JSON.stringify(marketData), "EX", expirateionTime);
      return marketData;
    }
  } catch (e) {
    set.status = 500;
  }
}, {
  params: t.Object({
    assetType: t.String()
  })
}).listen(process.env.PORT ?? 3000);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);

const fetchMarketData = async (assetType: AssetType) => {
  switch (assetType) {
    case AssetType.BSV20:
      // const urlV1Tokens = `${API_HOST}/bsv20?limit=100&offset=0&sort=height&dir=desc&included=true`;
      const urlV1Tokens = `${API_HOST}/api/bsv20/market?sort=price_per_token&dir=asc&limit=20&offset=0&type=v1`;

      const respV1 = await fetch(urlV1Tokens);
      const tickersV1 = await respV1.json() as BSV20TXO[];

      // aggregate data
      const marketDataV1 = tickersV1.map(ticker => {
        return {
          tick: ticker.tick,
          price: ticker.price,
          cap: ticker.amt,
          holders: 0,
        }
      })
      return marketDataV1;
    case AssetType.BSV20V2:
      const urlV2Tokens = `${API_HOST}/api/bsv20/v2?sort=fund_total&dir=desc&limit=20&offset=0&included=true`;
      const resp = await fetch(urlV2Tokens);
      const tickers = await resp.json() as BSV20TXO[];

      // aggregate data
      return tickers.map(ticker => {
        return {
          tick: ticker.sym,
          price: 0,
          cap: 0,
          holders: 0,
        }
      })

  }
  return [{
    tick: "PEPE",
    price: 0.3152226666666666,
    cap: 6619675.999999998,
    holders: 208,
  }]
}

// 3 minutes
const expirateionTime = 60 * 3;