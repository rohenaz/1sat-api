# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **NEW**: Unified search endpoint `GET /search`
  - Search across both BSV20 and BSV21 tokens in one request
  - Relevance scoring (exact match = 1.0, prefix = 0.8, contains = 0.5)
  - Optional type filtering (`?type=bsv20` or `?type=bsv21`)
  - USD quotes included in all search results
  - Results sorted by relevance score and market cap
  - Service: `src/services/search.ts`
- Enhanced `/status` endpoint with professional market data
  - BSV/USD rate with 24h change tracking
  - Total market cap in BSV and USD
  - Asset counts by type (BSV20/BSV21)
  - Response includes `timestamp` and `height` fields
  - Added `X-API-Version: 1.0.0` header to all responses
- USD quotes added to all market and balance endpoints
  - `GET /market/:assetType` includes `quotes.USD` object with price and market_cap
  - `GET /market/:assetType/:id` includes `quotes.USD` object
  - `GET /user/:address/balance` includes `price_usd`, `value_bsv`, and `value_usd` fields
  - All USD conversions gracefully degrade if exchange rate unavailable
- Background job system for market data updates
  - Rate history tracking every 1 minute
  - Market statistics aggregation every 5 minutes
- Modular Swagger/OpenAPI documentation structure
  - Extracted 204 lines from `index.ts` into organized modules
  - `src/swagger/config.ts` - Main API configuration
  - `src/swagger/schemas/` - Response schemas (quotes, market, status, search)
  - `src/swagger/endpoint-docs.ts` - Documentation for all 23 endpoints
  - 3 endpoints fully documented, 20 ready to apply
- New service modules:
  - `src/services/rates.ts` - BSV/USD rate history tracking
  - `src/services/market-stats.ts` - Market cap aggregation
  - `src/services/usd-quotes.ts` - USD conversion helpers
  - `src/services/search.ts` - Unified search with relevance scoring
  - `src/jobs/status-updater.ts` - Background job orchestration

### Changed
- **BREAKING DEPENDENCY**: Migrated from `bsv-wasm` to `@bsv/sdk` v1.8.2
  - Updated transaction handling in `src/constants.ts`
  - Updated consolidate endpoint in `src/index.ts`
  - All cryptographic operations now use modern `@bsv/sdk` API
- Migrated airdrop transaction creation to use `js-1sat-ord` library
  - Replaced manual transaction building with `transferOrdTokens()`
  - Improved reliability and maintainability
- Updated Bun lockfile format from binary (`bun.lockb`) to YAML (`bun.lock`)
- Fixed EventSource import in `src/sse.ts` (named import instead of default)

### Fixed
- Resolved TypeBox version mismatch (upgraded to 0.34.41 for Elysia compatibility)

## [1.0.0] - Previous Release

### Context
This release marks the transition to a professional market API with enhanced features while maintaining 100% backward compatibility with existing endpoints.

The migration from `bsv-wasm` to `@bsv/sdk` was necessary because:
- `bsv-wasm` is no longer actively maintained
- `@bsv/sdk` provides better TypeScript support
- Modern API is more reliable and easier to maintain
- Better integration with the BSV ecosystem

[Unreleased]: https://github.com/yourusername/1sat-api/compare/v1.0.0...HEAD
