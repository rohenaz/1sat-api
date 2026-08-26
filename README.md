# 1Sat Market API

The stabilized legacy market-data API behind `https://api.1sat.market`. It
aggregates BSV-20, BSV-21, OrdLock, collection, balance, quote, mining, and
application data for the existing production experience.

This production service is not the architecture for the new 1Sat Wallet
paradigm. The greenfield commercial API will use `1sat-stack` exclusively,
adopt stack-native identities and data models, and integrate with the Omega
website without preserving this service's wire contracts or runtime fallbacks.
See the
[greenfield capability and architecture assessment](docs/COMMERCIAL_API_MIGRATION_ASSESSMENT.md)
for the feature map and delivery plan.

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

- [Greenfield commercial API architecture](docs/COMMERCIAL_API_MIGRATION_ASSESSMENT.md)
- [Differential stabilization review](1SAT_API_DIFFERENTIAL_REVIEW_2026-08-26.md)
- [Historical professional API plan](IMPLEMENTATION_STATUS.md)
- [Changelog](CHANGELOG.md)
