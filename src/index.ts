import { Elysia, t } from 'elysia';
import Redis from "ioredis";
import { uniqBy } from 'lodash';
import { API_HOST, AssetType } from './constants';
import { BSV20V1, BSV20V1Details, BSV20V2, BSV20V2Details, ListingsV1, ListingsV2 } from './types/bsv20';

const redis = new Redis(`${process.env.REDIS_URL}`);

redis.on("connect", () => console.log("Connected to Redis"));
redis.on("error", (err) => console.error("Redis Error", err));

interface MarketDataV2 extends BSV20V2Details {
  price: number;
  marketCap: number;
  pctChange: number;
}

interface MarketDataV1 extends BSV20V1Details {
  price: number;
  marketCap: number;
  pctChange: number;
}

const app = new Elysia().get("/", ({ set }) => {
  set.headers["Content-Type"] = "text/html";
  return `:)`;
}).get('/market/:assetType', async ({ set, params }) => {
  console.log(params.assetType)
  try {
    // let market = await redis.get(`market-${params.assetType}`);
    // console.log("In cache?", market)
    // if (!market) {
    const marketData = await fetchShallowMarketData(params.assetType as AssetType);
    // if (marketData) {
    //   await redis.set(`market-${params.assetType}`, JSON.stringify(marketData), "EX", defaults.expirationTime);
    // }
    console.log("marketData", marketData)
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
  params: t.Object({
    assetType: t.String()
  })
}).get("/market/:assetType/:id", async ({ set, params }) => {
  console.log("WITH ID", params.assetType, params.id)
  try {
    const marketData = await fetchMarketData(params.assetType as AssetType, params.id);
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
  })
}).get("/status", async ({ set }) => {
  const chainInfo = await fetchChainInfo();
  const exchangeRate = await fetchExchangeRate();
  return {
    chainInfo,
    exchangeRate
  };
}).listen(process.env.PORT ?? 3000);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);

// Helper function to fetch JSON
const fetchJSON = async <T>(url: string): Promise<T> => {
  const response = await fetch(url);
  return await response.json() as T;
};

// Helper function to calculate market cap
const calculateMarketCap = (price: number, amount: number): number => {
  return price * amount;
};

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

const fetchChainInfo = async (): Promise<ChainInfo> => {
  // check cache
  const cached = await redis.get(`chainInfo`);
  if (cached) {
    return JSON.parse(cached) as ChainInfo;
  }
  const url = `https://api.whatsonchain.com/v1/bsv/main/chain/info`;
  const chainInfo = await fetchJSON(url);
  await redis.set(`chainInfo`, JSON.stringify(chainInfo), "EX", defaults.expirationTime);
  return chainInfo as ChainInfo;
}

// Function to fetch exchange rate
const fetchExchangeRate = async (): Promise<number> => {
  // check cache
  const cached = await redis.get(`exchangeRate`);
  if (cached) {
    return JSON.parse(cached).rate;
  }
  const exchangeRateData = await fetchJSON("https://api.whatsonchain.com/v1/bsv/main/exchangerate") as { rate: number };
  await redis.set(`exchangeRate`, JSON.stringify(exchangeRateData), "EX", defaults.expirationTime);
  return exchangeRateData.rate;
};


// if (type === AssetType.BSV20V2) {
//   const urlTokens = `${API_HOST}/api/bsv20/market?sort=price_per_token&dir=asc&limit=20&offset=0&type=v1`;
//   const { promise: promiseBsv20 } = http.customFetch<BSV20TXO[]>(urlTokens);
//   marketData.listings = await promiseBsv20;
// } else {
//   const urlV2Tokens = `${API_HOST}/api/bsv20/market?sort=price_per_token&dir=asc&limit=20&offset=0&type=v2`;
//   const { promise: promiseBsv20v2 } =
//     http.customFetch<BSV20TXO[]>(urlV2Tokens);
//   listings = await promiseBsv20v2;
// }



const fetchTokensDetails = async <T extends BSV20V1Details | BSV20V2Details>(tokenIDs: string[], assetType: AssetType): Promise<T[]> => {

  let d: T[] = [];
  // use passed in type instead 
  switch (assetType) {
    case AssetType.BSV20:
      // get the last sale price
      for (const tick of tokenIDs) {

        // check cache
        const cached = await redis.get(`token-${assetType}-${tick}`);
        if (cached) {
          console.log("data from cache")
          d.push(JSON.parse(cached));
          continue;
        }

        const urlDetails = `${API_HOST}/api/bsv20/tick/${tick}?refresh=false`;
        const details = await fetchJSON<T>(urlDetails)

        // add listings
        const urlListings = `${API_HOST}/api/bsv20/market?sort=price_per_token&dir=asc&limit=20&offset=0&tick=${tick}`;
        details.listings = await fetchJSON<ListingsV1[]>(urlListings)

        // add sales
        const urlSales = `${API_HOST}/api/bsv20/market/sales?dir=desc&limit=20&offset=0&tick=${tick}`;
        details.sales = await fetchJSON<ListingsV1[]>(urlSales)

        // cache
        await redis.set(`token-${assetType}-${tick}`, JSON.stringify(details), "EX", defaults.expirationTime);

        console.log({ details, urlDetails, urlListings, urlSales })
        d.push(details)
      }
      break;
    case AssetType.BSV20V2:
      for (const origin of tokenIDs) {
        //check cache 
        const cached = await redis.get(`token-${assetType}-${origin}`);
        if (cached) {
          d.push(JSON.parse(cached));
          continue;
        }

        const url = `${API_HOST}/api/bsv20/id/${origin}?refresh=false`;
        const details = await fetchJSON<T>(url)

        // add listings
        const urlListings = `${API_HOST}/api/bsv20/market?sort=price_per_token&dir=asc&limit=20&offset=0&type=v2&id=${origin}`;
        details.listings = await fetchJSON<ListingsV2[]>(urlListings)

        // add sales
        const urlSales = `${API_HOST}/api/bsv20/market/sales?dir=desc&limit=20&offset=0&type=v2&id=${origin}`;
        details.sales = await fetchJSON<ListingsV2[]>(urlSales)

        // cache
        await redis.set(`token-${assetType}-${origin}`, JSON.stringify(details), "EX", defaults.expirationTime);

        d.push(details)
      }
      break;
    default:
      break;
  }

  return d;
}

// Function to fetch and process market data
const fetchMarketData = async (assetType: AssetType, id?: string) => {
  id = id?.toLowerCase();
  switch (assetType) {
    case AssetType.BSV20:
      let detailedTokensV1: BSV20V1Details[] = [];
      if (id) {
        detailedTokensV1 = await fetchTokensDetails<BSV20V1Details>([id], assetType);
      } else {
        // check cache
        const cached = await redis.get(`ids-${assetType}`);
        let t1: string[] = [];
        if (cached) {
          t1 = JSON.parse(cached);
        } else {
          // TODO: I'm fetching these tokens here just to get the list of ids to then fetch details. Very inefficient
          const urlV1Tokens = `${API_HOST}/api/bsv20?limit=20&offset=0&sort=height&dir=desc&included=true`;
          const tickersV1 = await fetchJSON<BSV20V1[]>(urlV1Tokens);
          t1 = uniqBy(tickersV1, 'tick').map(ticker => ticker.tick);
          // cache
          await redis.set(`ids-${assetType}`, JSON.stringify(t1), "EX", defaults.expirationTime);
        }
        detailedTokensV1 = await fetchTokensDetails<BSV20V1Details>(t1, assetType);
      }

      let tokensV1: MarketDataV1[] = [];
      for (const ticker of detailedTokensV1) {
        const totalSales = ticker.sales.reduce((acc, sale) => {
          return acc + parseInt(sale.price)
        }, 0);
        const totalAmount = ticker.sales.reduce((acc, sale) => {
          return acc + parseInt(sale.amt) / 10 ** ticker.dec
        }, 0);
        const price = totalAmount > 0 ? totalSales / totalAmount : 0;
        const marketCap = calculateMarketCap(price, parseFloat(ticker.max) / 10 ** ticker.dec);

        const pctChange = await setPctChange(ticker.tick, ticker.sales, 0);


        tokensV1.push({
          ...ticker,
          price,
          marketCap,
          pctChange,
        });
      }

      return tokensV1.sort((a, b) => {
        return b.marketCap - a.marketCap;
      });
    case AssetType.BSV20V2:
      let detailedTokensV2: BSV20V2Details[] = [];
      if (id) {
        // id is origin for v2
        detailedTokensV2 = await fetchTokensDetails<BSV20V2Details>([id], assetType);
      } else {
        let tokenIds: string[] = [];
        // check cache
        const cachedIds = await redis.get(`ids-${assetType}`);
        if (cachedIds) {
          tokenIds = JSON.parse(cachedIds);
        } else {
          const urlV2Tokens = `${API_HOST}/api/bsv20/v2?limit=20&offset=0&sort=fund_total&dir=desc&included=true`;
          const tickersV2 = await fetchJSON<BSV20V2[]>(urlV2Tokens);
          tokenIds = uniqBy(tickersV2, 'id').map(ticker => ticker.id.toLowerCase());
          await redis.set(`ids-${assetType}`, JSON.stringify(tokenIds), "EX", defaults.expirationTime);
        }

        detailedTokensV2 = await fetchTokensDetails<BSV20V2Details>(tokenIds, assetType);
      }

      const info = await fetchChainInfo()
      let tokens: MarketDataV2[] = [];
      detailedTokensV2.forEach(async (ticker) => {
        // average price per unit bassed on last 10 sales

        // add up total price and divide by the amount to get an average price
        const totalSales = ticker.sales.reduce((acc, sale) => {
          return acc + parseInt(sale.price)
        }, 0);
        const totalAmount = ticker.sales.reduce((acc, sale) => {
          return acc + parseInt(sale.amt) / 10 ** ticker.dec
        }, 0);
        const price = totalAmount > 0 ? totalSales / totalAmount : 0;
        const marketCap = calculateMarketCap(price, parseFloat(ticker.amt) / 10 ** ticker.dec);
        console.log({ totalSales, totalAmount, price, marketCap, symbol: ticker.sym, dec: ticker.dec, amt: ticker.amt })


        const pctChange = await calculatePctChange({ id: ticker.id, sales: ticker.sales, currentHeight: info.blocks });

        tokens.push({
          ...ticker,
          price,
          marketCap,
          pctChange,
        });
      });
      return tokens

    default:
      return [];
  }
};

const fetchShallowMarketData = async (assetType: AssetType) => {
  switch (assetType) {
    case AssetType.BSV20:
      let tickers: MarketDataV1[] = [];
      // check cache
      const cached = await redis.get(`tickers-${assetType}`);

      if (cached) {
        tickers = JSON.parse(cached);
      } else {
        const urlV1Tokens = `${API_HOST}/api/bsv20?limit=20&offset=0&sort=height&dir=desc&included=true`;
        const tickersV1 = await fetchJSON<BSV20V1[]>(urlV1Tokens);
        const info = await fetchChainInfo()
        for (const ticker of tickersV1) {
          // TODO: Set price
          const price = 0
          const marketCap = calculateMarketCap(price, parseFloat(ticker.max) / 10 ** ticker.dec);
          const pctChange = await getPctChange(ticker.tick, info.blocks);

          tickers.push({
            price,
            marketCap,
            accounts: '',
            pending: '',
            pendingOps: '',
            listings: [],
            sales: [],
            ...ticker,
            pctChange,
          });
        }
        // cache
        await redis.set(`tickers-${assetType}`, JSON.stringify(tickers), "EX", defaults.expirationTime);
      }
      return tickers
    case AssetType.BSV20V2:
      let tickersV2: MarketDataV2[] = [];
      let tokenIds: string[] = [];
      // check cache
      const cachedIds = await redis.get(`ids-${assetType}`);
      if (cachedIds) {
        tokenIds = JSON.parse(cachedIds);
      } else {
        const urlV2Tokens = `${API_HOST}/api/bsv20/v2?limit=20&offset=0&sort=fund_total&dir=desc&included=true`;
        const tickersV2 = await fetchJSON<BSV20V2[]>(urlV2Tokens);
        tokenIds = uniqBy(tickersV2, 'id').map(ticker => ticker.id);
        await redis.set(`ids-${assetType}`, JSON.stringify(tokenIds), "EX", defaults.expirationTime);

      }
      return tickersV2;
    default:
      break;
  }
}

const defaults = {
  expirationTime: 60 * 10, // 10 minutes
  resultsPerPage: 20
}


const setPctChange = async (id: string, sales: ListingsV1[] | ListingsV2[], currentHeight: number) => {
  const cutoffs = timeframes.map((tf) => currentHeight - tf.value * 144);
  // assuming 144 blocks from current height "currentHeight" is 1 day, calculate cutoffs for each timeframe

  // Filter out sales that are older than the cutoff
  let filteredSales = sales.filter((sale) => sale.height >= cutoffs[4]);
  if (filteredSales.length > 0) {
    // Parse the price of the most recent sale
    const lastPrice = parseFloat(filteredSales[0].pricePer);
    // Parse the price of the oldest sale
    const firstPrice = parseFloat(
      filteredSales[filteredSales.length - 1].pricePer
    );
    const pctChange = ((lastPrice - firstPrice) / firstPrice) * 100;
    console.log({ lastPrice, firstPrice, pctChange });
    // cache the pct for the ticker
    await redis.set(`pct-${timeframes[4].label.toLowerCase()}-${id.toLowerCase()}`, pctChange, "EX", defaults.expirationTime);
    // Calculate the percentage change
    return pctChange;
  }
  return 0;
}

// pasing in sales will save the value to cache
// omitting sales will check cache for value
const getPctChange = async (id: string) => {

  const timeframe = timeframes[4].label.toLowerCase();

  // check cache
  const cached = await redis.get(`pct-${timeframe}-${id.toLowerCase()}`);
  if (cached) {
    return JSON.parse(cached);
  }

}

type Timeframe = {
  label: string;
  value: number;
};

const timeframes: Timeframe[] = [
  { label: "1H", value: 0.041667 },
  { label: "3H", value: 0.125 },
  { label: "1D", value: 1 },
  { label: "1W", value: 7 },
  { label: "1M", value: 30 },
  { label: "1Y", value: 365 },
  { label: "ALL", value: 9999 },
];