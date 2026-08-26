# 1Sat greenfield commercial API: capability map and architecture

**Assessment date:** 2026-08-26

**Legacy production API:** `https://api.1sat.market`

**Greenfield application:** `https://1satwallet.com` on the website `omega` branch

**New infrastructure API:** `https://api.1sat.app/1sat`

**Legacy API revision reviewed:** `05360aac50d16d971280cb5d38d9a382d39b9eda`

**1sat-stack revision reviewed:** `589884a` (`origin/master`)

**Omega revision reviewed:** `d390968` (`origin/omega`)

**Decision status:** corrected greenfield architecture; legacy compatibility is explicitly out of scope

## Executive decision

The next commercial 1Sat API should be a clean implementation against the new
1Sat infrastructure. It should not preserve the old API contract, query the old
API at runtime, or carry adapters and fallback paths for legacy data sources.

The old system has two continuing purposes:

1. Keep the existing production website and integrations operating until their
   independent retirement.
2. Act as a feature catalog and historical reference while the team decides
   which outcomes belong in the new product.

It is not an architectural dependency of the new system.

The new development environment, the Omega website, and `1satwallet.com` create
the isolation required to do this correctly. The new API is free to use new
resource names, response shapes, pagination, search semantics, and product
boundaries that fit `1sat-stack`. If a legacy feature does not fit the new
infrastructure, it must be rebuilt as a native projection, explicitly deferred,
or deliberately retired. It must not be simulated through a hidden legacy
fallback.

The intended topology is deliberately small:

```text
1satwallet.com / commercial customers
                  |
                  v
       new commercial API contract
       auth · quotas · query semantics
                  |
                  v
       canonical commercial read model
       one durable database + optional cache
                  |
                  v
              1sat-stack
TXO · BSV21 · OrdLock · owner · ORDFS · chain · SSE
```

This is a greenfield product built from modern protocol facts, not a facade over
two generations of infrastructure.

## Non-negotiable boundary rules

- The new API has no runtime dependency on `api.1sat.market`.
- The new API has no runtime dependency on GorillaPool market/search routes,
  legacy Redis schemas, or legacy sequence-number identifiers.
- There is no request-time fallback from new infrastructure to old
  infrastructure.
- New data models are designed from stack-native identities and events.
- The first public version of the new API may be called `/v1`, but that means
  version 1 of the new contract. It is unrelated to the old unversioned API.
- Environment and domain select the paradigm. Individual requests do not
  silently switch between paradigms.
- The greenfield deployment has an isolated Railway environment or project,
  isolated credentials, and isolated data services. A differently named API
  service inside the production environment is not sufficient isolation.
- If the stack is unavailable, read endpoints may serve their last consistent
  materialized state with explicit freshness metadata; live operations fail
  clearly with `503`. A durable read model is part of the design, not a legacy
  fallback.
- Feature comparison with the old API is an offline product exercise. It is not
  a requirement for wire compatibility.

## Where the two paradigms differ

| Dimension | Old market API paradigm | New stack paradigm | Design consequence |
|---|---|---|---|
| Primary abstraction | Website-shaped documents and Redis hashes | Protocol outputs, topics, owners, transactions, and overlays | Build new product projections from protocol facts |
| Asset identity | BSV-20 sequence number or mixed legacy IDs | Canonical outpoints and BSV-21 token IDs | Use outpoints/token IDs everywhere |
| Market meaning | Token summaries, prices, holders, changes | OrdLock listing lifecycle | Define listings, trades, quotes, and candles separately |
| Search | Prefix/fuzzy scans over cached documents | Indexed TXO event/topic keys and limited listing-name prefix | Maintain a commercial search document projection |
| Pagination | Offset-shaped HTTP parameters over Redis scans | Score/cursor-oriented ordered indexes | Adopt opaque cursors in the new API |
| Portfolio | Cross-token enriched address response | Token-scoped balances/history plus owner/TXO streams | Compose a native owner portfolio projection |
| Collections | Metadata, items, listings, floors, filters | Optional SIGMA-gated mint membership | Separate immutable membership from mutable ownership/market state |
| History | Ad hoc cached sales arrays | Transaction and overlay event facts | Persist replayable normalized events and time buckets |
| Operations | Market reads mixed with airdrops, Discord, admin, and mint helpers | Modular protocol services | Keep application workflows outside the commercial data plane |
| Failure behavior | Multiple external dependencies and implicit degradation | One canonical infrastructure boundary | Expose freshness and fail honestly; do not source-switch |

The stack's 136 OpenAPI operations represent broad infrastructure coverage, not
an exchange-style market-data product. That is a strength: the new commercial
API can be narrow, coherent, and opinionated instead of copying every low-level
route.

## What the new stack supplies natively

These capabilities should be used directly or wrapped with minimal policy:

| Capability | Stack source | Commercial use |
|---|---|---|
| Output and transaction lookup | `/txo`, `/beef` | Canonical provenance and transaction detail |
| Owner synchronization | `/owner` SSE and balance routes | Wallet inventory and BSV balance |
| BSV-21 protocol facts | `/bsv21` | Token details, validation, balances, history, unspent outputs |
| OrdLock listings | `/market/listings` | Active, sold, and cancelled ordinal listing facts |
| On-chain content | `/content`, `/ordfs` | Media, metadata, directories, and transfer-chain resolution |
| Chain state | `/chaintracks` | Height, tip, reorg awareness, and freshness |
| Real-time events | `/sse` and chain streams | Projection updates and customer streaming later |
| Transaction broadcast | `/arcade` | Wallet/application operations, not market analytics |
| Identity and names | `/bap`, `/opns` | Optional creator/seller enrichment |
| Overlay primitives | `/overlay` | Specialized future topics without redesigning the API |

The commercial service should consume these facts through stable stack APIs and
event streams. It should not copy stack internals or expose the stack's raw
storage schemas as its customer contract.

## What must be built as native commercial projections

### Asset catalog

`/bsv21/tokens` is an overlay-worker lifecycle and funding view, not a market
catalog. Build a canonical BSV-21 asset record keyed by token outpoint with:

- protocol metadata and validation state;
- symbol, decimals, icon outpoint, deploy transaction, and creation score;
- supply and holder statistics with documented calculation methods;
- market availability and data-freshness state;
- searchable normalized text.

The catalog must use cursor pagination and deterministic sort keys. It should
not reproduce BSV-20 numeric sequence IDs.

### Listings, trades, and market summaries

OrdLock supplies listing lifecycle facts. The commercial model should derive
separate resources:

- listing: the offer, seller, ordinal origin/current outpoint, price, and state;
- trade: a verified sale event tied to the listing and spending transaction;
- market summary: last price, volume, trade count, floor, and change windows;
- candle: open, high, low, close, volume, and trade count for a documented
  interval.

Calculations must be replayable from normalized events. Window definitions,
confirmation rules, and reorg behavior become public methodology rather than
accidental Redis behavior.

### Search

`/txo/search` searches indexed event and topic keys; it is not human catalog
search. Create one search-document table populated from assets, ordinals,
collections, identities, and listings. Start with PostgreSQL full-text and
trigram indexes. Do not add Elasticsearch until measured scale justifies it.

Search results should return typed references and compact display fields rather
than flattening unrelated legacy shapes into one object.

### Portfolio

Compose owner/TXO synchronization and BSV-21 balances into a wallet-oriented
portfolio:

- BSV balance;
- BSV-21 balances keyed by canonical token ID;
- ordinal inventory and active listing state;
- optional market valuation from the commercial read model;
- an explicit as-of score/height and freshness timestamp.

This is a new owner model. It does not promise legacy BSV-20 coverage.

### Collections

The shipped collection module recognizes SIGMA-verified collection roots and
items, but it is disabled by default and mint-only. The hosted
`api.1sat.app` capability list did not advertise it and the hosted collection
route returned `404` during this assessment.

A commercial collection model therefore needs:

1. a self-hosted stack deployment with the collection module enabled;
2. collection item topics registered;
3. immutable root/item membership ingested from the overlay;
4. current owner and spend state joined from TXO/owner facts;
5. active listings and verified sales joined from OrdLock;
6. trait/media documents derived from MAP and ORDFS;
7. floors, volume, owner counts, and time series calculated by the projection.

The current overlay verifies a transaction-bound SIGMA signer, but does not
require the item signer to equal the root signer or current root owner. If the
product needs a “verified collection” trust mark, that is a separate curation or
protocol-policy decision. The API must not imply an authority rule the protocol
does not enforce.

## Feature outcome map

This table treats the old feature set as inspiration, not a contract checklist.

| Legacy outcome | Greenfield disposition | Reason |
|---|---|---|
| BSV-21 token discovery and detail | Build now | Native stack facts plus a small catalog projection |
| BSV-21 balances/history | Build now | Native token and owner services |
| Ordinal listing browse/detail | Build now | Native OrdLock and ORDFS; Omega already uses it |
| Buy/list/cancel workflows | Keep in wallet/application layer | Transaction actions are not commercial market-data routes |
| Token/ordinal/collection search | Build new | Requires a purpose-built search projection |
| Token market summaries and ranking | Build new | Requires normalized trade events and aggregates |
| OHLCV/history | Build after event completeness proof | Derivable only with complete, replayable sale history |
| Collection roots/items | Enable and build | Overlay supplies mint membership; hosted module is currently absent |
| Collection ownership, listings, floors, traits | Build new | Requires joins and projections not present in collection overlay |
| Cross-asset owner portfolio | Build new | Compose owner and token facts with market valuations |
| BSV/USD rate | Add one explicit price-oracle input | It is external reference data; publish source and freshness |
| BSV-20 market and balances | Product decision; no native path | Omega deprecates it and stack does not model it; retaining it requires a new stack/overlay capability |
| POW-20 analytics | Product decision; no native path | Retaining it requires a new dedicated stack-native indexer |
| Airdrops | Separate application service | Fulfillment workflow, not commercial market data |
| Discord endpoints | Retire from API product | Community application concern |
| Mint helpers | Use wallet/action SDKs | Transaction construction belongs client/application side |
| Admin consolidation | Rebuild as internal operations | Never expose as part of customer data contract |
| Placeholder leaderboard | Retire | Reintroduce only from verified trade analytics |

“Not possible today” means the required indexed fact or complete history is not
currently exposed. It does not mean the old service should be called. The
choice is to add the missing stack/overlay capability, build a new projection,
or omit the feature.

## Omega branch reality

The Omega branch already points in the intended direction:

- `lib/stack.ts` calls `@1sat/client` for Market, TXO, and ORDFS and labels
  `api.1sat.app` the canonical backend.
- Ordinal market pages use stack-native OrdLock listings.
- BSV-21 pages use the stack token registry.
- The branch deliberately deprecates BSV-20.
- Wallet and outpoint experiences use stack-native identities and content.

The remaining legacy call sites are a precise first integration backlog:

| Omega surface | Current dependency | Greenfield replacement |
|---|---|---|
| `app/api/autofill` | old market API BSV-21 autocomplete | new asset/search endpoint |
| ordinal browse feed in `lib/api.ts` | legacy `API_HOST /api/market` | native OrdLock listing query or new listing endpoint |
| market text search | legacy `API_HOST /api/market` | new typed search endpoint |
| token market page | stack registry status only | new asset catalog and market summaries |
| selected theme/content paths | GorillaPool content URL | stack `/content` / ORDFS |
| required public API host constants | legacy environment variables | one new commercial API base URL |

Omega and the new API should change together. There is no need to preserve old
response types inside either codebase.

## Current Railway isolation blocker

Railway currently has one environment named `production`. Both
`api.1sat.market` and `api.1sat.market dev` live in it, and the project has
one Redis service. Both API services expose `REDIS_URL`,
`REDIS_PRIVATE_URL`, and `BOT_REDIS_URL`; the user confirmed that the API
services resolve their Redis configuration to the same instance.

Schema-compatible dev code avoids an immediate schema mismatch, but sharing is
still an operational risk because dev jobs and tests can mutate production
keys. It is categorically unsafe for greenfield development.

Before replacing routes, schemas, jobs, or initialization behavior on dev:

1. create a real Railway `development` environment or a separate greenfield
   project;
2. provision a dedicated development PostgreSQL database there;
3. do not attach production Redis variables to the greenfield API;
4. add a dedicated development Redis only if measured caching or ephemeral
   coordination needs justify it;
5. backfill development projections from `1sat-stack`, not by cloning or
   mutating production Redis;
6. verify from rendered Railway variables and connection tests that no
   production data-service hostname or credential is reachable from dev.

Until isolation is complete, the existing dev API must not introduce schema
changes, destructive jobs, bulk rewrites, or test data into shared Redis. No
greenfield experiment should begin on that instance.

## Project ownership and exact change locations

### `1sat-stack`: protocol facts and overlay infrastructure

Repository: `~/code/1sat-stack`

Target branch: a dedicated feature branch from `origin/master`

The stack owns admission, validation, indexed protocol facts, replayable
lookup, and raw event access. It does not own commercial ranking, text search,
OHLCV, customer plans, or the public market-data contract.

#### Required stack work for collections

The collection implementation exists in `pkg/collection`, but at revision
`589884a` it is a library package and is not wired into the main server.
`cmd/server/config.go` has no collection config/service field, initialization,
registrar entry, or close lifecycle. The hosted API consequently cannot enable
it through configuration alone.

The stack feature should update:

| Location | Exact responsibility |
|---|---|
| `cmd/server/config.go` | Import collection package; add `Config.Collection` and `Services.Collection`; call `SetDefaults`, `Initialize`, registrar mounting, and `Close` |
| `config.example.yaml` | Add `collection.mode`, route settings, and initial `collection_ids` |
| `cmd/server/config_test.go` | Cover disabled/enabled initialization and dependency gates |
| `cmd/server/docs_test.go` | Assert the collection capability and mounted route prefixes |
| `pkg/collection/docs/` | Add the embedded OpenAPI fragment used by the server registrar |
| `pkg/collection/config.go` | Keep static registration and define the lifecycle for newly discovered collection topics |
| `pkg/collection/topic_discovery.go` | Trigger or publish dynamic item-topic registration when a valid new root is admitted |
| `pkg/collection/*_test.go` | Prove SIGMA admission, relative IDs, idempotent topic registration, and restart behavior |

After that code ships, the stack deployment must enable the module, synchronize
`tm_1sat_collection`, register/backfill item topics, and advertise
`collection` from `/1sat/capabilities`.

The collection package remains mint-membership infrastructure. Current owner,
listing joins, sales, floors, volume, traits, and commercial collection search
belong in the dev API projections.

#### Stack surfaces that need no initial code change

| Existing stack location | Consumer use |
|---|---|
| `pkg/ordlock/routes.go` and `ordlock.go` | Cursor through active, sale, and cancel records; validate historical completeness before requesting changes |
| `pkg/bsv21/routes.go` and `pkg/lookup/bsv21.go` | Token details, registry facts, balances, history, and unspent outputs |
| `pkg/txo`, `pkg/owner`, `pkg/ordfs`, `pkg/chaintracks` | Ownership, content, provenance, chain state, and replay inputs |

If OrdLock backfill testing proves that a required sale fact is absent, the fix
belongs in `pkg/ordlock/ordlock.go`, `routes.go`, its Swagger fragment, and
tests. Do not add a parallel sale interpretation to the commercial API.

#### Conditional stack work

If BSV-20 or POW-20 remains in product scope, implement it as new stack-native
indexing capability—for example `pkg/bsv20` or `pkg/pow20` plus
`cmd/server` wiring, documentation, sync, and tests. The dev API may project
those facts only after the canonical stack capability exists. It must not call
the old API as a substitute.

### `1sat-api` dev: commercial product and customer endpoints

Repository: `~/code/1sat-api`

Deployment branch: `upgrade/market-api` (currently an ancestor of `main`;
fast-forward it to `main` before greenfield implementation)

Railway service: `api.1sat.market dev`

This project owns the durable commercial read model, calculations, query
semantics, OpenAPI, API keys, quotas, and usage metering. A proposed clean
structure is:

| Proposed location | Responsibility |
|---|---|
| `src/index.ts`, `src/app.ts`, `src/config.ts` | Process entry, Elysia composition, strict environment validation |
| `src/clients/stack.ts` | The only infrastructure client; stack HTTP/SSE/backfill access |
| `migrations/` and `src/db/` | PostgreSQL schema, transactions, cursor indexes, checkpoints |
| `src/domain/` | New asset, ordinal, listing, trade, collection, portfolio, and freshness types |
| `src/projectors/` | BSV-21 catalog, OrdLock trades, collections, owner positions, candles, and search documents |
| `src/routes/` | Customer endpoints under the new `/api/v1` contract |
| `src/jobs/projector.ts` | Backfill, checkpoint resume, SSE consumption, replay, and lag |
| `src/openapi/` | Contract schemas and generated/public documentation |
| `src/auth/` and `src/metering/` | API keys, plans, quotas, request usage, and audit events |

All proposed commercial endpoints live here:

| Dev API endpoints | Owner |
|---|---|
| `/api/v1/assets*`, asset market summaries, candles | `1sat-api` routes + asset/trade projectors |
| `/api/v1/listings*`, `/api/v1/trades` | `1sat-api` routes backed by OrdLock projection |
| `/api/v1/collections*` and collection market analytics | `1sat-api` routes backed by stack collection facts plus commercial joins |
| `/api/v1/search` | `1sat-api` search documents and PostgreSQL indexes |
| `/api/v1/owners/{owner}/portfolio` | `1sat-api` owner-position projection |
| `/api/v1/status` | `1sat-api` dependency health, chain height, checkpoints, and lag |

The dev API does not proxy the stack's 136 low-level endpoints and does not
reimplement protocol admission or validation.

### `1sat-website` Omega: product UI and client adoption

Repository: `~/code/1sat-website`

Branch: `omega`

Omega owns presentation, wallet interactions, and calls to the new customer
contract. Exact integration locations are:

| Existing Omega location | Change |
|---|---|
| `lib/constants.ts` | Replace legacy API hosts with one new commercial API base; keep stack base separately |
| `app/api/autofill/route.ts` | Call the new typed search/assets endpoint |
| `lib/api.ts` | Replace legacy ordinal browse feed with native listing client |
| `app/(main)/market/search/[term]/page.tsx` | Render typed new search results |
| `lib/market-data.ts` | Replace raw worker-status registry with commercial asset/market client |
| `app/(main)/market/bsv21/page.tsx` | Render new catalog and market summary fields |
| `app/(main)/market/ordinals/page.tsx` | Consume the chosen listing contract consistently |
| `components/settings/settings-form.tsx` | Replace the remaining Gorilla content URL with stack content |
| `lib/stack.ts` | Continue to own direct low-level stack clients where a commercial projection is unnecessary |

Omega does not calculate canonical prices, floors, candles, or portfolio
valuation in React. Those calculations live in `1sat-api`.

### Railway: isolation and managed data services

Project: `1sat.market`

Railway owns deployment boundaries, not business schema:

- create a real `development` environment or a separate greenfield project;
- run `api.1sat.market dev` from `upgrade/market-api`;
- provision dedicated development PostgreSQL;
- remove production Redis references from the greenfield service;
- add a dev-only Redis later only if measured need justifies it;
- configure the new API domain, secrets, health check, backups, and restore
  policy;
- keep `api.1sat.market` on `main` and its production Redis untouched.

## Recommended greenfield data model

The initial durable model can remain compact:

| Entity | Identity | Purpose |
|---|---|---|
| `asset` | canonical token ID | BSV-21 catalog and protocol metadata |
| `ordinal` | origin outpoint | immutable identity plus current state pointer |
| `collection` | root outpoint | membership authority metadata and aggregate state |
| `collection_item` | item origin outpoint | immutable membership plus current owner/listing |
| `listing` | listing outpoint | OrdLock offer lifecycle |
| `trade` | sale transaction + listing | verified market event |
| `candle` | market + interval + bucket | deterministic time-series aggregate |
| `owner_position` | owner + asset/origin | materialized wallet position |
| `search_document` | typed resource key | full-text discovery |
| `projection_checkpoint` | source/topic | replay, lag, and operational recovery |

Use PostgreSQL first. It provides durable relational joins, cursor indexes,
full-text/trigram search, transactions, and operational maturity in one system.
Use Redis only if measured hot-query latency requires it. Do not begin with
Kafka, Elasticsearch, or a fleet of microservices.

## Recommended new API surface

Names are proposals, not compatibility aliases:

```text
GET /api/v1/assets
GET /api/v1/assets/{tokenId}
GET /api/v1/assets/{tokenId}/market
GET /api/v1/assets/{tokenId}/candles

GET /api/v1/ordinals/{origin}
GET /api/v1/listings
GET /api/v1/listings/{outpoint}
GET /api/v1/trades

GET /api/v1/collections
GET /api/v1/collections/{collectionId}
GET /api/v1/collections/{collectionId}/items
GET /api/v1/collections/{collectionId}/market

GET /api/v1/search
GET /api/v1/owners/{owner}/portfolio
GET /api/v1/status
```

All collection endpoints should use opaque cursors. List responses should share
one envelope: `data`, `nextCursor`, and `asOf`. Market responses should
include source height/score, calculation window, and freshness.

Low-level TXO, BEEF, broadcast, and protocol-validation APIs remain stack
responsibilities. The commercial API links to canonical identifiers rather
than proxying all 136 stack operations.

## Ingestion and consistency

One deployable projection service is enough for the first release:

1. Backfill canonical facts through stack lookup APIs.
2. Subscribe to stack topic and chain streams for live updates.
3. Normalize events idempotently by outpoint/transaction and source score.
4. Persist the event fact and update affected projections in one database
   transaction where possible.
5. Record per-source checkpoints and expose lag in `/status`.
6. On restart, resume from checkpoints and replay safely.
7. On reorg or conflicting state, invalidate affected projections and rebuild
   from canonical stack facts.

The read API and projector can begin in the same service with separate modules
and processes. Split them only when independent scaling or failure isolation is
demonstrably needed.

## Commercial control plane

Commercialization is orthogonal to legacy migration:

- API keys tied to customers and plans;
- per-key quotas, concurrency limits, and request metering;
- usage export and billing integration;
- documented retention and freshness per endpoint;
- request IDs, structured errors, and audit events;
- public OpenAPI generated from the implemented contract;
- status page and projection-lag visibility;
- explicit redistribution and attribution terms.

Do not promise WebSockets, redistribution rights, full historical depth, or an
SLA until replay, reorg handling, completeness, and support coverage are proven.

### Launch pricing hypothesis

CoinPaprika's first-party pricing inspected on 2026-08-26 was $99 for 400k
requests, $199 for 1M, $799 for 5M, and $1,499 for 10M, with Enterprise above
that. A BSV/1Sat-focused launch can be simpler and cheaper:

| Plan | Price hypothesis | Requests/month | Initial boundary |
|---|---:|---:|---|
| Explorer | $0 | 20,000 | current cached data, personal use |
| Builder | $39 | 250,000 | commercial catalog/search/current markets |
| Market Pro | $129 | 1,000,000 | history, bulk, collection analytics |
| Exchange | $399 | 5,000,000 | higher concurrency and finer candles |
| Enterprise | Custom | Contracted | redistribution/SLA/dedicated capacity only when proven |

Validate these prices against measured cost-to-serve before launch.

## Delivery plan

### Phase 0 — contract and capability decisions

- Create the isolated Railway development environment/project and dedicated
  PostgreSQL before any greenfield schema work.
- Remove shared `REDIS_URL`, `REDIS_PRIVATE_URL`, and `BOT_REDIS_URL` from
  the greenfield service.
- Decide whether BSV-20 and POW-20 are excluded. If retained, define a new
  stack/overlay indexing capability before exposing them in the API.
- Choose the initial commercial API hostname.
- Define canonical identifiers, cursor format, error envelope, and freshness
  semantics.
- Decide the minimum historical backfill needed for a useful beta.

### Phase 1 — clean foundation on dev

- Replace the old route module with a greenfield application boundary on the
  dev deployment.
- Add PostgreSQL, migrations, projection checkpoints, structured logging, and
  health/lag status.
- Connect only to the new stack.
- Implement asset catalog, native OrdLock listings, and typed search documents.

### Phase 2 — Omega integration

- Replace Omega autocomplete and legacy market search with the new API.
- Replace remaining Gorilla content URLs with stack content.
- Present BSV-21 catalog and OrdLock marketplace using new response types.
- Remove legacy API host variables from the Omega deployment.

### Phase 3 — market analytics

- Prove complete listing/sale backfill.
- Materialize trades, summaries, ranking, and candles.
- Publish calculation methodology and reorg behavior.
- Add owner portfolio valuation.

### Phase 4 — collections

- Enable and register the stack collection overlay.
- Build membership, current-state, listing, sales, trait, and aggregate
  projections.
- Decide and document collection verification/authority policy.

### Phase 5 — commercial access

- Add keys, plans, quotas, metering, developer docs, and usage reporting.
- Load-test the actual tier limits.
- Establish retention, backup, restore, and incident procedures.

### Phase 6 — clean launch

- Run Omega and the new API together in the isolated environment.
- Validate user journeys and commercial queries against product acceptance
  criteria, not old wire shapes.
- Point the new domain/environment to the new API only.
- Keep old production separate until the business chooses to retire it.

There is no route-by-route production source migration and no dual-source
runtime. The cutover unit is the new product environment.

## Acceptance criteria

- No import, environment variable, network call, or operational runbook in the
  new API references the legacy production API.
- Development and production do not share database/cache services, credentials,
  volumes, environment-level variables, or writable data.
- The greenfield service has no legacy Redis variables; any future Redis cache
  is separately provisioned and disposable.
- No GorillaPool market/search dependency remains in Omega or the new API.
- Canonical IDs are stack-native outpoints/token IDs.
- All list endpoints have stable opaque cursors and deterministic ordering.
- Market calculations are replayable and documented.
- Projection status exposes source checkpoint, chain height, lag, and last
  successful update.
- Stack outages produce explicit stale/503 behavior, never a hidden source
  switch.
- Collection responses distinguish membership, verification policy, current
  ownership, and market state.
- OpenAPI, SDK examples, and implemented responses agree.
- Usage limits and billing events are tested before paid access opens.
- Backup restore and projector replay are exercised, not merely documented.

## Legacy stabilization context

The old `upgrade/market-api` branch was merged to `main` and remains healthy
on Railway. That was worthwhile production stabilization, but it does not define
the future architecture.

The legacy service still has correctness issues documented in the
[differential review](../1SAT_API_DIFFERENTIAL_REVIEW_2026-08-26.md), including
Redis scan pagination, contains-only search, percentage-change windowing, and
inconsistent version headers. Fix them only when needed to protect the existing
production service. Do not carry those implementations or semantics into the
greenfield API.

## Evidence index

- Legacy routes and behavior: `1sat-api/src`, live OpenAPI, and Railway logs.
- Legacy stabilization: `1SAT_API_DIFFERENTIAL_REVIEW_2026-08-26.md`.
- Stack source: `1sat-stack/pkg/{txo,bsv21,ordlock,collection,owner,ordfs}`.
- Stack live surface: OpenAPI, capabilities, health, and route probes at
  `api.1sat.app`.
- Omega source: `1sat-website` `origin/omega` at `d390968`.
- Commercial benchmark: CoinPaprika API pricing and plan documentation,
  inspected from first-party pages on 2026-08-26.
