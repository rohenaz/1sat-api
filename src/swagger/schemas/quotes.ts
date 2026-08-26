/**
 * Swagger schema definitions for price quotes
 */

import type { SwaggerSchema } from "./types";

export const USDQuote: SwaggerSchema = {
	type: "object",
	properties: {
		price: {
			type: "number",
			description: "Price in USD",
			example: 112.25,
		},
		market_cap: {
			type: "number",
			description: "Market capitalization in USD",
			example: 2356725000,
		},
	},
};

export const BSVQuote: SwaggerSchema = {
	type: "object",
	properties: {
		price: {
			type: "number",
			description: "Price in BSV satoshis",
			example: 5000,
		},
		market_cap: {
			type: "number",
			description: "Market capitalization in BSV satoshis",
			example: 105000000000,
		},
	},
};

export const Quotes: SwaggerSchema = {
	type: "object",
	properties: {
		BSV: {
			$ref: "#/components/schemas/BSVQuote",
		},
		USD: {
			$ref: "#/components/schemas/USDQuote",
		},
	},
	description: "Price quotes in both BSV and USD",
};
