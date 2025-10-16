import { redis } from "..";
import { AssetType } from "../constants";
import { findMatchingKeys } from "../db";
import type { MarketDataV1, MarketDataV2 } from "../types/bsv20";
import { addUsdQuotesToMarketData } from "./usd-quotes";

export interface SearchResult {
  type: "bsv20" | "bsv21";
  id: string;
  name?: string;
  tick?: string; // BSV20
  sym?: string; // BSV21
  price?: number;
  price_usd?: number;
  market_cap?: number;
  market_cap_usd?: number;
  holders?: number;
  score: number; // Relevance score (0-1)
}

/**
 * Calculate relevance score based on search term matching
 * Exact match > Starts with > Contains
 */
function calculateRelevanceScore(searchTerm: string, item: MarketDataV1 | MarketDataV2): number {
  const term = searchTerm.toLowerCase();
  const itemName = ("tick" in item ? item.tick : item.sym)?.toLowerCase() || "";

  // Exact match = 1.0
  if (itemName === term) {
    return 1.0;
  }

  // Starts with = 0.8
  if (itemName.startsWith(term)) {
    return 0.8;
  }

  // Contains = 0.5
  if (itemName.includes(term)) {
    return 0.5;
  }

  // No match = 0
  return 0;
}

/**
 * Unified search across BSV20 and BSV21 tokens
 * Returns results sorted by relevance with USD quotes
 */
export async function searchAssets(
  query: string,
  limit = 20,
  type?: "bsv20" | "bsv21",
): Promise<SearchResult[]> {
  const searchTerm = query.toLowerCase().trim();

  if (!searchTerm) {
    return [];
  }

  const results: SearchResult[] = [];
  const typesToSearch = type ? [type] : ["bsv20", "bsv21"];

  for (const assetType of typesToSearch) {
    try {
      // Search autofill data
      const matches = await findMatchingKeys(
        redis,
        "autofill",
        searchTerm,
        assetType === "bsv20" ? AssetType.BSV20 : AssetType.BSV21,
      );

      // Get full token data from cache and calculate relevance
      for (const match of matches) {
        const id = match.id;
        const tokenKey = `token-${assetType === "bsv20" ? AssetType.BSV20 : AssetType.BSV21}-${id}`;
        const tokenData = await redis.get(tokenKey);

        if (tokenData) {
          try {
            const token = JSON.parse(tokenData) as MarketDataV1 | MarketDataV2;
            const score = calculateRelevanceScore(searchTerm, token);

            // Only include items with non-zero relevance
            if (score > 0) {
              const result: SearchResult = {
                type: assetType,
                id: id,
                score,
              };

              // Add BSV20 specific fields
              if ("tick" in token) {
                result.tick = token.tick;
                result.name = token.tick;
              }

              // Add BSV21 specific fields
              if ("sym" in token) {
                result.sym = token.sym;
                result.name = token.sym;
              }

              // Add market data
              if (token.price) {
                result.price = token.price;
              }
              if (token.marketCap) {
                result.market_cap = token.marketCap;
              }
              if (token.accounts) {
                result.holders = token.accounts;
              }

              results.push(result);
            }
          } catch (e) {
            console.error(`Error parsing token data for ${id}:`, e);
          }
        }
      }
    } catch (e) {
      console.error(`Error searching ${assetType}:`, e);
    }
  }

  // Sort by relevance (score DESC) then by market cap (DESC)
  results.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return (b.market_cap || 0) - (a.market_cap || 0);
  });

  // Limit results
  const limitedResults = results.slice(0, limit);

  // Add USD quotes
  try {
    const withUsdQuotes = await addUsdQuotesToMarketData(
      limitedResults.map(r => ({
        price: r.price || 0,
        marketCap: r.market_cap,
      })),
    );

    // Merge USD data back into results
    for (let i = 0; i < limitedResults.length; i++) {
      const quotes = withUsdQuotes[i].quotes;
      if (quotes) {
        limitedResults[i].price_usd = quotes.USD.price;
        limitedResults[i].market_cap_usd = quotes.USD.market_cap;
      }
    }
  } catch (e) {
    console.error("Error adding USD quotes to search results:", e);
  }

  return limitedResults;
}
