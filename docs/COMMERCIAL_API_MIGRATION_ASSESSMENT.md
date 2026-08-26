# 1Sat Market API: compatibility, commercialization, and stack migration

**Assessment date:** 2026-08-26

**Legacy API:** `https://api.1sat.market`

**New stack API:** `https://api.1sat.app/1sat`

**Legacy API revision reviewed:** `bb6555739d6d51b2087ba21f59dd871514d84560`

**1sat-stack revision reviewed:** `589884a` (`origin/master`)

**Decision status:** recommended target architecture and phased migration plan

## Executive conclusion

`1sat-stack` should become the primary BSV/1Sat indexing and transaction substrate, but it cannot replace `api.1sat.market` at the HTTP boundary today.

The two systems solve different problems:

- `1sat-stack` provides composable protocol infrastructure: TXO indexes, BSV-21 validation, OrdLock listings, ORDFS, chain state, transaction broadcast, owner sync, overlays, and authenticated administration.
- `api.1sat.market` provides a product-specific read model: BSV-20 and BSV-21 market summaries, prices, market caps, holders, sales-derived changes, fuzzy/prefix lookup, portfolio enrichment, collection browsing, collection market filters, mining helpers, and website-specific workflows.

Pointing the website directly at the new stack would break response shapes, pagination, asset coverage, token-market data, collection behavior, and several application workflows. The correct migration is a **strangler facade**:

1. Keep the existing unversioned API stable as the v1 compatibility contract.
2. Add explicit `/v1` aliases before making any source migration.
3. Build canonical commercial read models from `1sat-stack` events and APIs.
4. Dual-run and diff each migrated v1 route against production behavior.
5. Launch a clean, metered `/v2` commercial API that exposes the canonical model rather than legacy response accidents.
6. Retire GorillaPool dependencies only after parity, history, and BSV-20 decisions are complete.

The new stack removes the need to own every low-level indexing primitive, but it does **not** remove the need for a market-data service. That aggregation layer is the commercial product.

## Production state after stabilization

The `upgrade/market-api` work was fast-forwarded to `main` at `bb65557` and deployed successfully to Railway.

Verified on production:

- Railway deployment `4593944e-2e67-4f46-bf14-d7fd9aaf4aec` succeeded.
- `GET` and `HEAD` passed for root, Swagger, status, and both autocomplete families.
- Missing and invalid admin credentials return `401`; valid credentials pass the guard.
- No error-level deployment logs, sampled `5xx`, or sampled `499` responses appeared during verification.
- The service runs Elysia `1.4.29` and `@bsv/sdk` `2.4.1`.
- `bun audit` is clean.
- The repository uses the text `bun.lock`; `bun.lockb` was removed in the 2025 upgrade.
- Twenty tests with 45 assertions, TypeScript, Biome, frozen install, production build, and a non-broadcast signing check passed before merge.

The detailed stabilization review remains in
[`1SAT_API_DIFFERENTIAL_REVIEW_2026-08-26.md`](../1SAT_API_DIFFERENTIAL_REVIEW_2026-08-26.md).

## What the upgrade branch was intended to become

The branch goal is recoverable from commit history and the existing `IMPLEMENTATION_STATUS.md`:

- Commit `4ad706d` named the effort a “professional market API.”
- Phase 1 added BSV/USD rates, market aggregation, status data, and background jobs.
- Phase 2 added USD quotes to market and balance endpoints.
- Phase 3 added unified BSV-20/BSV-21 search and modular OpenAPI documentation.
- Commit `844d2c1` described the result as “Phase 1-3 Complete: Professional Market API Enhancement.”

The intended product direction was sound: evolve a website backend into a stable market-data API that other exchanges, wallets, and market builders could pay to use. The implementation stopped after the first read-model features; it did not yet add the commercial control plane: API keys, quotas, metering, billing, tenant isolation, SLAs, historical data products, or versioned contracts.

The old status document is historical evidence, not a current source of truth. Several of its completion claims are inaccurate today and are corrected below.

## Current contract and consumers

### Public surface

The live legacy OpenAPI document exposes 23 operations across ticker, market, search, collections, mining, airdrops, status, balances, Discord, and administration. All 23 routes are now attached to OpenAPI definitions even though `IMPLEMENTATION_STATUS.md` still says only 3 of 23 were documented.

### Confirmed local consumer

`1sat-website` is the only confirmed direct consumer found in the local repository set. It currently targets the Railway production domain (`1sat-api-production.up.railway.app`), which is the same service as `api.1sat.market`.

The website depends on these legacy contracts:

- BSV-20 and BSV-21 token market lists, detail, and search.
- BSV-20 and BSV-21 autocomplete.
- Bulk ticker hydration through `POST /ticker/num`.
- Collection list, items, and market listings.
- Cross-token address balances enriched with market price.
- Status data.
- Airdrop template 3.
- POW-20 latest-state lookup.

The site also calls `ordinals.gorillapool.io` directly for raw history, unspent outputs, listings, and sales. Migrating only `api.1sat.market` will therefore not remove the website’s legacy upstream dependency.

### Observed production traffic

The available Railway HTTP window was dominated by `GET /status`, with active browser/Bun traffic also observed for autocomplete and `GET /user/{address}/balance`. One balance request ended as a `499` after about 4.6 seconds in the older deployment window. This is a limited deployment-scoped sample, not a complete traffic census.

Before changing contracts, collect at least 30 days of route, status, latency, origin, API-key, and response-size telemetry at the gateway. Do not log wallet addresses or query contents without an explicit privacy policy and retention rule.

## Legacy data plane

The legacy service is primarily an aggregation and cache layer over external APIs:

- GorillaPool Ordinals API (`ordinals.gorillapool.io/api`) supplies BSV-20/BSV-21 catalogs, details, holders, balances, market listings, sales, collection inscriptions, collection stats, arbitrary query search, and broadcast.
- JungleBus supplies chain-tip information and upstream indexer events.
- WhatsOnChain supplies the BSV/USD exchange rate and transaction existence checks.
- ORDFS supplies ordinal content.
- Redis stores token read models, autocomplete hashes, inclusion sets, listings, rate history, market statistics, collection summaries, and bot/application state.

This makes the service useful, but it also means its product behavior is coupled to one legacy indexer’s schemas and query capabilities.

## What `1sat-stack` supports now

At revision `589884a`, `1sat-stack` is a composable Go server with embedded, remote, or disabled modules. Its core capabilities include TXO indexing, BEEF, BSV-21 overlays, OrdLock market listings, ORDFS, Chaintracks, broadcast, owner sync, paymail, BAP, OPNS, administration, and overlay synchronization.

The live hosted server reported these capabilities on 2026-08-26:

`beef`, `pubsub`, `txo`, `owner`, `bsv21`, `bap`, `opns`, `market`, `overlay`, `ordfs`, `chaintracks`, `arcade`, `admin`, `sweep`, and `paymail`.

The live OpenAPI document contains 136 operations, but 50 are administration and many others are low-level overlay or infrastructure operations. Operation count is not product parity.

Important semantics:

- `GET /bsv21/tokens` returns active/whitelisted token indexing **funding statuses**, not the legacy market catalog. It accepts `all=true`; it does not accept `limit`, sorting, fuzzy search, market-cap, price, holders, or quote parameters.
- Hosted `GET /bsv21/tokens` returned 173 statuses when inspected. This is a token-processing lifecycle view, not a stable exchange catalog.
- `GET /market/listings` is an OrdLock NFT listing search. It supports status, content type, prefix-name query, score cursor, direction, and limit. It does not provide fungible-token market summaries.
- `GET /txo/search` requires one or more indexed event/topic keys and supports union/intersection/difference. It is not an arbitrary document query language.
- BSV-21 routes provide token detail, output validation, transaction views, and per-token address/multi-address balance, history, and unspent output queries.
- Public core routes are not a commercial quota layer. BRC-103/104 and API-key middleware are used for authenticated administration; no application-level public request metering or subscription enforcement was found in the server source.

### Collection support is optional and narrower

`1sat-stack` includes a collection overlay library, but the hosted `api.1sat.app` server did not advertise the capability and returned `404` for `/1sat/collection/` during this assessment.

The collection module is intentionally mint-only:

- Roots require a 1-sat ordinal, `subType=collection`, and a valid transaction-bound SIGMA signature.
- Items require `subType=collectionItem`, a matching collection ID, and SIGMA.
- It stores root/item metadata, signer, content type, mint number, rank, MAP, and score.
- It does not track current owner or transfers.
- It does not join listings or sales.
- It does not calculate floor price, volume, trait floors, last sale, or collection statistics.
- It provides limit and score direction, but not legacy offset pagination, trait filters, price filters, or market sort modes.

This is a good authoritative membership substrate. It is not yet a commercial collection-market read model.

## Capability matrix

Legend: **Direct** can be backed by the new stack with a compatibility adapter; **Partial** needs a new projection or other source; **Gap** has no equivalent; **Retire/split** should leave the market-data core.

| Legacy operation | New-stack disposition | Required action |
|---|---|---|
| `GET /` | Partial | Preserve compatibility response; point developers to versioned docs and health. |
| `GET /ticker/autofill/{type}/{id}` | Gap | Build an asset catalog/search projection; keep BSV-20 data separately. |
| `GET /ticker/num/{num}` | Gap | Preserve a BSV-20 sequence mapping table or deprecate only in v2. |
| `POST /ticker/num` | Gap | Replace with bulk asset lookup over canonical asset IDs; retain v1 adapter. |
| `GET /collection/{id}/market` | Partial | Join collection membership to OrdLock listings; add traits, prices, sort, and stable paging. |
| `GET /collection` | Partial | Use collection-overlay roots, then enrich with stats, sales, media, and authority state. |
| `GET /collection/{id}/items` | Partial | Use collection-overlay membership, then add ownership/listing joins and legacy shape. |
| `GET /market/{type}` | Gap | Build token-market read models: supply, holders, price, market cap, change, listing state, quotes. |
| `GET /market/{type}/search/{term}` | Gap | Build indexed token search over the canonical catalog. |
| `GET /leaderboard` | Retire/rebuild | Current route is placeholder data. Implement from verified trade analytics or remove in v2. |
| `GET /search` | Gap | Build cross-domain search; stack TXO search is key lookup, not text search. |
| `GET /market/{type}/{id}` | Gap | Build canonical asset detail and market summary projection. |
| `GET /mint/{type}/{id}` | Partial | BSV-21 outputs/history can supply protocol data; BSV-20 and legacy response need compatibility indexing. |
| `GET /mine/pow20/latest/{id}` | Gap | Create a POW-20/contract analytics projection if this remains a supported product. |
| `GET /mine/pow20/` | Gap | Same as above. |
| `GET /mine/pow20/search/{sym}` | Gap | Same as above plus asset search. |
| `GET /airdrop/{template}` | Split | Move to an application/fulfillment service; it is not market data. |
| `POST /airdrop/private/{id}` | Split | Move to an authenticated fulfillment service with idempotency and audit logs. |
| `GET /status` | Partial | Compose stack health/capabilities/height with market freshness, rate, and projection lag. |
| `GET /user/{address}/balance` | Partial | BSV-21 per-token balance exists; a cross-token portfolio requires catalog fan-out or an address projection; BSV-20 remains separate. |
| `GET /admin/utxo/consolidate/{key}` | Split | Move to an internal wallet-operations service; use POST/job semantics, not mutating GET. |
| `GET /discord/{id}` | Split | Keep in the Discord/application domain, outside the commercial market API. |
| `GET /discord/{id}/check/{txid}` | Split | Keep in claim/Discord application service with explicit upstream failure semantics. |

## Breaking changes if consumers moved directly to `api.1sat.app`

1. **Base path and route names change.** The new server mounts under `/1sat` and uses protocol-specific namespaces.
2. **Asset scope changes.** The stack validates BSV-21; it does not reproduce the legacy BSV-20 v1 catalog and balance APIs.
3. **The meaning of “market” changes.** Legacy market routes describe fungible-token aggregates. New market routes describe OrdLock ordinal listings.
4. **Response shapes change completely.** Legacy consumers expect flattened market rows and Gorilla-style `OrdUtxo` documents. Stack routes return typed token status/detail, TXO, or listing structures.
5. **Pagination changes.** Legacy routes advertise `offset`/`limit`; stack search/listings use a score cursor (`from`) and direction.
6. **Search changes.** Legacy consumers expect ticker/symbol text lookup. Stack TXO search requires indexed event/topic keys; OrdLock `q` is name-prefix search.
7. **Portfolio behavior changes.** Legacy balance returns all known BSV-20/BSV-21 balances with price enrichment in one call. Stack balances are token-scoped.
8. **Collection behavior changes.** New collection support is optional, mint-only, SIGMA-gated, and not enabled on the hosted server. It does not provide current ownership or market aggregation.
9. **Coverage is policy/funding aware.** The default BSV-21 token list represents active or whitelisted overlay workers, not necessarily every historically observed token.
10. **Application workflows disappear.** Airdrop, Discord, POW-20 analytics, leaderboard, and UTXO consolidation are not stack APIs.

These are expected architecture differences, not reasons to reject `1sat-stack`. They are reasons to retain a product facade.

## Hardening findings that remain on the legacy API

The production crash and dependency/security issues are resolved, but contract-level hardening is still required before selling the API.

### P0: capture and protect the contract

- Create golden contract tests for all 23 operations: status codes, required fields, numeric/string units, empty responses, sort order, and error behavior.
- Record representative website fixtures and replay them in CI.
- Add `/v1` aliases while retaining unversioned paths.
- Publish deprecation and sunset headers before any removal.
- Add an API-wide version header; the code and historical docs claim it is global, but live inspection showed `X-API-Version` only on `/status`.

### P1: correctness defects discovered in this assessment

- **Market pagination is not offset pagination.** `fetchShallowMarketData` passes the requested offset to Redis `ZSCAN` as a cursor and treats `COUNT` as a strict limit. Redis scan counts are hints. A live `GET /market/bsv20?limit=2` returned 72 rows. Replace this with a deterministic sorted-set range or a canonical database query, then add paging tests.
- **Collection pagination has the same cursor/offset mismatch.** `findMatchingKeysWithOffset` passes numeric offsets to `HSCAN` cursors.
- **“Contains” search is not actually reachable for contains-only matches.** Candidate discovery uses Redis `HSCAN MATCH "term*"`, so the later contains score only sees prefix candidates. Build a real normalized search index or deliberately document prefix-only behavior for v1.
- **Percentage change does not honor its intended window.** `setPctChange` calculates a cutoff and then immediately replaces the filtered sales with the complete sales array. It also stores under the one-month label while surrounding product language is ambiguous about 24-hour versus other intervals.
- **Rate fallback is documented but absent.** Current source uses WhatsOnChain and cache only; no CoinGecko fallback exists despite the historical status document and commit message.
- **List limits are not validated.** Add bounded integer schemas and maximums to protect Redis/upstream workloads.

### P1: commercial control plane

- API-key issuance, rotation, revocation, scopes, and tenant ownership.
- Atomic quota enforcement and request metering by key, route class, response class, and byte volume.
- Per-plan rate limits, monthly quotas, overage policy, and usage dashboard.
- Billing integration, tax/invoice handling, trial and grace states, webhook idempotency, and entitlement reconciliation.
- Explicit commercial terms covering caching, derived data, redistribution, attribution, and prohibited abuse.
- Separate internal/admin/application routes from the public data plane.

### P1: reliability and observability

- Per-dependency circuit breakers, bounded concurrency, timeout budgets, retry budgets, and stale-cache policies.
- Structured logs with request IDs, upstream timing, cache outcome, route version, and projection freshness.
- SLOs for availability, p95/p99 latency, data freshness, and reorg correctness.
- Synthetic checks for the exact website flows, not only root/status probes.
- Dead-letter/replay support for market events and deterministic backfills.
- Restore drills for Redis and the future canonical store.

### P2: maintainability

- Split the 1,400-line `src/index.ts` into domain modules.
- Define runtime response schemas rather than TypeScript-only assertions.
- Replace background initialization coupled to the API process with durable workers/jobs.
- Remove placeholder routes or label them experimental.
- Replace the starter README and stale phase-status claims with operational and contract documentation.

## Recommended target architecture

```text
                            api.1sat.market
                                   |
                     API gateway / keys / quotas
                         /                     \
              unversioned + /v1                /v2
                compatibility              commercial API
                       \                       /
                        canonical query services
                                  |
                 market and portfolio read models
             /              |               |              \
     asset catalog      search index     time series     collection joins
             \              |               |              /
                       event/backfill pipeline
                    /             |                  \
              1sat-stack   collection-overlay   legacy bridge
           BSV-21/TXO/market   roots + members   BSV-20/history gaps
```

### Boundary rules

- `1sat-stack` owns protocol validation, transaction/TXO facts, overlay state, content, and chain facts.
- The commercial market service owns canonical asset identity, market aggregation, search, price/quote normalization, OHLCV, portfolio views, and plan entitlements.
- Collection-overlay owns authoritative collection root/member admissions. The market service owns ownership, listing, sale, floor, trait, and volume projections.
- Application workflows (airdrop, Discord, private wallet operations) move behind separate authenticated services.
- The v1 adapter owns compatibility quirks; v2 does not copy accidental types or pagination.

## Canonical v2 product surface

The exact URL design should be finalized after schema modeling, but the product needs these resources:

- `/v2/assets` and `/v2/assets/{assetId}` — BSV-20/BSV-21 identity, metadata, status, supply, and mappings.
- `/v2/search` — normalized symbol/name/ID/collection search with explicit match mode.
- `/v2/quotes` — bulk current BSV and fiat quotes with timestamps and source/freshness metadata.
- `/v2/markets` and `/v2/markets/{assetId}` — price, market cap, volume, holders, listing depth, and changes by documented interval.
- `/v2/trades` and `/v2/ohlcv` — normalized sales/trades and historical candles.
- `/v2/addresses/{address}/portfolio` — cross-token balances and values with pagination and freshness.
- `/v2/collections`, `/items`, `/listings`, `/sales`, and `/traits` — collection membership plus commercial market joins.
- `/v2/network/status` — chain, indexer, projection, price-source, and freshness state.
- `/v2/mappings` — legacy tick/num/outpoint and external-provider mappings.
- Streaming/webhook products for listing, sale, transfer, mint, and price changes when correctness and replay guarantees exist.

Every response should include or imply a stable schema version, canonical ID, units, observation time, source time, confirmation state, and freshness.

## Commercial packaging

CoinPaprika’s first-party pricing page and API-plan documentation were inspected on 2026-08-26. Their ladder is:

| Plan | Monthly price | Calls/month | Key differentiators |
|---|---:|---:|---|
| Free | $0 | 20,000 | 2,000 assets, 1 year daily history, personal use, up to 10-minute updates |
| Starter | $99 | 400,000 | All assets, 5 years daily history, commercial use, email support |
| Pro | $199 | 1,000,000 | Full daily history, 3 months hourly history |
| Business | $799 | 5,000,000 | 1 year hourly/5-minute history, shorter OHLCV intervals, mappings, 24h support |
| Ultimate | $1,499 | 10,000,000 | Full fine-grained history, 24h support |
| Enterprise | Custom | Unlimited | redistribution, WebSockets, SLA, dedicated infrastructure, real-time support |

Sources: [CoinPaprika pricing](https://coinpaprika.com/api/pricing/) and [CoinPaprika API plans](https://docs.coinpaprika.com/api-plans).

### Recommended 1Sat launch hypothesis

1Sat can be cheaper because the supported universe is intentionally limited to BSV and 1Sat Ordinals. Price should still be validated against measured storage, egress, backfill, support, and upstream costs.

| 1Sat plan | Hypothesis | Calls/month | Product boundary |
|---|---:|---:|---|
| Explorer | $0 | 20,000 | Personal/noncommercial, current assets/quotes, delayed or cached data, community support |
| Builder | $39/mo | 250,000 | Commercial use, market/search/portfolio, 1 year daily history, email support |
| Market Pro | $129/mo | 1,000,000 | Full daily history, 90 days hourly, bulk endpoints, collection analytics, priority email |
| Exchange | $399/mo | 5,000,000 | Fine-grained OHLCV, mappings, higher concurrency, webhooks/streaming, 24h support target |
| Enterprise | Custom | Contracted | Redistribution, SLA, dedicated capacity, custom history/backfill and support |

Do not sell “real time,” redistribution, or an SLA until replay, reorg handling, freshness telemetry, and support coverage are demonstrably ready. Start with explicit beta terms and conservative freshness guarantees.

## Migration plan

### Phase 0 — stabilize and freeze v1 (now)

- Keep `bb65557` production stable.
- Fix paging, search semantics, percentage-change windows, global version headers, and documentation mismatches without changing response shapes.
- Add v1 contract fixtures for every route used by `1sat-website`.
- Instrument real route usage and dependency latency.
- Update the website to use the canonical `https://api.1sat.market` domain rather than the Railway-generated domain.

**Exit:** 30 days of clean telemetry; critical website flows have synthetic tests; paging and search behavior is defined and tested.

### Phase 1 — commercial shell without data-source changes

- Put a gateway in front of the current API.
- Add API keys, plans, quotas, metering, usage reporting, request IDs, and per-route classes.
- Add `/v1` aliases and a developer portal/OpenAPI publication workflow.
- Split application/admin operations from public market data.

**Exit:** entitlements and billing can be tested end-to-end without changing market data.

### Phase 2 — canonical BSV-21 and OrdLock projections

- Consume BSV-21, TXO, OrdLock, chain, and ORDFS facts from `1sat-stack`.
- Build asset catalog, listing, sale, holder, balance, quote, and market-summary projections.
- Backfill history and define reorg/replay behavior.
- Shadow v1 responses and produce field-by-field diffs.

**Exit:** BSV-21 website fixtures meet agreed parity and freshness for at least two weeks in shadow mode.

### Phase 3 — collection market model

- Deploy/consume collection-overlay; do not assume hosted `api.1sat.app` has it.
- Join roots/members with owner, OrdLock listing, sale, ORDFS, authority, trait, and price projections.
- Preserve legacy collection responses through v1 adapters; expose canonical models in v2.

**Exit:** collection membership, ownership, listings, floors, and filters match agreed fixtures and include provenance/freshness.

### Phase 4 — BSV-20 and specialized legacy features

- Decide whether BSV-20 is a permanent paid compatibility product or a sunset product.
- If permanent, build or retain a dedicated BSV-20 indexer and historical store; `1sat-stack` BSV-21 does not solve it.
- Decide the product status of POW-20 analytics.
- Move airdrop, Discord, and wallet operations to application services.

**Exit:** every remaining legacy dependency has an owner, replacement, or published sunset.

### Phase 5 — route-by-route cutover

- Canary by route/key, not a big-bang DNS switch.
- Compare status, schema, row count, ordering, price units, holders, balances, and latency.
- Keep rapid rollback at the gateway.
- Cut the website to v1 canonical domain first; adopt v2 intentionally later.

**Exit:** GorillaPool can be removed from a route only after parity, history, and rollback criteria pass.

### Phase 6 — commercial launch

- Launch Explorer/Builder first; keep higher tiers invite-only until history and support are proven.
- Publish data methodology, status/freshness, version policy, error model, rate-limit headers, and terms.
- Add SDKs and sample exchange/market-builder integrations.

## Acceptance criteria for “commercial level”

- Versioned, documented, testable contracts with a published change policy.
- Deterministic pagination and stable canonical IDs.
- Explicit units and timestamps on prices, quantities, supply, and history.
- Measured data freshness and projection lag.
- Reorg-safe event processing and replayable backfills.
- API-key lifecycle, quotas, billing reconciliation, and auditable entitlements.
- Availability and latency SLOs backed by alerts and runbooks.
- Accurate usage dashboard and rate-limit headers.
- No public mutation endpoint implemented as GET.
- Privacy/retention policy for addresses and customer traffic.
- Dependency and source provenance documented per dataset.
- Contract tests against `1sat-website` plus at least one external-style integration fixture.

## Decisions to make before implementation

1. Is BSV-20 a permanent commercial data product, and for how long must full history remain available?
2. Are historical trades/OHLCV required at launch, or can the first paid version sell current market and collection data only?
3. Does Exchange tier include redistribution, or is redistribution Enterprise-only as in CoinPaprika?
4. Which collection authority rule is canonical at query time: SIGMA signer, BAP-resolved controller, curated registry, or a combination?
5. Which service owns application workflows after they leave the market API?
6. What freshness and availability can the team support operationally before making an SLA claim?

## Evidence index

Legacy source:

- `src/index.ts` — all public routes and market aggregation.
- `src/db.ts` — Redis scan/search behavior.
- `src/collection.ts` — Gorilla query, collection filters, and market joins.
- `src/init.ts` — catalog/listing/sales/holder cache population.
- `src/services/search.ts` — relevance behavior.
- `src/services/rates.ts` and `src/services/usd-quotes.ts` — rates and quote enrichment.
- `src/utils.ts` — chain, rate, upstream token detail, and percentage-change behavior.
- `IMPLEMENTATION_STATUS.md`, `CHANGELOG.md`, commits `4ad706d` and `844d2c1` — original professional API goal.

New stack source at reviewed revision:

- `pkg/bsv21/routes.go`, `pkg/bsv21/manager.go`, `pkg/bsv21/status.go` — token routing and funding-status semantics.
- `pkg/ordlock/routes.go`, `pkg/ordlock/ordlock.go` — market listing query semantics.
- `pkg/txo/routes.go` — indexed-key search and score-cursor pagination.
- `pkg/collection/routes.go`, `pkg/collection/lookup.go` — mint-only collection lookup.
- `pkg/auth/middleware.go`, `cmd/server/config.go` — authentication and route registration.
- `docs/plans/market-api-opns-validation.md` — current “market” naming and SDK coverage work.
- `docs/plans/2026-07-16-collection-overlay.md` — approved collection architecture and non-goals.

Live contracts inspected:

- `https://api.1sat.market/swagger/json`
- `https://api.1sat.app/1sat/api-spec/swagger.json`
- `https://api.1sat.app/1sat/capabilities`
- `https://api.1sat.app/1sat/health`
