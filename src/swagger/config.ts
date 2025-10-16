/**
 * Swagger/OpenAPI configuration for 1Sat Ordinals API
 */

import type { ElysiaSwaggerConfig } from "@elysiajs/swagger/dist/types";
import { schemas } from "./schemas";

export const swaggerConfig: ElysiaSwaggerConfig<"/swagger"> = {
  documentation: {
    info: {
      title: "1Sat Ordinals API",
      version: "1.0.0",
      description: `Professional BSV market data API for 1satordinals.com

Features:
- Real-time BSV20 and BSV21 token market data
- USD price quotes on all endpoints
- 24h price change tracking
- Market capitalization aggregation
- Unified search across all token types
- User balance lookups with valuations
- Collection and listing management

All endpoints maintain 100% backward compatibility while adding enhanced USD quote data.`,
      contact: {
        name: "1Sat Ordinals",
        url: "https://1satordinals.com",
      },
    },
    servers: [
      {
        url: "https://api.1sat.market",
        description: "Production API",
      },
      {
        url: "http://localhost:3000",
        description: "Local Development",
      },
    ],
    tags: [
      {
        name: "Status",
        description: "API status and health endpoints",
      },
      {
        name: "Market",
        description: "Token market data with USD quotes",
      },
      {
        name: "Search",
        description: "Unified search across BSV20 and BSV21 tokens",
      },
      {
        name: "User",
        description: "User balances and holdings",
      },
      {
        name: "Collections",
        description: "NFT collection data",
      },
      {
        name: "Ticker",
        description: "Token ticker information and autofill",
      },
    ],
    components: {
      schemas,
      headers: {
        "X-API-Version": {
          description: "API version",
          schema: {
            type: "string",
            example: "1.0.0",
          },
        },
      },
    },
  },
};
