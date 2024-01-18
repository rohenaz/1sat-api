import { Elysia, t } from 'elysia';
import Redis from "ioredis";
import { API_HOST, AssetType } from './constants';
import { BSV20V1, BSV20V2 } from './types/bsv20';

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
      redis.set(`market-${params.assetType}`, JSON.stringify(marketData), "EX", expirateionTime);
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
const fetchJSON = async (url: string) => {
  const response = await fetch(url);
  return response.json();
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

const fetchTokensDetails = async <T extends BSV20V1 | BSV20V2>(tokenIDs: string[], assetType: AssetType): Promise<T[]> => {
  // promise all passed in
  let tokensDetails: T[] = [];

  // use passed in type instead 
  switch (assetType) {
    case AssetType.BSV20:
      tokensDetails = await Promise.all(tokenIDs.map(async (id) => {
        const url = `${API_HOST}/bsv20/tick/FIRE?refresh=false${id}`;
        return await fetchJSON(url) as T;
      }));
      break;
    case AssetType.BSV20V2:
      tokensDetails = await Promise.all(tokenIDs.map(async (id) => {
        const url = `${API_HOST}/bsv20/id/${id}?refresh=false`;
        return await fetchJSON(url) as T;
      }));
      break;
    default:
      break;
  }
  return tokensDetails;
}

// Function to fetch and process market data
const fetchMarketData = async (assetType: AssetType) => {
  const exchangeRate = await fetchExchangeRate();
  let tokens;

  switch (assetType) {
    case AssetType.BSV20:
      const urlV1Tokens = `${API_HOST}/api/bsv20?limit=100&offset=0&sort=height&dir=desc&included=true`;
      const tickersV1 = await fetchJSON(urlV1Tokens) as BSV20V1[];

      const defailedTokensV1 = await fetchTokensDetails<BSV20V1>(tickersV1.map(ticker => ticker.tick), assetType);

      return defailedTokensV1.map(ticker => {
        // Convert price from token sale price to USD
        const priceUSD = parseFloat(ticker.fundTotal) * exchangeRate;

        // Calculate market cap
        const marketCap = priceUSD * parseFloat(ticker.max);
        return {
          tick: ticker.tick,
          price: priceUSD,
          marketCap: marketCap,
          holders: 0, // Replace with actual data if available
        };
      });
    case AssetType.BSV20V2:
      const urlV2Tokens = `${API_HOST}/api/bsv20/v2?limit=20&offset=0&sort=fund_total&dir=desc&included=true`;
      const tickersV2 = await fetchJSON(urlV2Tokens) as BSV20V2[];

      const defailedTokensV2 = await fetchTokensDetails<BSV20V2>(tickersV2.map(ticker => ticker.sym), assetType);
      return defailedTokensV2.map(ticker => {
        const amount = parseFloat(ticker.amt) / Math.pow(10, ticker.dec || 0);
        const price = parseFloat(ticker.fundTotal) * exchangeRate / amount;
        const marketCap = calculateMarketCap(price, amount);
        return {
          tick: ticker.sym,
          price: price,
          marketCap: marketCap,
          holders: 0, // Replace with actual data if available
        };
      });

    default:
      return [{
        tick: "PEPE",
        price: 0.3152226666666666,
        marketCap: 6619675.999999998,
        holders: 208,
      }];
  }
};



const expirateionTime = 60 * 3; // 3 minutes
