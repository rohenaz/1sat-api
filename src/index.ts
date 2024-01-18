import { Elysia, t } from 'elysia';
import Redis from "ioredis";
import { API_HOST, AssetType } from './constants';
import { BSV20TXO } from './types/ordinals';

const redis = new Redis(`${process.env.REDIS_PRIVATE_URL}`);

const app = new Elysia().get("/", ({ set }) => {
  set.headers["Content-Type"] = "text/html";
  // sweet ascii art from the 90s
  return `
  <pre>
  _______  _______  _______  _______  _______  _______  _______  _______  _______
  |       ||   _   ||       ||       ||       ||       ||       ||       ||       |
  |    ___||  |_|  ||_     _||    ___||    ___||       ||       ||    ___||  _____|
  |   | __ |       |  |   |  |   |___ |   |___ |       ||       ||   |___ | |_____
  |   ||  ||       |  |   |  |    ___||    ___||      _||      _||    ___||_____  |
  |   |_| ||   _   |  |   |  |   |___ |   |___ |     |_ |     |_ |   |___  _____| |
  |_______||__| |__|  |___|  |_______||_______||_______||_______||_______||_______|
  </pre>
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
      const urlV1Tokens = `${API_HOST}/bsv20?limit=100&offset=0&sort=height&dir=desc&included=true`;
      const respV1 = await fetch(urlV1Tokens);
      const listingsV1 = await respV1.json() as BSV20TXO[];

      // aggregate data
      const marketDataV1 = listingsV1.map(listing => {
        return {
          tick: listing.tick,
          price: listing.price,
          cap: listing.amt,
          holders: 0,
        }
      })
      return marketDataV1;
    case AssetType.BSV20V2:
      const urlV2Tokens = `${API_HOST}/api/bsv20/v2?sort=fund_total&dir=desc&limit=20&offset=0&included=true`;
      const resp = await fetch(urlV2Tokens);
      const listings = await resp.json() as BSV20TXO[];

      // aggregate data
      return listings.map(listing => {
        return {
          tick: listing.tick,
          price: listing.price,
          cap: listing.amt,
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