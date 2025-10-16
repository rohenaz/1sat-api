/**
 * Swagger schema definitions for market data
 */

export const MarketData = {
  type: "object",
  properties: {
    tick: {
      type: "string",
      description: "Token ticker symbol (BSV20)",
      example: "ORDI",
    },
    sym: {
      type: "string",
      description: "Token symbol (BSV21)",
      example: "GOLD",
    },
    price: {
      type: "number",
      description: "Current price in BSV satoshis",
      example: 5000,
    },
    marketCap: {
      type: "number",
      description: "Market capitalization in BSV satoshis",
      example: 105000000000,
    },
    pctChange: {
      type: "number",
      description: "24h price change percentage",
      example: -2.5,
    },
    quotes: {
      $ref: "#/components/schemas/Quotes",
    },
  },
};

export const SearchResult = {
  type: "object",
  properties: {
    type: {
      type: "string",
      enum: ["bsv20", "bsv21"],
      description: "Asset type",
      example: "bsv21",
    },
    id: {
      type: "string",
      description: "Asset ID",
      example: "b00cfb76b0022a372c82f71031a8e93550ecba2b5582c44d1efaf2640b3c559e_0",
    },
    name: {
      type: "string",
      description: "Asset name (tick or sym)",
      example: "ORDI",
    },
    tick: {
      type: "string",
      description: "Token ticker (BSV20 only)",
      example: "ORDI",
    },
    sym: {
      type: "string",
      description: "Token symbol (BSV21 only)",
      example: "GOLD",
    },
    price: {
      type: "number",
      description: "Price in BSV satoshis",
      example: 5000,
    },
    price_usd: {
      type: "number",
      description: "Price in USD",
      example: 112.25,
    },
    market_cap: {
      type: "number",
      description: "Market cap in BSV",
      example: 105000000000,
    },
    market_cap_usd: {
      type: "number",
      description: "Market cap in USD",
      example: 2356725000,
    },
    holders: {
      type: "number",
      description: "Number of token holders",
      example: 245,
    },
    score: {
      type: "number",
      description: "Relevance score (0-1)",
      example: 1.0,
      minimum: 0,
      maximum: 1,
    },
  },
  required: ["type", "id", "score"],
};

export const SearchResponse = {
  type: "object",
  properties: {
    query: {
      type: "string",
      description: "Search query used",
      example: "ordi",
    },
    total: {
      type: "number",
      description: "Total number of results",
      example: 2,
    },
    results: {
      type: "array",
      items: {
        $ref: "#/components/schemas/SearchResult",
      },
    },
    timestamp: {
      type: "string",
      format: "date-time",
      description: "Response timestamp",
    },
  },
  required: ["query", "total", "results", "timestamp"],
};
