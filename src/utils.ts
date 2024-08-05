import { ChainInfo, redis } from ".";
import { API_HOST, AssetType, defaults } from "./constants";
import { BSV20Details, BSV21Details, ListingsV1, ListingsV2 } from "./types/bsv20";

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
export const fetchJSON = async <T>(url: string): Promise<T | null> => {
  try {
    const response = await fetch(url);
    return await response.json() as T;
  } catch (e) {
    console.log("Fetch error", e);
    return null;
  }
};

export const setPctChange = async (id: string, sales: ListingsV1[] | ListingsV2[], currentHeight: number) => {
  const cutoffs = timeframes.map((tf) => currentHeight - Math.floor(tf.value * 144));
  // assuming 144 blocks from current height "currentHeight" is 1 day, calculate cutoffs for each timeframe

  // Filter out sales that are older than the cutoff
  let filteredSales = sales.filter((sale) => sale.height >= cutoffs[4]);
  // TODO: Change this back
  filteredSales = sales;
  if (filteredSales.length > 0) {
    // Parse the price of the most recent sale
    const lastPrice = Number.parseFloat(filteredSales[0].pricePer);
    // Parse the price of the oldest sale
    const firstPrice = Number.parseFloat(
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
// {"hash":"000000000000000009ca1043179f7875ac7f06d6dd681f6e08e8a3d27eda9c23","coin":1,"height":856311,"time":1722861520,"nonce":1463873808,"version":586645504,"merkleroot":"35f4d87332f396c88f352b762d1420afaa45922e069b12d8ad2500cb0990ee20","bits":"180d9c5b","synced":118,"page_size":100000,"page_count":1}

type JBChainInfo = {
  hash: string,
  coin: number,
  height: number,
  time: number,
  nonce: number,
  version: number,
  merkleroot: string,
  bits: string,
  synced: number,
  page_size: number,
  page_count: number
}

export const fetchChainInfo = async (): Promise<ChainInfo> => {
  // check cache
  const cached = await redis.get("chainInfo");
  if (cached) {
    return JSON.parse(cached) as ChainInfo;
  }
  // TODO: We have an endpoint for this now https://junglebus.gorillapool.io/v1/block_header/tip
  // const url = "https://api.whatsonchain.com/v1/bsv/main/chain/info";
  const url = "https://junglebus.gorillapool.io/v1/block_header/tip";
  const chainInfo = await fetchJSON(url) as JBChainInfo | null;
  // WOC Example: {"chain":"main","blocks":856311,"headers":856311,"bestblockhash":"000000000000000009ca1043179f7875ac7f06d6dd681f6e08e8a3d27eda9c23","difficulty":80781276269.82233,"mediantime":1722860434,"verificationprogress":0.9999972495373115,"pruned":false,"chainwork":"0000000000000000000000000000000000000000015aaabd74845149b6938815"}
  const normalChainInfo: ChainInfo = {
    blocks: chainInfo?.height || 0,
    headers: chainInfo?.height || 0,
    bestblockhash: chainInfo?.hash || "",
    chain: "main",
    mediantime: chainInfo?.time || Date.now() / 1000,
  }
  // this one has to update pretty frequently blocks can be found sub-minute
  await redis.set("chainInfo", JSON.stringify(normalChainInfo), "EX", 60);
  return normalChainInfo as ChainInfo || { blocks: 0, headers: 0, bestblockhash: "" };
}


// eg. {"bsv20-deploy":829674,"bsv20":829667,"market-spends":829674,"locks":829674,"opns":829674,"market":829674,"ord":829674}

// each is a JB subscription
interface Stats {
  "bsv20-deploy": number,
  bsv20: number,
  "market-spends": number,
  locks: number,
  opns: number,
  market: number,
  ord: number
}

export const fetchStats = () => {
  const url = `${API_HOST}/api/stats`;
  return fetchJSON<Stats>(url);
}

// Function to fetch exchange rate
export const fetchExchangeRate = async (): Promise<number> => {
  // check cache
  const cached = await redis.get("exchangeRate");
  if (cached) {
    const rate = JSON.parse(cached).rate;
    if (rate) {
      return rate;
    }
  }
  const exchangeRateData = await fetchJSON("https://api.whatsonchain.com/v1/bsv/main/exchangerate") as { rate: number } | null;
  if (!exchangeRateData) {
    return 0;
  }
  await redis.set("exchangeRate", JSON.stringify(exchangeRateData), "EX", defaults.expirationTime);
  return exchangeRateData.rate;
};

export const fetchTokensDetails = async <T extends BSV20Details | BSV21Details>(tokenIDs: string[], assetType: AssetType): Promise<T[]> => {

  const d: T[] = [];
  // use passed in type instead 
  switch (assetType) {
    case AssetType.BSV20:
      // get the last sale price
      for (const tick of tokenIDs) {
        // check cache
        // const cached = await redis.get(`token-${assetType}-${tick.toLowerCase()}`);
        let details: T | null = null;
        // if (cached) {
        //   console.log("Details: Using cached values for", tick)
        //   details = JSON.parse(cached);
        // } else {
        const urlDetails = `${API_HOST}/api/bsv20/tick/${tick}`;
        details = await fetchJSON<T>(urlDetails)
        // }
        if (!details) {
          console.log("Details: No details for", tick)
          continue;
        }

        // const urlSales = `${API_HOST}/api/bsv20/market/sales?dir=desc&limit=20&offset=0&tick=${tick}`;
        // details.sales = (await fetchJSON<ListingsV1[]>(urlSales) || []);

        d.push(details)
        await redis.set(`token-${assetType}-${tick.toLowerCase()}`, JSON.stringify(details)); //, "EX", defaults.expirationTime);
      }
      break;
    case AssetType.BSV21:
      for (const id of tokenIDs) {
        const url = `${API_HOST}/api/bsv20/id/${id}?refresh=false`;
        const details = await fetchJSON<T>(url)
        if (!details) {
          continue;
        }
        // cache
        await redis.set(`token-${assetType}-${id}`, JSON.stringify(details), "EX", defaults.expirationTime);

        d.push(details)
      }
      break;
    default:
      break;
  }

  return d;
}


// Helper function to calculate market cap
export const calculateMarketCap = (price: number, amount: number): number => {
  return (price * amount)
};
