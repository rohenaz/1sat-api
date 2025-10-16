/**
 * Endpoint documentation for Swagger
 * Simple format compatible with Elysia's detail object
 */

export const endpointDocs = {
  // Status & Health
  status: {
    detail: {
      summary: "API Status and Health",
      description: "Get API health status, blockchain info, indexer status, exchange rates, and aggregated market statistics with USD quotes",
      tags: ["Status"],
    },
  },

  // Market Data
  marketList: {
    detail: {
      summary: "List Market Data",
      description: "Get paginated list of all tokens with market data, prices in BSV and USD, sorted by various criteria",
      tags: ["Market"],
    },
  },

  marketById: {
    detail: {
      summary: "Get Token Market Data",
      description: "Get detailed market data for a specific token by ID or ticker symbol, including USD quotes",
      tags: ["Market"],
    },
  },

  marketSearch: {
    detail: {
      summary: "Search Market by Term",
      description: "Search for tokens in the market by ticker or symbol (legacy endpoint, use /search instead)",
      tags: ["Market"],
    },
  },

  mint: {
    detail: {
      summary: "Get Mintable Tokens",
      description: "Get tokens that are still available for minting (supply < max)",
      tags: ["Market"],
    },
  },

  // Search
  search: {
    detail: {
      summary: "Unified Token Search",
      description: "Search across all BSV20 and BSV21 tokens with relevance scoring, USD quotes, and type filtering",
      tags: ["Search"],
    },
  },

  // User
  userBalance: {
    detail: {
      summary: "Get User Token Balances",
      description: "Get all BSV20 and BSV21 token balances for a specific address with USD valuations",
      tags: ["User"],
    },
  },

  // Collections
  collectionList: {
    detail: {
      summary: "List NFT Collections",
      description: "Get paginated list of all ordinal NFT collections",
      tags: ["Collections"],
    },
  },

  collectionMarket: {
    detail: {
      summary: "Get Collection Market Listings",
      description: "Get all active market listings for a specific collection",
      tags: ["Collections"],
    },
  },

  collectionItems: {
    detail: {
      summary: "Get Collection Items",
      description: "Get paginated items/NFTs within a specific collection",
      tags: ["Collections"],
    },
  },

  // Ticker/Autofill
  tickerAutofill: {
    detail: {
      summary: "Ticker Autofill Search",
      description: "Search for tickers by partial match for autofill/typeahead functionality",
      tags: ["Ticker"],
    },
  },

  tickerByNum: {
    detail: {
      summary: "Get Ticker by Number",
      description: "Get ticker information by inscription number",
      tags: ["Ticker"],
    },
  },

  tickerNumPost: {
    detail: {
      summary: "Update Ticker Numbers",
      description: "Batch update ticker numbers (internal use)",
      tags: ["Ticker"],
    },
  },

  // POW20 Mining
  mineLatest: {
    detail: {
      summary: "Get Latest POW20 Mining Target",
      description: "Get the latest mining target for a POW20 token",
      tags: ["Mining"],
    },
  },

  mineList: {
    detail: {
      summary: "List All POW20 Mining Targets",
      description: "Get all available POW20 tokens for mining",
      tags: ["Mining"],
    },
  },

  mineSearch: {
    detail: {
      summary: "Search POW20 by Symbol",
      description: "Search for POW20 tokens by symbol",
      tags: ["Mining"],
    },
  },

  // Leaderboard
  leaderboard: {
    detail: {
      summary: "Trading Leaderboard",
      description: "Get top buyers/traders leaderboard (coming soon)",
      tags: ["Leaderboard"],
    },
  },

  // Airdrops
  airdropTemplate: {
    detail: {
      summary: "Get Airdrop Template",
      description: "Get airdrop template information",
      tags: ["Airdrops"],
    },
  },

  airdropPrivate: {
    detail: {
      summary: "Create Private Airdrop",
      description: "Create a private airdrop transaction",
      tags: ["Airdrops"],
    },
  },

  // Admin
  adminConsolidate: {
    detail: {
      summary: "Consolidate UTXOs",
      description: "Admin endpoint to consolidate UTXOs (requires authentication)",
      tags: ["Admin"],
    },
  },

  // Discord
  discordUser: {
    detail: {
      summary: "Get Discord User Info",
      description: "Get user information by Discord ID",
      tags: ["Discord"],
    },
  },

  discordCheck: {
    detail: {
      summary: "Check Discord Transaction",
      description: "Check transaction status for Discord user",
      tags: ["Discord"],
    },
  },

  // Root
  root: {
    detail: {
      summary: "API Root",
      description: "API welcome message",
      tags: ["Status"],
    },
  },
};
