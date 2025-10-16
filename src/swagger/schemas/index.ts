/**
 * Export all Swagger schemas
 */

import { USDQuote, BSVQuote, Quotes } from "./quotes";
import { MarketData, SearchResult, SearchResponse } from "./market";
import { StatusResponse } from "./status";

export const schemas = {
  USDQuote,
  BSVQuote,
  Quotes,
  MarketData,
  SearchResult,
  SearchResponse,
  StatusResponse,
};
