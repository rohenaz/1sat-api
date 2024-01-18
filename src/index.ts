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
    let market = await redis.get(`markes-${params.assetType}`);
    console.log("In cache?", market)
    if (!market) {
      const marketData = await fetchMarketData(params.assetType as AssetType);
      if (marketData) {
        redis.set(`market-${params.assetType}`, JSON.stringify(marketData), "EX", expirateionTime);
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

// Function to fetch exchange rate
const fetchExchangeRate = async (): Promise<number> => {
  const exchangeRateData = await fetchJSON("https://api.whatsonchain.com/v1/bsv/main/exchangerate") as { rate: number };
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
      for (const id of tokenIDs) {
        const urlDetails = `${API_HOST}/api/bsv20/tick/${id}?refresh=false`;
        const details = await fetchJSON<T>(urlDetails)

        // add listings
        const urlListings = `${API_HOST}/api/bsv20/market?sort=price_per_token&dir=asc&limit=20&offset=0&type=v1&tick=${id}`;
        details.listings = await fetchJSON<ListingsV1[]>(urlListings)

        // add sales
        const urlSales = `${API_HOST}/api/bsv20/market/sales?dir=desc&limit=20&offset=0&type=v1&tick=${id}`;
        details.sales = await fetchJSON<ListingsV1[]>(urlSales)

        d.push(details)
      }
      break;
    case AssetType.BSV20V2:
      for (const id of tokenIDs) {
        const url = `${API_HOST}/api/bsv20/id/${id}?refresh=false`;
        const details = await fetchJSON<T>(url)

        // add listings
        const urlListings = `${API_HOST}/api/bsv20/market?sort=price_per_token&dir=asc&limit=20&offset=0&type=v2&id=${id}`;
        details.listings = await fetchJSON<ListingsV2[]>(urlListings)

        // add sales
        const urlSales = `${API_HOST}/api/bsv20/market/sales?dir=desc&limit=20&offset=0&type=v2&id=${id}`;
        details.sales = await fetchJSON<ListingsV2[]>(urlSales)

        d.push(details)
      }
      break;
    default:
      break;
  }

  return d;
}

// Function to fetch and process market data
const fetchMarketData = async (assetType: AssetType) => {
  const exchangeRate = await fetchExchangeRate();
  switch (assetType) {
    case AssetType.BSV20:
      const urlV1Tokens = `${API_HOST}/api/bsv20?limit=100&offset=0&sort=height&dir=desc&included=true`;
      const tickersV1 = await fetchJSON<BSV20V1[]>(urlV1Tokens);
      const t1 = uniqBy(tickersV1, 'tick').map(ticker => ticker.tick);
      const detailedTokensV1 = await fetchTokensDetails<BSV20V1Details>(t1, assetType);
      console.log({ detailedTokensV1 })
      return detailedTokensV1.map(ticker => {

        const totalSales = ticker.sales.reduce((acc, sale) => {
          return acc + parseInt(sale.price)
        }, 0);
        const totalAmount = ticker.sales.reduce((acc, sale) => {
          return acc + parseInt(sale.amt)
        }, 0);
        const price = totalSales / totalAmount;
        const marketCap = calculateMarketCap(price, parseFloat(ticker.max));
        const holders = ticker.accounts;
        return {
          tick: ticker.tick,
          price,
          marketCap,
          holders,
          listings: ticker.listings
        };
      });
    case AssetType.BSV20V2:
      const urlV2Tokens = `${API_HOST}/api/bsv20/v2?limit=1&offset=0&sort=fund_total&dir=desc&included=true`;
      const tickersV2 = await fetchJSON<BSV20V2[]>(urlV2Tokens);
      const tokenIds = uniqBy(tickersV2, 'id').map(ticker => ticker.id);
      const detailedTokensV2 = await fetchTokensDetails<BSV20V2Details>(tokenIds, assetType);
      return detailedTokensV2.map(ticker => {
        // average price per unit bassed on last 10 sales
        console.log({ sales: ticker.sales })

        // add up total price and divide by the amount to get an average price
        const totalSales = ticker.sales.reduce((acc, sale) => {
          return acc + parseInt(sale.price)
        }, 0);
        const totalAmount = ticker.sales.reduce((acc, sale) => {
          return acc + parseInt(sale.amt) / 10 ** ticker.dec
        }, 0);
        const price = totalSales / totalAmount;
        const marketCap = calculateMarketCap(price, parseFloat(ticker.amt));
        const holders = ticker.accounts;
        return {
          tick: ticker.sym,
          price,
          marketCap: marketCap,
          holders,
          listings: ticker.listings,
          sales: ticker.sales
        };
      });

    default:
      return [];
  }
};

const expirateionTime = 60 * 3; // 3 minutes
