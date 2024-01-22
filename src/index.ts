import { Elysia, t } from 'elysia';
import Redis from "ioredis";
import { uniqBy } from 'lodash';
import { API_HOST, AssetType } from './constants';
import { BSV20V1, BSV20V1Details, BSV20V2, BSV20V2Details, ListingsV1, ListingsV2 } from './types/bsv20';

const redis = new Redis(`${process.env.REDIS_URL}`);

redis.on("connect", () => console.log("Connected to Redis"));
redis.on("error", (err) => console.error("Redis Error", err));

const app = new Elysia().get("/", ({ set }) => {
  set.headers["Content-Type"] = "text/html";
  return `:)`;
}).get('/market/:assetType', async ({ set, params }) => {
  console.log(params.assetType)
  try {
    let market = await redis.get(`market-${params.assetType}`);
    console.log("In cache?", market)
    if (!market) {
      const marketData = await fetchMarketData(params.assetType as AssetType);
      if (marketData) {
        redis.set(`market-${params.assetType}`, JSON.stringify(marketData), "EX", defaults.expirationTime);
      }
      return marketData;
    }
    return JSON.parse(market);
  } catch (e) {
    console.error("Error fetching market data:", e);
    set.status = 500;
    return {};
  }
}, {
  params: t.Object({
    assetType: t.String()
  })
}).get("/market/:assetType/:origin", async ({ set, params }) => {
  console.log(params.assetType)
  try {
    let market = await redis.get(`market-${params.assetType}`);
    console.log("In cache?", market)
    if (!market) {
      const marketData = await fetchMarketData(params.assetType as AssetType, params.origin);
      if (marketData) {
        redis.set(`market-${params.assetType}`, JSON.stringify(marketData), "EX", defaults.expirationTime);
      }
      return marketData;
    }
    return JSON.parse(market);
  } catch (e) {
    console.error("Error fetching market data:", e);
    set.status = 500;
    return {};
  }
}, {
  params: t.Object({
    assetType: t.String(),
    origin: t.String()
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

const fetchChainInfo = async () => {
  // check cache
  const cached = await redis.get(`chainInfo`);
  if (cached) {
    return JSON.parse(cached);
  }
  const url = `https://api.whatsonchain.com/v1/bsv/main/chain/info`;
  const chainInfo = await fetchJSON(url);
  redis.set(`chainInfo`, JSON.stringify(chainInfo), "EX", defaults.expirationTime);
  return chainInfo;
}

// Function to fetch exchange rate
const fetchExchangeRate = async (): Promise<number> => {
  // check cache
  const cached = await redis.get(`exchangeRate`);
  if (cached) {
    return JSON.parse(cached).rate;
  }
  const exchangeRateData = await fetchJSON("https://api.whatsonchain.com/v1/bsv/main/exchangerate") as { rate: number };
  redis.set(`exchangeRate`, JSON.stringify(exchangeRateData), "EX", defaults.expirationTime);
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
      for (const origin of tokenIDs) {

        // check cache
        const cached = await redis.get(`token-${origin}`);
        if (cached) {
          d.push(JSON.parse(cached));
          continue;
        }

        const urlDetails = `${API_HOST}/api/bsv20/tick/${origin}?refresh=false`;
        const details = await fetchJSON<T>(urlDetails)

        // add listings
        const urlListings = `${API_HOST}/api/bsv20/market?sort=price_per_token&dir=asc&limit=20&offset=0&type=v1&tick=${origin}`;
        details.listings = await fetchJSON<ListingsV1[]>(urlListings)

        // add sales
        const urlSales = `${API_HOST}/api/bsv20/market/sales?dir=desc&limit=20&offset=0&type=v1&tick=${origin}`;
        details.sales = await fetchJSON<ListingsV1[]>(urlSales)

        // cache
        redis.set(`token-${origin}`, JSON.stringify(details), "EX", defaults.expirationTime);

        d.push(details)
      }
      break;
    case AssetType.BSV20V2:
      for (const origin of tokenIDs) {
        //check cache 
        const cached = await redis.get(`token-${origin}`);
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
        redis.set(`token-${origin}`, JSON.stringify(details), "EX", defaults.expirationTime);

        d.push(details)
      }
      break;
    default:
      break;
  }

  return d;
}

// Function to fetch and process market data
const fetchMarketData = async (assetType: AssetType, origin?: string) => {

  switch (assetType) {
    case AssetType.BSV20:
      let detailedTokensV1: BSV20V1Details[] = [];
      if (origin) {
        detailedTokensV1 = await fetchTokensDetails<BSV20V1Details>([origin], assetType);
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
          redis.set(`ids-${assetType}`, JSON.stringify(t1), "EX", defaults.expirationTime);
        }
        detailedTokensV1 = await fetchTokensDetails<BSV20V1Details>(t1, assetType);
      }

      return detailedTokensV1.map(ticker => {
        const totalSales = ticker.sales.reduce((acc, sale) => {
          return acc + parseInt(sale.price)
        }, 0);
        const totalAmount = ticker.sales.reduce((acc, sale) => {
          return acc + parseInt(sale.amt) / 10 ** ticker.dec
        }, 0);
        const price = totalAmount > 0 ? totalSales / totalAmount : 0;
        const marketCap = calculateMarketCap(price, parseFloat(ticker.max) / 10 ** ticker.dec);
        const holders = ticker.accounts;
        return {
          ...ticker,
          price,
          marketCap,
          holders,
        };
      });
    case AssetType.BSV20V2:
      let detailedTokensV2: BSV20V2Details[] = [];
      if (origin) {
        detailedTokensV2 = await fetchTokensDetails<BSV20V2Details>([origin], assetType);
      } else {
        let tokenIds: string[] = [];
        // check cache
        const cachedIds = await redis.get(`ids-${assetType}`);
        if (cachedIds) {
          tokenIds = JSON.parse(cachedIds);
        } else {
          const urlV2Tokens = `${API_HOST}/api/bsv20/v2?limit=20&offset=0&sort=fund_total&dir=desc&included=true`;
          const tickersV2 = await fetchJSON<BSV20V2[]>(urlV2Tokens);
          tokenIds = uniqBy(tickersV2, 'id').map(ticker => ticker.id);
          redis.set(`ids-${assetType}`, JSON.stringify(tokenIds), "EX", defaults.expirationTime);
        }

        detailedTokensV2 = await fetchTokensDetails<BSV20V2Details>(tokenIds, assetType);
      }
      return detailedTokensV2.map(ticker => {
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
        const holders = ticker.accounts;
        console.log({ totalSales, totalAmount, price, marketCap, holders, symbol: ticker.sym, dec: ticker.dec, amt: ticker.amt })
        return {
          ...ticker,
          tick: ticker.sym,
          price,
          marketCap,
          holders,
        };
      });

    default:
      return [];
  }
};

const defaults = {
  expirationTime: 60 * 10, // 10 minutes
  resultsPerPage: 20
}