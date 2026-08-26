# 1Sat API differential review

Date: 2026-08-26

Reviewer: Codex

Base: `main` at `985b5a95a64cb14af8e79707abee461ea177b892`

Head: `upgrade/market-api` at `f7534d81f6da29ff705a293921e12decb0244c22`

Merge base: `985b5a95a64cb14af8e79707abee461ea177b892`

## Resolution update

Follow-up commits `1d3bda6` and `bb65557` close the review findings:

- Elysia upgraded to 1.4.29.
- `@bsv/sdk` upgraded to 2.4.1, clearing the remaining BRC-104 audit finding.
- Unused `lodash`, `@types/lodash`, and `ultracite` dependencies removed.
- Compatible direct and transitive dependencies refreshed; `bun audit` reports no advisories.
- Discord claim-check now awaits a dedicated, regression-tested on-chain lookup.
- Claim lookup fails closed with HTTP 503 when the upstream cannot be verified; only an actual 404 is treated as unclaimed.
- Shared upstream requests now have a 10-second per-attempt timeout and support caller cancellation.
- Retry/error-path coverage expanded for 429, persistent 5xx, network rejection, invalid JSON, cancellation, timeout, and non-array payloads.
- Basic Auth username and password comparisons are evaluated unconditionally.
- Redis initialization now uses a one-time connect listener to prevent duplicate startup jobs after reconnects.

Local resolution validation: 20 tests passed with 45 assertions, TypeScript passed, Biome passed, Bun 1.3 frozen install and production bundle passed, and the dependency audit is clean. A non-broadcasting transaction-signing smoke test also verified the upgraded BSV SDK's WIF, address, P2PKH locking/unlocking, transaction signing, and serialization path using the configured dev key without printing key or transaction material. The original findings and rationale are retained below for review history.

Railway resolution validation: dev deployment `b5ed3f3d-04df-4904-8d07-acaa16df5343` succeeded from commit `bb65557`. Sequential GET/HEAD smoke checks for root, Swagger, status, and BSV20/BSV21 autocomplete all returned HTTP 200. Basic Auth returned 401 for missing/invalid credentials and passed valid credentials through to routing. Railway recorded no error-level deploy logs, 5xx responses, or 499 responses in the verification window.

## Original verdict

**Request changes before merging.**

The branch is a meaningful operational improvement and no regression was observed in its primary goals: the dev Railway deployment starts cleanly, cache-backed routes respond quickly, HEAD requests work, transient upstream failures are retried, expected 404s no longer pollute error logs, and Basic Auth still fails closed.

Four items should be addressed before calling the upgrade production-ready:

1. Upgrade Elysia from 1.4.17 to 1.4.29; 1.4.17 is still in three security-advisory ranges.
2. Fix the inherited missing `await` in the Discord claim-check route.
3. Add a bounded timeout to the shared upstream HTTP helper.
4. Avoid short-circuiting the two credential comparisons in the new Basic Auth guard.

The first three are merge-readiness items. The fourth is a low-severity hardening change.

## Scope and risk

There is no open GitHub PR for this branch at review time, so this report reviews the exact `main...upgrade/market-api` range.

- 5 commits ahead of `main`
- 10 changed files
- 314 insertions, 58 deletions
- 30 TypeScript source files in the repository
- Risk classification: **high** because the diff changes the public HTTP framework, authentication, Redis startup behavior, and all shared upstream JSON requests

Changed files:

- `bun.lock`
- `package.json`
- `src/auth.ts` and `src/auth.test.ts`
- `src/http.ts` and `src/http.test.ts`
- `src/index.ts` and `src/index.test.ts`
- `src/init.ts`
- `src/utils.ts`

## Findings

### [High, merge blocker] Elysia 1.4.17 remains in three advisory ranges

Location: `package.json:21`

The branch improves Elysia from 1.4.12 to 1.4.17, which removes the critical standalone-schema prototype-pollution finding present on `main`. However, `bun audit` still reports 1.4.17 as affected by:

- high-severity cookie-configuration code injection (`<1.4.18`)
- high-severity URL-format ReDoS (`<1.4.26`)
- moderate cookie-value prototype pollution (`<1.4.27`)

No cookie access or URL-format validator was found in this application, so a currently exploitable route was not demonstrated. The service is nevertheless public-facing, the affected package is its request framework, and the remediation is low risk.

**Failure/attack scenario:** a later route or plugin begins using an affected cookie or URL-validation path while the framework remains pinned inside a known vulnerable range, exposing the entire public API process to injection, denial of service, or object mutation.

**Verified remediation:** in an isolated checkout of this exact head, Elysia 1.4.29 passed all nine tests, `tsc --noEmit`, and Biome. The three Elysia audit findings disappeared.

Recommendation: update `elysia` to 1.4.29 and commit the regenerated `bun.lock` before merge.

References:

- https://github.com/advisories/GHSA-8vch-m3f4-q8jf
- https://github.com/advisories/GHSA-f45g-68q3-5w8x
- https://github.com/advisories/GHSA-8hq9-phh3-p2wp

### [High, inherited functional defect] Discord claim-check never reaches the unclaimed branch

Location: `src/index.ts:1169`

`fetchJSON()` is asynchronous, but this route does not await it:

```ts
const tx = fetchJSON(url);
if (!tx) {
  // unclaimed
}
```

The resulting Promise is always truthy, so a user with a valid win or airdrop is always sent down the `claimed: true` path with HTTP 409. Git history shows this was introduced in commit `69b1fa1` on 2024-04-17, not by the upgrade branch. Moving `fetchJSON` to `src/http.ts` preserves the bug.

**Failure scenario:** an eligible user checks a transaction that does not exist on-chain; the API incorrectly reports it as already claimed and prevents the intended claim flow.

Recommendation: change this to `const tx = await fetchJSON(...)` and add route-level tests for both upstream 200 and 404 responses.

### [Medium, availability] Shared upstream requests still have no application deadline

Locations: `src/http.ts:6-10`, `src/http.ts:15-47`

The retry helper handles 429, 5xx, and rejected fetches, but it cannot retry a fetch that remains pending because it does not accept or create an abort signal. The helper now serves 26 active production call sites across route handlers, cache initialization, collections, status, exchange rates, and ticker enrichment.

**Failure scenario:** an upstream accepts a connection but never completes its response. A public request remains open, or initialization stalls before SSE/status startup. Enough simultaneous hung requests can exhaust service concurrency.

Recommendation: add a configurable timeout using an `AbortSignal`, combine it safely with any caller-provided signal, and test timeout/retry/final-failure behavior. Consider honoring `Retry-After` for 429 responses and adding small jitter to retries.

### [Low, branch hardening] Basic Auth comparisons now short-circuit

Location: `src/auth.ts:73-77`

The replacement guard uses an `&&` chain. Missing fields skip both timing-safe comparisons; an unknown username performs one comparison and skips the password comparison; a known username performs both. The removed authentication plugin accumulated both comparison results instead of short-circuiting them.

**Attack scenario:** a remote attacker samples many authentication response times and distinguishes a configured username from an unknown username. Network noise and the low secrecy of Basic Auth usernames limit practical impact, but the new guard needlessly weakens the prior timing behavior around a sensitive admin route.

Recommendation: always compute username and password equality first, then combine the booleans with the non-empty check. Keep returning the same 401 body and challenge for every failure mode.

### [Medium, inherited dependency hygiene] Unused production dependencies expand the audit surface

Locations: `package.json:20`, `package.json:25-26`

`lodash`, `@types/lodash`, and `ultracite` are installed as production dependencies but are not imported by runtime source. The current lockfile consequently includes:

- vulnerable Lodash findings, including a high-severity template code-injection advisory
- vulnerable `@trpc/server` through development-only `ultracite`
- vulnerable transitive `nanoid` and `file-type` releases

This is inherited from `main`, not introduced by the branch. No reachable Lodash or tRPC path was found, but Railway installs and ships these packages unnecessarily.

**Failure/attack scenario:** an unused package becomes imported later or a compromised/unnecessary dependency executes an install/runtime path, creating exposure that the service does not need for its feature set.

**Verified remediation:** in an isolated checkout, removing `lodash`, `@types/lodash`, and `ultracite`, updating compatible dependencies, and using Elysia 1.4.29 passed tests, TypeScript, and Biome. `bun audit` then reported only the existing `@bsv/sdk` BRC-104 advisory.

Recommendation: remove the three unused packages and refresh compatible transitive versions. If Ultracite is intentionally retained as tooling, move it to `devDependencies` and update it.

The remaining `@bsv/sdk` advisory affects BRC-104 peer authentication. This service currently imports transaction, key, and P2PKH primitives rather than the affected Peer authentication flow, so it is tracked as dependency debt rather than a demonstrated application vulnerability.

References:

- https://github.com/advisories/GHSA-r5fr-rjxr-66jc
- https://github.com/advisories/GHSA-vjpq-xx5g-qvmm

## Regression and behavior review

### Authentication

- Unit coverage verifies out-of-scope bypass, valid credentials, missing credentials, malformed authorization, invalid credentials, status 401, and the Basic challenge header.
- Live dev Railway integration check:
  - missing credentials on `/admin/probe`: 401 with challenge
  - valid credentials sourced from Railway on `/admin/probe`: 404 without challenge, proving the request passed the guard
  - invalid credentials: 401 with challenge
- Credential values were not printed or persisted.
- The guard fails closed when the environment variable is absent or empty.

### HTTP and HEAD behavior

- Async static and parameterized GET route HEAD semantics pass under the upgraded Elysia release.
- Retry behavior passes for a 500 followed by success.
- 404 is not retried and is normalized to `null`/an empty array without error logging.
- Remaining test gaps: 429, rejected-network recovery, persistent 5xx, persistent rejection, invalid JSON, non-array success payloads, and timeouts.

### Redis startup isolation

- Startup/cache-refresh work now runs over `initRedis`, a duplicate ioredis connection, rather than occupying the request-serving Redis connection.
- `loadV1TickerDetails` and `loadV2TickerDetails` also use this connection when invoked from four public route call sites and two SSE call sites, not only during initial startup. This broad blast radius appears consistent with isolating cache-refresh traffic, but it should receive an automated concurrency/reconnect test.
- Reconnection still re-enters the full initialization callback and may start duplicate long-lived jobs; this behavior existed on `main`, but the startup refactor is a good place to make initialization idempotent.

### Live dev Railway smoke test

Deployment: `293abebf-d5f0-4489-8975-0a919de61a6e` at commit `f7534d8`

- Deployment status: success
- BSV20 autocomplete GET/HEAD: HTTP 200, approximately 0.8-1.3 seconds during the cold-start check
- BSV21 autocomplete GET/HEAD: HTTP 200, approximately 0.11-0.13 seconds
- 12 sampled requests: all HTTP 200
- No build/runtime errors, 5xx responses, or 499 responses observed in that verification window
- Static endpoints, Swagger, and status endpoints previously passed GET/HEAD smoke checks

This is a substantial improvement over the earlier shared-Redis behavior, where BSV20 autocomplete requests stalled for roughly 20-25 seconds and terminated as timeouts/499s.

## Validation executed

On `upgrade/market-api`:

- `bunx bun@1.3.0 test --coverage`: 9 passed, 0 failed, 19 assertions
- `bunx tsc --noEmit`: passed
- `bunx --bun biome check .`: passed
- `git diff --check main...HEAD`: passed
- frozen Bun install and production-like Bun build: passed
- Railway dev deployment and endpoint smoke checks: passed

Coverage for the newly extracted helpers:

- `src/auth.ts`: 100% functions, 96.43% lines
- `src/http.ts`: 100% functions, 62.22% lines
- combined changed helper files: 79.33% lines

Isolated remediation candidate:

- Elysia 1.4.29
- removed unused `lodash`, `@types/lodash`, and `ultracite`
- refreshed compatible lockfile dependencies
- 9 tests passed
- TypeScript passed
- Biome passed
- audit reduced to the existing moderate `@bsv/sdk` BRC-104 advisory

## What the branch gets right

- Removes the stale third-party Basic Auth plugin that blocked newer Elysia versions.
- Adds focused tests for authentication and the Elysia HEAD regression.
- Centralizes upstream JSON handling and adds bounded retry count.
- Avoids retrying expected 404s and avoids logging them as application errors.
- Separates heavy cache-refresh traffic from request-serving Redis traffic.
- Passes type checking, formatting, unit tests, and real Railway smoke checks.
- Uses text `bun.lock`; both `main` and the upgrade branch have migrated away from `bun.lockb`.

## Recommended merge sequence

1. Upgrade Elysia to 1.4.29 and refresh `bun.lock`.
2. Remove or correctly classify unused production dependencies and refresh compatible transitives.
3. Fix and test the missing `await` in the Discord claim-check route.
4. Add an HTTP timeout plus the missing retry/error-path tests.
5. Make both Basic Auth comparisons unconditional.
6. Re-run the full local suite and Railway dev smoke test.
7. Merge to `main`, verify the production deployment and key website API flows, then rebase the upgrade branch only if additional upgrade work remains.

## Confidence and residual risk

Confidence: **high** for the dependency, missing-await, timeout, and authentication findings; **medium-high** for full production compatibility because tests are limited and the API depends on live Redis and multiple external services.

Residual risk after the recommended changes is primarily in untested route-level behavior, Redis reconnect/idempotency behavior, and external-service failure modes. No regression was observed in the branch's intended production fixes.
