/**
 * Export all Swagger schemas
 */

import { MarketData, SearchResponse, SearchResult } from "./market";
import { BSVQuote, Quotes, USDQuote } from "./quotes";
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
