import { Elysia, t } from 'elysia';
import Redis from "ioredis";
import { uniqBy } from "lodash";
import { API_HOST, AssetType } from './constants';
import { BSV20V1, BSV20V1Details, BSV20V2, BSV20V2Details } from './types/bsv20';

const redis = new Redis(`${process.env.REDIS_URL}`);

redis.on("connect", () => console.log("Connected to Redis"));
redis.on("error", (err) => console.error("Redis Error", err));

const app = new Elysia().get("/", ({ set }) => {
  set.headers["Content-Type"] = "text/html";
  return `:)`;
}).get('/market/:assetType', async ({ set, params }) => {
  console.log(params.assetType)
  try {
    let market = await redis.get(`markett-${params.assetType}`);
    console.log("In cache?", market)
    if (!market) {
      const marketData = await fetchMarketData(params.assetType as AssetType);
      console.log("Market data", marketData)
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

  const res = await response.json() as T;
  console.log({ res, url })
  return res;
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

// add generic type

const fetchTokensDetails = async <T extends BSV20V1Details | BSV20V2Details>(tokenIDs: string[], assetType: AssetType): Promise<T[]> => {
  // promise all passed in
  let tokensDetails: T[] = [];

  // use passed in type instead 
  switch (assetType) {
    case AssetType.BSV20:
      // get the last sale price
      tokensDetails = await Promise.all(tokenIDs.map(async (id) => {
        const urlPrice = `${API_HOST}/api/bsv20/market?sort=price_per_token&dir=asc&limit=1&offset=0&type=all&tick=${id}`;
        const lastSales = await fetchJSON<BSV20V1[]>(urlPrice);
        console.log({ lastSales })
        const url = `${API_HOST}/api/bsv20/tick/FIRE?refresh=false${id}`;
        const details = await fetchJSON(url) as T;
        return details
      }));
      break;
    case AssetType.BSV20V2:
      let promises: Promise<T>[] = [];
      tokenIDs.forEach(id => {
        const url = `${API_HOST}/api/bsv20/id/${id}?refresh=false`;
        promises.push(fetchJSON<T>(url))
      })
      tokensDetails = await Promise.all<T>(promises);
      break;
    default:
      break;
  }
  return tokensDetails;
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

      return detailedTokensV1.map(ticker => {
        // Convert price from token sale price to USD
        const priceUSD = parseFloat(ticker.fundTotal) * exchangeRate;

        // Calculate market cap
        const marketCap = priceUSD * parseFloat(ticker.max);
        const holders = ticker.accounts;
        return {
          tick: ticker.tick,
          price: priceUSD,
          marketCap,
          holders,
        };
      });
    case AssetType.BSV20V2:
      const urlV2Tokens = `${API_HOST}/api/bsv20/v2?limit=20&offset=0&sort=fund_total&dir=desc&included=true`;
      const tickersV2 = await fetchJSON<BSV20V2[]>(urlV2Tokens);

      const tokenIds = uniqBy(tickersV2, 'id').map(ticker => ticker.id);
      console.log({ tokenIds })
      const detailedTokensV2 = await fetchTokensDetails<BSV20V2Details>(tokenIds, assetType);
      console.log({ detailedTokensV2 })
      return detailedTokensV2.map(ticker => {
        const amount = parseFloat(ticker.amt) / Math.pow(10, ticker.dec || 0);
        const price = parseFloat(ticker.fundTotal) * exchangeRate / amount;
        const marketCap = calculateMarketCap(price, amount);
        const holders = ticker.accounts;
        return {
          tick: ticker.sym,
          price: price,
          marketCap: marketCap,
          holders,
        };
      });

    default:
      return [];
  }
};



const expirateionTime = 60 * 3; // 3 minutes
