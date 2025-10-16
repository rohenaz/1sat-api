import { redis } from "..";
import type { BsvUsdRate } from "./rates";

interface QuotesObject {
  BSV: {
    price: number;
    market_cap?: number;
  };
  USD: {
    price: number;
    market_cap?: number;
  };
}

/**
 * Fetches the current BSV/USD rate from our enhanced rate service
 */
async function getBsvUsdRate(): Promise<number> {
  try {
    const rateStr = await redis.get("bsv_usd_rate:current");
    if (rateStr) {
      const rate = JSON.parse(rateStr) as BsvUsdRate;
      return rate.rate;
    }
  } catch (e) {
    console.error("Error fetching BSV/USD rate:", e);
  }
  return 0;
}

/**
 * Adds USD quotes to market data items
 * Maintains 100% backward compatibility by only adding new fields
 */
export async function addUsdQuotesToMarketData<T extends { price: number; marketCap?: number }>(
  items: T[],
): Promise<(T & { quotes?: QuotesObject })[]> {
  try {
    const bsvUsdRate = await getBsvUsdRate();

    if (!bsvUsdRate || bsvUsdRate <= 0) {
      // If rate unavailable, return items unchanged
      return items;
    }

    return items.map(item => ({
      ...item,
      quotes: {
        BSV: {
          price: item.price,
          ...(item.marketCap !== undefined && { market_cap: item.marketCap }),
        },
        USD: {
          price: item.price * bsvUsdRate,
          ...(item.marketCap !== undefined && { market_cap: item.marketCap * bsvUsdRate }),
        },
      },
    }));
  } catch (e) {
    console.error("Error adding USD quotes:", e);
    // On error, return items unchanged (backward compatible)
    return items;
  }
}

/**
 * Adds USD quotes to a single market data item
 */
export async function addUsdQuotesToSingleItem<T extends { price: number; marketCap?: number }>(
  item: T,
): Promise<T & { quotes?: QuotesObject }> {
  try {
    const bsvUsdRate = await getBsvUsdRate();

    if (!bsvUsdRate || bsvUsdRate <= 0) {
      return item;
    }

    return {
      ...item,
      quotes: {
        BSV: {
          price: item.price,
          ...(item.marketCap !== undefined && { market_cap: item.marketCap }),
        },
        USD: {
          price: item.price * bsvUsdRate,
          ...(item.marketCap !== undefined && { market_cap: item.marketCap * bsvUsdRate }),
        },
      },
    };
  } catch (e) {
    console.error("Error adding USD quotes to single item:", e);
    return item;
  }
}

/**
 * Adds USD values to balance data
 */
export async function addUsdToBalances<T extends { price?: number; value?: number; amount?: number }>(
  balances: T[],
): Promise<(T & { price_usd?: number; value_usd?: number; value_bsv?: number })[]> {
  try {
    const bsvUsdRate = await getBsvUsdRate();

    if (!bsvUsdRate || bsvUsdRate <= 0) {
      return balances;
    }

    return balances.map(balance => {
      const result: T & { price_usd?: number; value_usd?: number; value_bsv?: number } = { ...balance };

      // Add USD price if BSV price exists
      if (balance.price !== undefined) {
        result.price_usd = balance.price * bsvUsdRate;
      }

      // Calculate values if price and amount exist
      if (balance.price !== undefined && balance.amount !== undefined) {
        result.value_bsv = balance.price * Number(balance.amount);
        result.value_usd = result.value_bsv * bsvUsdRate;
      }

      return result;
    });
  } catch (e) {
    console.error("Error adding USD to balances:", e);
    return balances;
  }
}
