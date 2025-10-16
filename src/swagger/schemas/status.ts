/**
 * Swagger schema definitions for status endpoints
 */

export const StatusResponse = {
  type: "object",
  properties: {
    chainInfo: {
      type: "object",
      properties: {
        blocks: { type: "number", example: 918953 },
        headers: { type: "number", example: 918953 },
        bestblockhash: { type: "string" },
        chain: { type: "string", example: "main" },
        mediantime: { type: "number" },
      },
    },
    exchangeRate: {
      type: "number",
      description: "BSV/USD exchange rate",
      example: 22.485,
    },
    indexers: {
      type: "object",
      description: "Indexer sync status",
    },
    market: {
      type: "object",
      properties: {
        bsv_usd: {
          type: "object",
          properties: {
            rate: { type: "number", example: 22.485 },
            timestamp: { type: "string", format: "date-time" },
            source: { type: "string", example: "whatsonchain" },
            change_24h: { type: "number", example: 2.5 },
          },
        },
        total_market_cap_bsv: {
          type: "number",
          description: "Total market cap in BSV",
        },
        total_market_cap_usd: {
          type: "number",
          description: "Total market cap in USD",
        },
        assets: {
          type: "object",
          properties: {
            bsv20_count: { type: "number", example: 170 },
            bsv21_count: { type: "number", example: 145 },
          },
        },
      },
    },
    timestamp: {
      type: "string",
      format: "date-time",
    },
    height: {
      type: "number",
      example: 918953,
    },
  },
};
