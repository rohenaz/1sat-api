import { basicAuth } from '@eelkevdbos/elysia-basic-auth';
import { cors } from '@elysiajs/cors';
import { P2PKHAddress, PrivateKey, Script, SigHash, Transaction, TxIn, TxOut } from 'bsv-wasm';
import { Elysia, t } from 'elysia';
import Redis from "ioredis";
import type { Utxo } from 'js-1sat-ord';
import { fetchCollectionItems, fetchCollectionMarket, fetchCollectionSales } from './collection';
import { API_HOST, AssetType, NUMBER_OF_ITEMS_PER_PAGE, defaults } from './constants';
import { findMatchingKeys, findMatchingKeysWithOffset, findOneExactMatchingKey } from './db';
import { fetchV1Tickers, fetchV2Tickers, loadAllV1Names, loadIncludedV2Names, loadV1TickerDetails, loadV2TickerDetails } from './init';
import { sseInit } from './sse';
import { createAirdropTx } from './tx';
import { type BSV20, type BSV20Details, type BSV21Details, type MarketDataV1, type MarketDataV2, SortBy } from './types/bsv20';
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
    const response = await fetch(`${API_HOST}/inscriptions/${collectionId}`);
    const collectionData = await response.json() as any;

    // Store the collection data in a hash
    if (response.status === 200) {

      // get the stats for the collection
      const stats = await fetchJSON(`${API_HOST}/collections/${collectionId}/stats`);
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
    return items
  } catch (e) {
    console.error("Error fetching collection items:", e);
    set.status = 500;
    return [];
  }
}).get('/market/:assetType', async ({ set, params, query }) => {
  // sort can be name, market_cap, price, pct_change, holders, most_recent_sale (default)
  const { limit = NUMBER_OF_ITEMS_PER_PAGE.toString(), offset = "0", sort = SortBy.MostRecentSale, dir = "asc" } = query;
  console.log({ query });

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

      const compareByNum = (propName: keyof (MarketDataV1)): number => {
        const aProp = Number((a as MarketDataV1)[propName] || 0);
        const bProp = Number((b as MarketDataV1)[propName] || 0);
        return aProp - bProp;
      };

      const compareByNumber = (propName: keyof (MarketDataV1 | MarketDataV2)): number => {
        const aProp = Number((a as MarketDataV1 | MarketDataV2)[propName] || 0);
        const bProp = Number((b as MarketDataV1 | MarketDataV2)[propName] || 0);
        return aProp - bProp;
      };

      const compareByHolders = (): number => {
        const aHolders = (a as MarketDataV1 | MarketDataV2).accounts || 0;
        const bHolders = (b as MarketDataV1 | MarketDataV2).accounts || 0;
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
        num: () => compareByNum("num"),
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
}).get("/mine/pow20/latest/:id/", async ({ params, set }) => {
  console.log("/mine/pow20/latest/:id/", { params })
  // find the latest txo for the given pow20 contract
  const id = decodeURIComponent(params.id)
  const url = `${API_HOST}/inscriptions/${id}/latest?script=true`
  console.log("Hitting url", url)
  try {
    const resp = await fetchJSON<OrdUtxo>(url)
    console.log({ resp })
    if (resp?.owner) {
      redis.sadd('pow20-exhausted', id)
    }
    return resp
  } catch (e) {
    console.error("Error fetching mine pow20:", e);
    set.status = 500;
    return []
  }
}).get("/mine/pow20/", async ({ params, set }) => {
  // find all the pow20 contracts
  const q = {
    insc: {
      json: { contract: "pow-20" }
    }
  }
  try {
    const b64 = Buffer.from(JSON.stringify(q)).toString("base64")
    const resp = await fetchJSON(`${API_HOST}/txos/search/unspent?q=${b64}`)
    const tokens: MarketDataV2[] = []
    for (const insc of resp as OrdUtxo[]) {
      // get the token details from redis
      const id = insc.origin?.data?.bsv20?.id
      if (!id || await redis.sismember('pow20-exhausted', id)) {
        continue
      }
      const token = await redis.get(`token-${AssetType.BSV21}-${id}`)
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
}).get("/mine/pow20/search/:sym", async ({ params, set }) => {
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
  //   const resp = await fetchJSON(`${API_HOST}/inscriptions/search?q=${b64}`)
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
}).post("/airdrop/private/:airdropId", async ({ params, body }) => {
  // get the password from the body
  const password = body.password
  // check the password
  if (password !== process.env.AIRDROP_PASSWORD) {
    return {
      error: "incorrect password"
    }
  }

  // Fetch UTXOs from Redis
  // const paymentUtxosJson = await redisClient.get("pay-utxos");
  const paymentUtxosJson = await botRedis.hgetall("pay-utxos");

  // const tokenUtxosJson = await redisClient.get("ord-utxos");
  const tokenUtxosJson = await botRedis.hgetall("ord-utxos");
  if (!paymentUtxosJson || !tokenUtxosJson)
    throw new Error("Missing UTXOs in Redis");
  const paymentUtxos = Object.values(paymentUtxosJson).map(
    (payUtxosJson) => JSON.parse(payUtxosJson) as Utxo
  ); // const inputTokens = JSON.parse(tokenUtxosJson) as BSV20[];
  const inputTokens = Object.values(tokenUtxosJson).map(
    (tokenUtxosJson) => JSON.parse(tokenUtxosJson) as BSV20
  );

  // get the event id
  const airdropId = params.airdropId

  const to = body.to

  const { rawTx, txid, spend } = await createAirdropTx(to, 50, paymentUtxos, inputTokens)
  console.log({ rawTx, txid, spend })
  return {
    rawTx, txid, spend
  }
}, {
  body: t.Object({
    password: t.String(),
    to: t.String()
  }),
  params: t.Object({
    airdropId: t.String()
  })
}).get("/status", async ({ set }) => {
  set.headers["Content-Type"] = "application/json";
  // get chaininfo from cache
  const chainInfoStr = await redis.get("chain-info")
  let chainInfo: ChainInfo = JSON.parse(chainInfoStr || "{}")
  try {
    chainInfo = await fetchChainInfo();
    // cache for 5 minutes
    await redis.set("chain-info", JSON.stringify(chainInfo), "EX", 60 * 5);
  } catch (e) {
    console.error("Error fetching chain info:", e);
  }

  // get exchange rate from cache
  const exchangeRateStr = await redis.get("exchangeRate")
  let exchangeRate = JSON.parse(exchangeRateStr || "{}")
  try {
    exchangeRate = await fetchExchangeRate();
    // cache for 5 minutes
    await redis.set("exchangeRate", JSON.stringify(exchangeRate), "EX", 60 * 5);
  } catch (e) {
    console.error("Error fetching exchange rate:", e);
  }
  const statsStr = await redis.get("indexers")
  let indexers = JSON.parse(statsStr || "{}")
  try {
    indexers = await fetchStats()
    // cache for 5 minutes
    await redis.set("indexers", JSON.stringify(indexers), "EX", 60 * 5);
  } catch (e) {
    console.error("Error fetching stats", e)
  }
  // return the chain info, fresh, or cached in case of failure
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
  const resp = await fetchJSON<Balance[]>(`${API_HOST}/bsv20/${params.address}/balance`)
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
}).get("/admin/utxo/consolidate/:key", async ({ params, set, query }) => {

  const evilUtxos: string[] = query.exclude?.split(",") || ["cf86adda3cf3926838b469b1b19c4fa447602186b98b68cb1a893d1d8223ae89"]

  // txid: "559864a5c74186f0680ce6d769a287c02277075d0af7f1b3c308d61ee522c20f",
  // vout: 2,
  // outpoint: "559864a5c74186f0680ce6d769a287c02277075d0af7f1b3c308d61ee522c20f_2",
  // satoshis: 2,
  // accSats: "2",
  // height: 844724,
  // idx: "254",
  // owner: "13RFswAAjAEcwzb2uP7PvNxCoS9hhqonQ7",
  // spend: "",
  // spend_height: null,
  // spend_idx: null,

  // key can be either "bot" or "broadcaster"
  // if its "bot" use PAYPK if its "broadcaster" we use FUNDING_WIF
  const key = params.key
  const limit = query.limit || 1000
  const fundingKey = key === "bot" ? process.env.PAYPK : process.env.BROADCAST_FUNDING_WIF2;
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
      const url = `${API_HOST}/api/txos/address/${address.to_string()}/unspent?limit=${limit}&refresh=true`
      const u = await fetchJSON<OrdUtxo[]>(url)
      console.log("Hitting url", url, "with address", address.to_string())
      if (!u) {
        throw new Error("No UTXOs found for address")
      }
      utxos = u.filter((o) => !evilUtxos.includes(o.txid))
    } catch (e) {
      console.error("Error fetching utxos:", e);
      set.status = 500;
      return []
    }
  }
  // console.log({ utxos });

  const tx = new Transaction(1, 0);

  let totalSatoshis = 0;
  const txIns: TxIn[] = [];

  for (const utxo of utxos) {
    const txIn = new TxIn(
      Buffer.from(utxo.txid, "hex"),
      utxo.vout,
      address.get_locking_script()
    );
    txIn.set_satoshis(BigInt(utxo.satoshis));
    txIns.push(txIn);
    totalSatoshis += utxo.satoshis;
  }

  const feeSats = Math.ceil(txIns.length / 5)
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
      address.get_locking_script(),
      BigInt(utxo.satoshis)
    );

    txIn.set_unlocking_script(
      Script.from_asm_string(
        `${sig.to_hex()} ${privateKey.to_public_key().to_hex()}`
      )
    );

    tx.set_input(index, txIn);
  });

  const rawTx = Buffer.from(tx.to_bytes()).toString("base64")

  // return {
  //   rawTx,
  //   size: Math.ceil(rawTx.length / 2),
  //   fee: feeSats,
  //   numInputs: tx.get_ninputs(),
  //   numOutputs: tx.get_noutputs(),
  //   txid: tx.get_id_hex(),
  // };
  return rawTx
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

// WOC Example: {"chain":"main","blocks":856311,"headers":856311,"bestblockhash":"000000000000000009ca1043179f7875ac7f06d6dd681f6e08e8a3d27eda9c23","difficulty":80781276269.82233,"mediantime":1722860434,"verificationprogress":0.9999972495373115,"pruned":false,"chainwork":"0000000000000000000000000000000000000000015aaabd74845149b6938815"}
export type ChainInfo = {
  chain: string,
  blocks: number,
  headers: number,
  bestblockhash: string,
  difficulty?: number,
  mediantime: number,
  verificationprogress?: number,
  pruned?: boolean,
  chainwork?: string,
}

// if (type === AssetType.BSV21) {
//   const urlTokens = `${API_HOST}/bsv20/market?sort=price_per_token&dir=asc&limit=20&offset=0&type=v1`;
//   const { promise: promiseBsv20 } = http.customFetch<BSV20TXO[]>(urlTokens);
//   marketData.listings = await promiseBsv20;
// } else {
//   const urlV2Tokens = `${API_HOST}/bsv20/market?sort=price_per_token&dir=asc&limit=20&offset=0&type=v2`;
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
        const token = JSON.parse(cached) as MarketDataV1;
        // console.log(key, value)

        // can we limit this to 1 result
        const cachedListings = await redis.keys(`listings-${AssetType.BSV20}-${tick}`)
        // only push if there are open listings
        if (cachedListings.length > 0) {
          tv1.push(token);
        }
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

        const cachedListings = await redis.keys(`listings-${AssetType.BSV21}-${id}`)
        // only push if there are open listings
        if (cachedListings.length > 0) {
          tv2.push(token);
        }
      }
      return tv2;
    }
    default:
      break;
  }
}
