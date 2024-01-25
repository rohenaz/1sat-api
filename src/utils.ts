import { ChainInfo, redis } from ".";
import { defaults } from "./constants";
import { ListingsV1, ListingsV2 } from "./types/bsv20";

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



// Helper function to fetch JSON
export const fetchJSON = async <T>(url: string): Promise<T> => {
  const response = await fetch(url);
  return await response.json() as T;
};



export const setPctChange = async (id: string, sales: ListingsV1[] | ListingsV2[], currentHeight: number) => {
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
export const getPctChange = async (id: string) => {

  const timeframe = timeframes[4].label.toLowerCase();

  // check cache
  const cached = await redis.get(`pct-${timeframe}-${id.toLowerCase()}`);
  if (cached) {
    return JSON.parse(cached);
  }

}



export const fetchChainInfo = async (): Promise<ChainInfo> => {
  // check cache
  const cached = await redis.get(`chainInfo`);
  if (cached) {
    return JSON.parse(cached) as ChainInfo;
  }
  // TODO: We have an endpoint for this now https://junglebus.gorillapool.io/v1/block_header/tip
  const url = `https://api.whatsonchain.com/v1/bsv/main/chain/info`;
  const chainInfo = await fetchJSON(url);
  await redis.set(`chainInfo`, JSON.stringify(chainInfo), "EX", defaults.expirationTime);
  return chainInfo as ChainInfo;
}

// Function to fetch exchange rate
export const fetchExchangeRate = async (): Promise<number> => {
  // check cache
  const cached = await redis.get(`exchangeRate`);
  if (cached) {
    return JSON.parse(cached).rate;
  }
  const exchangeRateData = await fetchJSON("https://api.whatsonchain.com/v1/bsv/main/exchangerate") as { rate: number };
  await redis.set(`exchangeRate`, JSON.stringify(exchangeRateData), "EX", defaults.expirationTime);
  return exchangeRateData.rate;
};