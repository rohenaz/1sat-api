import { basicAuth } from '@eelkevdbos/elysia-basic-auth';
import { cors } from '@elysiajs/cors';
import { P2PKHAddress, PrivateKey, Script, SigHash, Transaction, TxIn, TxOut } from 'bsv-wasm';
import { Elysia, t } from 'elysia';
import Redis from "ioredis";
import { fetchCollectionItems, fetchCollectionMarket, fetchCollectionSales } from './collection';
import { API_HOST, AssetType, NUMBER_OF_ITEMS_PER_PAGE, defaults } from './constants';
import { findMatchingKeys, findMatchingKeysWithOffset, findOneExactMatchingKey } from './db';
import { fetchV1Tickers, fetchV2Tickers, loadAllV1Names, loadIncludedV2Names, loadV1TickerDetails, loadV2TickerDetails } from './init';
import { sseInit } from './sse';
import type { BSV20Details, BSV21Details, MarketDataV1, MarketDataV2 } from './types/bsv20';
import type { OrdUtxo } from './types/ordinals';
import type { LeaderboardEntry, User } from './types/user';
import { fetchChainInfo, fetchExchangeRate, fetchJSON, fetchStats, fetchTokensDetails } from './utils';

export const redis = new Redis(`${process.env.REDIS_URL}`);
export const botRedis = new Redis(`${process.env.BOT_REDIS_URL}`);

botRedis.on("connect", () => console.log("Connected to Bot Redis"));
botRedis.on("error", (err) => console.error("Bot Redis Error", err));

redis.on("connect", async () => {
  console.log("Connected to Redis")

  await fetchV1Tickers();
  await fetchV2Tickers();
  await loadAllV1Names();
  await loadIncludedV2Names();
  await sseInit();
});

redis.on("error", (err) => console.error("Redis Error", err));

const app = new Elysia().use(cors()).use(basicAuth({
  credentials: { env: 'BASIC_AUTH_CREDENTIALS' }, scope: "/admin",
})).get("/", ({ set }) => {
  set.headers["Content-Type"] = "text/html";
  return ":)";
}).onError(({ error }) => {
  console.error("Error:", error);
}).get('/ticker/autofill/:assetType/:id', async ({ params }) => {
  // autofill endpoint for ticker id
  const type = params.assetType as AssetType
  const id = params.id

  const results = await findMatchingKeys(redis, "autofill", id, type)
  // console.log({ results })
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
}).get("/collection/:collectionId/market", async ({ params, query, set }) => {
  // ofset and limit
  const { offset, limit } = query;
  const collectionId = params.collectionId;
  console.log({ collectionId, offset, limit });
  try {
    return await fetchCollectionMarket({ map: { subTypeData: { collectionId } } }, Number.parseInt(offset || "0"), limit ? Number.parseInt(limit) : NUMBER_OF_ITEMS_PER_PAGE);
  } catch (e) {
    console.error("Error fetching collection market:", e);
    set.status = 500;
    return [];
  }
  // use the search endpoint to find listings for a collection by id
}).get("/collection", async ({ set, query }) => {
  const { offset, limit } = query;
  try {
    // Retrieve the cached collections using findMatchingKeysWithOffset
    const collections = await findMatchingKeysWithOffset(redis, "collection", "", AssetType.Ordinals, Number.parseInt(offset || "0"), limit ? Number.parseInt(limit) : NUMBER_OF_ITEMS_PER_PAGE);
    console.log("### Found collections", collections.length)

    // ok now we need to sort these by last sale.... crap.
    // for (const collection of collections) {
    //   // find any sales with this collection id
    //   const sales = await findMatchingKeys(redis, "sale", collection.id, AssetType.Ordinals)
    //   // sort by last sale
    //   const sorted = sales.sort((a, b) => {
    //     return b.lastSaleHeight - a.lastSaleHeight
    //   })
    //   // get the last sale
    //   const lastSale = sorted[0]
    //   collection.lastSale = lastSale
    // }

    return collections.filter((c) => c.origin).sort((a, b) => {
      return b.lastSaleHeight - a.lastSaleHeight
    })
  } catch (e) {
    console.error("Error fetching collections:", e);
    set.status = 500;
    return [];
  }
}).get("/collection/:collectionId/items", async ({ params, query, set }) => {
  const { offset, limit } = query;
  const collectionId = params.collectionId;

  try {
    const items = await fetchCollectionItems({ map: { subTypeData: { collectionId } } }, Number.parseInt(offset || "0"), limit ? Number.parseInt(limit) : NUMBER_OF_ITEMS_PER_PAGE);

    // Fetch the collection data from the API
    const response = await fetch(`${API_HOST}/api/inscriptions/${collectionId}`);
    const collectionData = await response.json() as any;

    // Store the collection data in a hash
    if (response.status === 200) {

      // get the stats for the collection
      const stats = await fetchJSON(`${API_HOST}/api/collections/${collectionId}/stats`);
      collectionData.stats = stats;

      await redis.hset(`collection-${AssetType.Ordinals}`, collectionId, JSON.stringify(collectionData), "EX", defaults.expirationTime);
    }

    try {
      const sales = await fetchCollectionSales(collectionId, Number.parseInt(offset || "0"), limit ? Number.parseInt(limit) : NUMBER_OF_ITEMS_PER_PAGE);
      collectionData.sales = sales || [];

      // get the last sale
      if (!sales) {
        collectionData.lastSale = null
      } else {
        collectionData.lastSale = sales.sort((a, b) => {
          return (b.spendHeight || 0) - (a.spendHeight || 0)
        })[0]
      }
    } catch (e) {
      console.error("Error fetching collection sales:", e);
    }
    // we're not doing any caching on items themselves
    return items;
  } catch (e) {
    console.error("Error fetching collection items:", e);
    set.status = 500;
    return [];
  }
}).get('/market/:assetType', async ({ set, params, query }) => {
  // sort can be name, market_cap, price, pct_change, holders, most_recent_sale (default)
  const { limit = NUMBER_OF_ITEMS_PER_PAGE.toString(), offset = "0", sort = "most_recent_sale", dir = "asc" } = query;
  console.log({ limit, offset, sort, dir, params });

  try {
    const marketData = await fetchShallowMarketData(params.assetType as AssetType, Number.parseInt(offset), Number.parseInt(limit));
    console.log("marketData", marketData?.length);

    if (!marketData) {
      set.status = 404;
      return [];
    }

    const sortMethod = sort;
    const sortDirection = dir === "asc" ? 1 : -1;

    return marketData.sort((a: MarketDataV1 | MarketDataV2, b: MarketDataV1 | MarketDataV2) => {

      const compareByName = (): number => {
        if (params.assetType === AssetType.BSV20) {
          const bsv20a = (a as MarketDataV1).tick || "";
          const bsv20b = (b as MarketDataV1).tick || "";
          return bsv20a.localeCompare(bsv20b);
        }
        if (params.assetType === AssetType.BSV21) {
          const bsv21a = (a as MarketDataV2).sym || "";
          const bsv21b = (b as MarketDataV2).sym || "";
          return bsv21a.localeCompare(bsv21b);
        }
        return 0;
      };

      const compareByNumber = (propName: keyof (MarketDataV1 | MarketDataV2)): number => {
        const aProp = Number((a as MarketDataV1 | MarketDataV2)[propName] || 0);
        const bProp = Number((b as MarketDataV1 | MarketDataV2)[propName] || 0);
        return aProp - bProp;
      };

      const compareByHolders = (): number => {
        const aHolders = (a as MarketDataV1 | MarketDataV2).holders?.length || 0;
        const bHolders = (b as MarketDataV1 | MarketDataV2).holders?.length || 0;
        return aHolders - bHolders;
      };

      const compareByMostRecentSale = (): number => {
        // unconfirmed is most recent
        if (a.lastSaleHeight === 0) {
          return -1;
        }
        if (b.lastSaleHeight === 0) {
          return 1;
        }
        if (a.lastSaleHeight === undefined) {
          return 1;
        }
        if (b.lastSaleHeight === undefined) {
          return -1;
        }
        return a.lastSaleHeight - b.lastSaleHeight;
      };

      const compareFunctions: Record<string, () => number> = {
        name: compareByName,
        market_cap: () => compareByNumber("marketCap"),
        price: () => compareByNumber("price"),
        pct_change: () => compareByNumber("pctChange"),
        holders: compareByHolders,
        most_recent_sale: compareByMostRecentSale,
      };

      const compareFunction = compareFunctions[sortMethod] || compareByMostRecentSale;
      return compareFunction() * sortDirection;
    });
  } catch (e) {
    console.error("Error fetching market data:", e);
    set.status = 500;
    return [];
  }
}, {
  transform({ params }) {
    params.assetType = params.assetType.toLowerCase();
  },
  query: t.Object({
    limit: t.Optional(t.String()),
    offset: t.Optional(t.String()),
    sort: t.Optional(t.String()),
    dir: t.Optional(t.String())
  }),
  params: t.Object({
    assetType: t.String()
  })
}).get("/market/:assetType/search/:term", async ({ set, params, query }) => {
  const term = decodeURIComponent(params.term);
  console.log("WITH SEARCH TERM", params.assetType, term)
  // TODO: Implement sorting
  const sort = query.sort || "price_per_token";
  try {
    const marketData = await findMarketData(params.assetType as AssetType, term);
    return marketData;
  } catch (e) {
    console.error("Error fetching market data:", e);
    set.status = 500;
    return {};
  }
}, {
  transform({ params }) {
    params.assetType = params.assetType.toLowerCase();
    params.term = params.term.toLowerCase();
  },
  params: t.Object({
    assetType: t.String(),
    term: t.String()
  }),
  query: t.Object({
    sort: t.Optional(t.String())
  })
}).get("/leaderboard", async ({ params }) => {
  // get the top buyers in the last 24 hours

  // get sales from redis
  // const sales = await findMatchingKeys(redis, "listings", "", "*" as AssetType)
  const leaderboard: LeaderboardEntry[] = []
  leaderboard.push({
    address: "1NVoMjzjAgskT5dqWtTXVjQXUns7RqYp2m",
    totalSpent: 100000,
    numPurchases: 10,
    timeframe: 86400,
    lastPurchaseTimestamp: Date.now()
  })
  return leaderboard

}).get("/market/:assetType/:id", async ({ set, params, query }) => {
  const id = decodeURIComponent(params.id);
  console.log("WITH ID", params.assetType, id)
  try {
    const marketData = await fetchMarketData(params.assetType as AssetType, id);
    return marketData;
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
}).get("/mine/pow20/", async ({ params, set }) => {
  // find all the pow20 contracts
  const q = {
    insc: {
      json: { contract: "pow-20" }
    }
  }
  try {
    const b64 = Buffer.from(JSON.stringify(q)).toString("base64")
    const resp = await fetchJSON(`${API_HOST}/api/inscriptions/search?q=${b64}`)

    const tokens: MarketDataV2[] = []
    for (const insc of resp as OrdUtxo[]) {
      // get the token details from redis
      const token = await redis.get(`token-${AssetType.BSV21}-${insc.origin?.data?.bsv20?.id}`)
      if (!token) {
        continue
      }
      tokens.push(JSON.parse(token))
    }
    return tokens
  } catch (e) {
    console.error("Error fetching mine pow20:", e);
    set.status = 500;
    return []
  }
}).get("/mine/pow20/:sym", async ({ params, set }) => {
  // // find all the pow20 contracts in redis that start with the given sym
  const sym = params.sym.toLowerCase()
  const tokens: MarketDataV2[] = []
  console.log("Runging scan...", sym)

  // sym is not in the key itself we have to find it in the data
  const keys = await redis.keys(`token-${AssetType.BSV21}-*`)
  console.log({ keys })
  for (const key of keys) {
    if (!key) {
      continue
    }
    const tokenStr = await redis.get(key)
    if (!tokenStr) {
      continue
    }
    const token = JSON.parse(tokenStr) as MarketDataV2
    if (token.sym.toLowerCase().startsWith(sym)) {
      tokens.push(token)
    }
  }
  return tokens
  // const q = {
  //   insc: {
  //     json: { contract: "pow-20", sym: params.sym }
  //   }
  // }
  // try {
  //   const b64 = Buffer.from(JSON.stringify(q)).toString("base64")
  //   const resp = await fetchJSON(`${API_HOST}/api/inscriptions/search?q=${b64}`)
  //   const tokens: MarketDataV2[] = []
  //   for (const insc of resp as OrdUtxo[]) {
  //     // get the token details from redis
  //     const token = await redis.get(`token-${AssetType.BSV21}-${insc.origin?.data?.bsv20?.id}`)
  //     if (!token) {
  //       continue
  //     }
  //     tokens.push(JSON.parse(token))
  //   }
  //   return tokens
  // } catch (e) {
  //   console.error("Error fetching mine pow20:", e);
  //   set.status = 500;
  //   return []
  // }
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
        const user = await botRedis.get(userKey) as string
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
}).get("/user/:address/balance", async ({ params, set }) => {
  // [
  //   {
  //     "listed": {
  //       "pending": "string",
  //       "confirmed": "string"
  //     },
  //     "all": {
  //       "pending": "string",
  //       "confirmed": "string"
  //     },
  //     "icon": "string",
  //     "dec": 0,
  //     "sym": "string",
  //     "id": "string",
  //     "tick": "string"
  //   }
  // ]
  type Balance = {
    listed: {
      pending: string,
      confirmed: string
    },
    all: {
      pending: string,
      confirmed: string
    },
    icon: string,
    dec: number,
    sym: string,
    id: string,
    tick: string
  }

  interface EnrichedBalance extends Balance {
    price: number
  }

  // wrap the api balance request and enrich w price info from ticker cache
  const resp = await fetchJSON<Balance[]>(`${API_HOST}/api/bsv20/${params.address}/balance`)
  if (!resp) {
    set.status = 404;
    return []
  }

  // enrich with cached pricing data
  const enriched: EnrichedBalance[] = await Promise.all(resp.map(async (b) => {
    const cached = await redis.get(`token-${b.tick ? AssetType.BSV20 : AssetType.BSV21}-${b.tick || b.id}`)
    if (!cached) {
      return { ...b, price: 0 }
    }
    const token = JSON.parse(cached) as MarketDataV1
    return {
      ...b,
      price: token.price
    }
  }))
  return enriched
}).get("/admin/utxo/consolidate/:key", async ({ params, set }) => {

  // key can be either "bot" or "broadcaster"
  // if its "bot" use PAYPK if its "broadcaster" we use FUNDING_WIF
  const key = params.key

  const fundingKey = key === "bot" ? process.env.PAYPK : process.env.BROADCAST_FUNDING_WIF;
  if (!fundingKey) {
    throw new Error("FUNDING_KEY environment variable is not set");
  }

  const privateKey = PrivateKey.from_wif(fundingKey);
  const address = P2PKHAddress.from_pubkey(privateKey.to_public_key());

  // Get all UTXOs from Redis
  let utxos: OrdUtxo[] = [];
  if (key === "bot") {
    const utxosData = await botRedis.get("pay-utxos") as string
    if (!utxosData) {
      throw new Error("No UTXOs found for address")
    }
    utxos = JSON.parse(utxosData) as OrdUtxo[]
  } else {
    // broadcaster does not store utxos in redis, fetch from gorillapool

    try {
      const u = await fetchJSON<OrdUtxo[]>(`${API_HOST}/api/txos/address/${address}/unspent`)
      console.log("Hitting url", u)
      if (!u) {
        throw new Error("No UTXOs found for address")
      }
      utxos = u
    } catch (e) {
      console.error("Error fetching utxos:", e);
      set.status = 500;
      return []
    }
  }
  console.log({ utxos });

  const tx = new Transaction(1, 0);

  let totalSatoshis = 0;
  const txIns: TxIn[] = [];

  for (const utxo of utxos) {
    const txIn = new TxIn(
      Buffer.from(utxo.txid, "hex"),
      utxo.vout,
      Script.from_asm_string("")
    );
    txIn.set_satoshis(BigInt(utxo.satoshis));
    txIns.push(txIn);
    totalSatoshis += utxo.satoshis;
  }

  const feeSats = 20;
  const outputSatoshis = totalSatoshis - feeSats;

  tx.add_output(
    new TxOut(
      BigInt(outputSatoshis),
      address.get_locking_script()
    )
  );

  txIns.forEach((txIn, index) => {
    tx.add_input(txIn);

    const utxo = utxos[index];
    const sig = tx.sign(
      privateKey,
      SigHash.InputOutputs,
      index,
      Script.from_asm_string(utxo.script),
      BigInt(utxo.satoshis)
    );

    txIn.set_unlocking_script(
      Script.from_asm_string(
        `${sig.to_hex()} ${privateKey.to_public_key().to_hex()}`
      )
    );

    tx.set_input(index, txIn);
  });

  const rawTx = tx.to_hex();

  return {
    rawTx,
    size: Math.ceil(rawTx.length / 2),
    fee: feeSats,
    numInputs: tx.get_ninputs(),
    numOutputs: tx.get_noutputs(),
    txid: tx.get_id_hex(),
  };
}).get("/discord/:discordId", async ({ params, set }) => {
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
}).get("/discord/:discordId/check/:txid", async ({ params, set }) => {
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

// Function to fetch and process market data
const findMarketData = async (assetType: AssetType, term: string) => {
  term = term?.toLowerCase();
  const info = await fetchChainInfo()
  switch (assetType) {
    case AssetType.BSV20: {
      let detailedTokensV1: BSV20Details[] = [];
      let resultsv1: MarketDataV1[] = [];
      // if (id) {
      console.log("Finding token details for", term)
      // first we get them from redis autofill
      const results = await findMatchingKeys(redis, "autofill", term, assetType)
      console.log("Found", results.length, "results")
      // then we collect up the ids
      const ids = results.map((r) => r.id)
      detailedTokensV1 = await fetchTokensDetails<BSV20Details>(ids, assetType);
      resultsv1 = await loadV1TickerDetails(detailedTokensV1, info);

      return resultsv1.sort((a, b) => {
        return b.marketCap - a.marketCap;
      });
    }
    case AssetType.BSV21: {
      let detailedTokensV2: BSV21Details[] = [];
      let resultsv2: MarketDataV2[] = [];

      // first we get them from redis autofill
      const results = await findMatchingKeys(redis, "autofill", term, assetType)
      console.log("Found", results.length, "results")
      // then we collect up the ids
      const ids = results.map((r) => r.id)
      detailedTokensV2 = await fetchTokensDetails<BSV21Details>(ids, assetType);

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
