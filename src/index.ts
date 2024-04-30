import { cors } from '@elysiajs/cors';
import { Elysia, t } from 'elysia';
import Redis from "ioredis";
import { AssetType, defaults } from './constants';
import { findMatchingKeys, findOneExactMatchingKey } from './db';
import { fetchV1Tickers, fetchV2Tickers, loadAllV1Names, loadV1TickerDetails, loadV2TickerDetails } from './init';
import { sseInit } from './sse';
import type { BSV20Details, BSV21Details, MarketDataV1, MarketDataV2 } from './types/bsv20';
import { User } from './types/user';
import { fetchChainInfo, fetchExchangeRate, fetchJSON, fetchStats, fetchTokensDetails } from './utils';

export const redis = new Redis(`${process.env.REDIS_URL}`);
export const botRedis = new Redis(`${process.env.BOT_REDIS_URL}`);

botRedis.on("connect", () => console.log("Connected to Bot Redis"));
botRedis.on("error", (err) => console.error("Bot Redis Error", err));

redis.on("connect", () => console.log("Connected to Redis"));
redis.on("error", (err) => console.error("Redis Error", err));

await loadAllV1Names();
await fetchV1Tickers();
await fetchV2Tickers();
await sseInit();

const app = new Elysia().use(cors()).get("/", ({ set }) => {
  set.headers["Content-Type"] = "text/html";
  return ":)";
}).onError(({ error }) => {
  console.error("Error:", error);
}).get('/ticker/autofill/:assetType/:id', async ({ params }) => {
  // autofill endpoint for ticker id
  const type = params.assetType as AssetType
  const id = params.id

  const results = await findMatchingKeys(redis, "autofill", id, type)
  console.log({ results })
  // bring exact matches to the top
  return results.sort((a, b) => a.id.toLowerCase() === id ? -1 : b.id.toLowerCase() === id ? 1 : 0)
}, {
  transform({ params }) {
    params.assetType = params.assetType.toLowerCase();
    params.id = params.id.toLowerCase();
  },
}).get('/ticker/num/:num', async ({ params }) => {
  // autofill endpoint for ticker id
  const type = AssetType.BSV20
  const num = params.num.toUpperCase()

  const result = await findOneExactMatchingKey(redis, "num", num, type)

  // if no results, parse autofill and store in num
  if (!result) {
    // get all autofill keys
    const autofill = await findMatchingKeys(redis, "autofill", "", type)

    // find the num
    const result = autofill.find((a) => a.num === Number.parseInt(num))
    if (result) {
      await redis.set(`num-${type}-${num}`, JSON.stringify(result), "EX", defaults.expirationTime);
      return result
    }
  }
  console.log({ result })
  return result
}).post("/ticker/num", async ({ set, body }) => {
  set.headers["Content-Type"] = "application/json";
  // takes a list of ids, returns the num records
  // and corresponding autofill records
  const ids = body.ids
  console.log({ ids })
  const type = AssetType.BSV20
  const results: any[] = []
  for (const id of ids) {
    if (results.some((r) => r.tick === id)) {
      continue
    }
    const cached = (await redis.get(`token-${AssetType.BSV20}-${id.toLowerCase()}`) || "{}") as string;
    const parsed = JSON.parse(cached);

    if (parsed) {
      results.push(parsed)
    }
  }
  return results
}, {
  body: t.Object({
    ids: t.Array(t.String())
  })
}).get('/market/:assetType', async ({ set, params, query }) => {
  const { limit, offset, sort, dir } = query;
  console.log({ limit, offset, sort, dir, params })

  try {
    // let market = await redis.get(`market-${params.assetType}`);
    // console.log("In cache?", market)
    // if (!market) {
    const marketData = await fetchShallowMarketData(params.assetType as AssetType, Number.parseInt(offset), Number.parseInt(limit));
    // if (marketData) {
    //   await redis.set(`market-${params.assetType}`, JSON.stringify(marketData), "EX", defaults.expirationTime);
    // }
    console.log("marketData", marketData?.length)
    return marketData;
    //}
    //return JSON.parse(market);
  } catch (e) {
    console.error("Error fetching market data:", e);
    set.status = 500;
    return {};
  }
}, {
  transform({ params }) {
    params.assetType = params.assetType.toLowerCase();
  },
  query: t.Object({
    limit: t.String(),
    offset: t.String(),
    sort: t.String(),
    dir: t.String()
  }),
  params: t.Object({
    assetType: t.String()
  })
}).get("/market/:assetType/:id", async ({ set, params, query }) => {
  const id = decodeURIComponent(params.id);
  console.log("WITH ID", params.assetType, id)
  const sort = query.sort || "price_per_token";
  try {
    const marketData = await fetchMarketData(params.assetType as AssetType, id);
    return marketData.sort((a, b) => {
      // find the most recent sales
      const aSales = a.sales || [];
      const bSales = b.sales || [];
      if (sort === "name") {
        if (params.assetType === AssetType.BSV20) {
          const bsv20a = (a as MarketDataV1).tick
          const bsv20b = (b as MarketDataV1).tick
          return bsv20a > bsv20b ? 1 : -1;
        }
        if (params.assetType === AssetType.BSV21) {
          const bsv21a = (a as MarketDataV2).sym
          const bsv21b = (b as MarketDataV2).sym
          return bsv21a > bsv21b ? 1 : -1;
        }
      }
      if (sort === "price_per_token") {
        const aPrice = aSales.length > 0 ? aSales[0]?.pricePer : 0;
        const bPrice = bSales.length > 0 ? bSales[0]?.pricePer : 0;
        return aPrice > bPrice ? 1 : -1;

      }
      // default sort by recentSales
      const aHeight = aSales.length > 0 ? aSales[0]?.height : 0;
      const bHeight = bSales.length > 0 ? bSales[0]?.height : 0;
      if (aSales.length === 0) {
        return 1;
      }
      if (bSales.length === 0) {
        return -1;
      }
      if (aHeight === bHeight) {
        const aIdx = aSales.length > 0 ? aSales[0]?.idx : 0;
        const bIdx = bSales.length > 0 ? bSales[0]?.idx : 0;
        return aIdx > bIdx ? 1 : -1;
      }
      return aHeight > bHeight ? 1 : -1;
    })
  } catch (e) {
    console.error("Error fetching market data:", e);
    set.status = 500;
    return {};
  }
}, {
  transform({ params }) {
    params.assetType = params.assetType.toLowerCase();
    params.id = params.id.toLowerCase();
  },
  params: t.Object({
    assetType: t.String(),
    id: t.String()
  }),
  query: t.Object({
    sort: t.String()
  })
}).get("/mint/:assetType/:id", async ({ set, params }) => {
  // same as /market/:assetType/:id but doesn't return minted out tokens
  const id = decodeURIComponent(params.id);
  console.log("WITH ID", params.assetType, id)
  try {
    const marketData = await fetchMarketData(params.assetType as AssetType, id) as MarketDataV1[];
    return marketData.filter((token) => {
      return token.supply !== token.max;
    });
  } catch (e) {
    console.error("Error fetching market data:", e);
    set.status = 500;
    return {};
  }
}, {
  transform({ params }) {
    params.assetType = params.assetType.toLowerCase();
    params.id = params.id.toLowerCase();
  },
  params: t.Object({
    assetType: t.String(),
    id: t.String()
  })
}).get("/airdrop/:template", async ({ params }) => {
  let addresses: string[] = []
  // return a list of addresses
  const template = params.template

  switch (template) {
    // template 1 - all buyers
    case "1": {
      addresses = []
      break
    }
    // template 2 - all holders
    case "2": {
      addresses = []
      break
    }
    // template 3 - all redis bot user addresses
    case "3": {

      const users = await botRedis.keys("user-*")
      console.log({ users })
      // we need user.address for each user
      addresses = await Promise.all(users.map(async (userKey: string) => {
        const user = await botRedis.get(userKey)
        return JSON.parse(user).address
      }))
    }
  }
  return addresses || []
}).get("/status", async ({ set }) => {
  set.headers["Content-Type"] = "application/json";
  const chainInfo = await fetchChainInfo();
  const exchangeRate = await fetchExchangeRate();
  const indexers = await fetchStats()
  return {
    chainInfo,
    exchangeRate,
    indexers
  };
}).get("/user/:discordId", async ({ params, set }) => {
  // return user info
  const discordId = params.discordId

  // get the user from redis by discord id
  const user = await botRedis.get(`user-${discordId}`)
  if (!user) {
    set.status = 404;
    return {}
  }
  console.log({ user })
  return JSON.parse(user)
}, {
  params: t.Object({
    discordId: t.String()
  })
}).get("/user/:discordId/check/:txid", async ({ params, set }) => {
  // return user info
  const discordId = params.discordId

  // get the user from redis by discord id
  const userStr = await botRedis.get(`user-${discordId}`)
  if (!userStr) {
    set.status = 404;
    return {
      error: "user not found"
    }
  }
  const user = JSON.parse(userStr) as User

  // find the tx in the user wins
  const win = user.wins.find((w) => w.txid === params.txid)
  const airdrop = user.airdrops.find((a) => a.txid === params.txid)
  const gift = user.giftsGiven.find((g) => g.txid === params.txid)

  if (!win && !airdrop) {
    set.status = 404;
    return {
      error: "no win or airdrop with that txid"
    }
  }

  // see if the win exists on chain
  // if it already does we cacnnot claim anything
  const tx = fetchJSON(`https://api.whatsonchain.com/v1/bsv/main/tx/hash/${params.txid}`)
  if (!tx) {
    // if it doesn't, we can claim it
    const claim = {
      win,
      gift,
      airdrop,
      claimed: false
    }

    return claim
  }
  // already claimed - conflict status
  set.status = 409;
  return {
    win, airdrop, gift,
    claimed: true,
    error: "already claimed"
  }

}, {
  params: t.Object({
    discordId: t.String(),
    txid: t.String()
  })
}).listen(process.env.PORT ?? 3000);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);

// {"chain":"main","blocks":828211,"headers":661647,"bestblockhash":"000000000000000004aa4c183384a0bf13a49e6726fcc7bb7fb8c9bc9594b2f2","difficulty":119016070306.9696,"mediantime":1705928988,"verificationprogress":0.9999961584631301,"pruned":false,"chainwork":"00000000000000000000000000000000000000000150caf5c43a1446f852c8fe"}
export type ChainInfo = {
  chain: string,
  blocks: number,
  headers: number,
  bestblockhash: string,
  difficulty: number,
  mediantime: number,
  verificationprogress: number,
  pruned: boolean,
  chainwork: string,
}

// if (type === AssetType.BSV21) {
//   const urlTokens = `${API_HOST}/api/bsv20/market?sort=price_per_token&dir=asc&limit=20&offset=0&type=v1`;
//   const { promise: promiseBsv20 } = http.customFetch<BSV20TXO[]>(urlTokens);
//   marketData.listings = await promiseBsv20;
// } else {
//   const urlV2Tokens = `${API_HOST}/api/bsv20/market?sort=price_per_token&dir=asc&limit=20&offset=0&type=v2`;
//   const { promise: promiseBsv20v2 } =
//     http.customFetch<BSV20TXO[]>(urlV2Tokens);
//   listings = await promiseBsv20v2;
// }

// Function to fetch and process market data
const fetchMarketData = async (assetType: AssetType, id: string) => {
  id = id?.toLowerCase();
  const info = await fetchChainInfo()
  switch (assetType) {
    case AssetType.BSV20: {
      let detailedTokensV1: BSV20Details[] = [];
      let resultsv1: MarketDataV1[] = [];
      // if (id) {
      console.log("Fetching token details for", id)
      detailedTokensV1 = await fetchTokensDetails<BSV20Details>([id], assetType);
      resultsv1 = await loadV1TickerDetails(detailedTokensV1, info);

      return resultsv1.sort((a, b) => {
        return b.marketCap - a.marketCap;
      });
    }
    case AssetType.BSV21: {
      let detailedTokensV2: BSV21Details[] = [];
      let resultsv2: MarketDataV2[] = [];
      detailedTokensV2 = await fetchTokensDetails<BSV21Details>([id], assetType);

      resultsv2 = await loadV2TickerDetails(detailedTokensV2, info);

      return resultsv2.sort((a, b) => {
        return b.marketCap - a.marketCap;
      });
    }

    default:
      return [];
  }
};

const fetchShallowMarketData = async (assetType: AssetType, offset = 0, limit = 20) => {
  switch (assetType) {
    case AssetType.BSV20: {
      // check cache
      const tv1: MarketDataV1[] = [];

      const [cursorv1, ticks] = await redis.zscan(`included-${AssetType.BSV20}`, offset, "COUNT", limit);

      for (let i = 0; i < ticks.length; i += 2) {
        const tick = ticks[i];
        const cached = await redis.get(`token-${AssetType.BSV20}-${tick}`)
        if (!cached) {
          continue;
        }
        const token = JSON.parse(cached);
        // console.log(key, value)
        tv1.push(token);
      }
      return tv1;
    }

    case AssetType.BSV21: {
      const tv2: MarketDataV2[] = [];
      const [cursorv2, ids] = await redis.zscan(`included-${AssetType.BSV21}`, offset, "COUNT", limit);

      for (let i = 0; i < ids.length; i += 2) {
        const id = ids[i];
        const cached = await redis.get(`token-${AssetType.BSV21}-${id}`)
        if (!cached) {
          continue;
        }
        const token = JSON.parse(cached);
        tv2.push(token);
      }
      return tv2;
    }
    default:
      break;
  }
}
