import { redis } from "../index";
import { fetchExchangeRate } from "../utils";

interface MarketStats {
  total_market_cap_bsv: number;
  total_market_cap_usd: number;
  total_volume_24h_bsv: number;
  total_volume_24h_usd: number;
  assets: {
    bsv20_count: number;
    bsv21_count: number;
  };
}

/**
 * Calculate aggregated market statistics across all tokens
 */
export async function calculateMarketStats(): Promise<MarketStats> {
  try {
    // Get BSV/USD rate from existing system
    const bsvUsdRate = await fetchExchangeRate();

    // Count BSV20 tokens
    const bsv20Keys = await redis.keys("token-bsv20-*");
    let bsv20MarketCapBsv = 0;

    for (const key of bsv20Keys) {
      const tokenData = await redis.get(key);
      if (tokenData) {
        const token = JSON.parse(tokenData);
        if (token.marketCap) {
          bsv20MarketCapBsv += Number.parseFloat(token.marketCap);
        }
      }
    }

    // Count BSV21 tokens
    const bsv21Keys = await redis.keys("token-bsv21-*");
    let bsv21MarketCapBsv = 0;

    for (const key of bsv21Keys) {
      const tokenData = await redis.get(key);
      if (tokenData) {
        const token = JSON.parse(tokenData);
        if (token.marketCap) {
          bsv21MarketCapBsv += Number.parseFloat(token.marketCap);
        }
      }
    }

    const totalMarketCapBsv = bsv20MarketCapBsv + bsv21MarketCapBsv;

    const stats: MarketStats = {
      total_market_cap_bsv: totalMarketCapBsv,
      total_market_cap_usd: totalMarketCapBsv * bsvUsdRate,
      total_volume_24h_bsv: 0, // TODO: Implement in Phase 2
      total_volume_24h_usd: 0,
      assets: {
        bsv20_count: bsv20Keys.length,
        bsv21_count: bsv21Keys.length,
      },
    };

    // Cache for 5 minutes
    await redis.set(
      "market_stats:current",
      JSON.stringify(stats),
      "EX",
      5 * 60,
    );

    console.log(
      `Market stats: ${stats.assets.bsv20_count} BSV20, ${stats.assets.bsv21_count} BSV21, ${stats.total_market_cap_bsv} BSV total market cap`,
    );

    return stats;
  } catch (e) {
    console.error("Error calculating market stats:", e);
    // Return default on error
    return {
      total_market_cap_bsv: 0,
      total_market_cap_usd: 0,
      total_volume_24h_bsv: 0,
      total_volume_24h_usd: 0,
      assets: {
        bsv20_count: 0,
        bsv21_count: 0,
      },
    };
  }
}
