import { redis } from "../index";
import { fetchExchangeRate } from "../utils";

export interface BsvUsdRate {
  rate: number;
  timestamp: number;
}

/**
 * Store current exchange rate in history for 24h change tracking
 * Reuses existing fetchExchangeRate() from utils.ts (WhatsonChain API)
 */
export async function storeRateInHistory(): Promise<void> {
  try {
    // Use existing exchange rate fetch (WhatsonChain)
    const rate = await fetchExchangeRate();

    if (rate > 0) {
      const rateData: BsvUsdRate = {
        rate,
        timestamp: Date.now(),
      };

      // Store current rate (for USD quotes)
      await redis.set(
        "bsv_usd_rate:current",
        JSON.stringify(rateData),
        "EX",
        120, // 2 minute expiry
      );

      // Store in history (Redis ZSet for time-series)
      await redis.zadd(
        "bsv_usd_rates:history",
        rateData.timestamp,
        JSON.stringify(rateData),
      );

      // Keep only last 7 days
      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      await redis.zremrangebyscore("bsv_usd_rates:history", 0, sevenDaysAgo);
    }
  } catch (e) {
    console.error("Error storing rate in history:", e);
  }
}

/**
 * Calculate 24h rate change percentage
 */
export async function get24hRateChange(): Promise<number> {
  try {
    const now = Date.now();
    const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000;

    // Get rate from ~24h ago (within 30 second window)
    const oldRates = await redis.zrangebyscore(
      "bsv_usd_rates:history",
      twentyFourHoursAgo - 30000,
      twentyFourHoursAgo + 30000,
      "LIMIT",
      0,
      1,
    );

    if (!oldRates || oldRates.length === 0) {
      return 0;
    }

    // Get current rate from existing cache
    const currentRate = await fetchExchangeRate();
    if (!currentRate) {
      return 0;
    }

    const oldRate = (JSON.parse(oldRates[0]) as BsvUsdRate).rate;

    return ((currentRate - oldRate) / oldRate) * 100;
  } catch (e) {
    console.error("Error calculating 24h rate change:", e);
    return 0;
  }
}
