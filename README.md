# 1Sat Market API

The compatibility and market-data API behind `https://api.1sat.market` and
1Sat marketplace experiences. It aggregates BSV-20, BSV-21, OrdLock, collection,
balance, quote, mining, and application data from legacy 1Sat infrastructure.

The service is not the same product as `1sat-stack`: the stack supplies modern
protocol/indexing primitives, while this repository supplies market read models
and legacy HTTP contracts. See the
[commercial API and stack migration assessment](docs/COMMERCIAL_API_MIGRATION_ASSESSMENT.md)
for the compatibility matrix and target architecture.

## Runtime

- Bun with TypeScript
- Elysia and OpenAPI/Swagger
- Redis read models and caches
- `@bsv/sdk` transaction primitives
- Railway production and development deployments

## Local development

Install the versioned lockfile exactly:

```sh
bun install --frozen-lockfile
```

Run the service:

```sh
bun start
```

Run validation:

```sh
bun test
bunx tsc --noEmit
bunx --bun biome check .
bun audit
```

The repository uses the text `bun.lock` format. The older binary `bun.lockb`
was removed during the professional API upgrade.

## API and operations

- Production: `https://api.1sat.market`
- OpenAPI UI: `https://api.1sat.market/swagger`
- OpenAPI JSON: `https://api.1sat.market/swagger/json`
- Health/market status: `https://api.1sat.market/status`

Required service configuration includes the primary Redis URL, bot Redis URL,
upstream/application wallet keys used by enabled workflows, and admin Basic Auth
credentials. Never commit those values.

## Documentation

- [Commercial API migration assessment](docs/COMMERCIAL_API_MIGRATION_ASSESSMENT.md)
- [Differential stabilization review](1SAT_API_DIFFERENTIAL_REVIEW_2026-08-26.md)
- [Historical professional API plan](IMPLEMENTATION_STATUS.md)
- [Changelog](CHANGELOG.md)
