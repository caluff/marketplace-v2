# Phase 1 seller RBAC performance

Date: 2026-09-05. Scope: bounded backend initializer optimization in Mercur 2.3.3 / Medusa 2.18.0, without live services.

## Delivered fallback

`patches/@mercurjs__core@2.3.3.patch` changes only the published Mercur initializer at `.medusa/server/src/modules/seller/utils/ensure-seller-default-roles.js:99`:

- Preserve the existing role lookup and missing-role creation order.
- Start the independent policy and role-binding reads together with `Promise.all` after role creation completes.
- Select only `id,key` from policies and `role_id,policy_id` from bindings. Preserve the existing seller-role filter, default pagination behavior, wildcard administration role, returned roles, and grant algorithm.
- Wait for both reads before creating any binding. Errors propagate; subsequent calls retry normally.

For an initialized database, the initializer still performs **three module list calls per invocation**. The dependency chain changes from three sequential read stages to two stages (roles, then policies/bindings). This is not a claim of fewer SQL statements or measured navigation latency. SQL counts, payload sizes, connection-pool behavior, and wall-clock gains were not measured against infrastructure. Concurrent reads can occupy two connections briefly; no polling or new network client is introduced.

No readiness helper, loader, permission cache, TTL, automatic refresh, version cache, or new grant behavior was added. This is the explicitly authorized narrower fallback, not completion of the proposed initialization deduplication.

## Why initialization caching was rejected

The installed initializer at `packages/api/node_modules/@mercurjs/core/.medusa/server/src/modules/seller/utils/ensure-seller-default-roles.js:80` first creates absent roles, then loads **all** policies and bindings, and recreates every absent default binding. It has no persisted marker distinguishing an incomplete initialization from an intentional revocation. The native role and role-policy models have nullable generic metadata, but no Mercur initialization version/provenance or committed readiness state.

Consequences verified by offline tests:

1. Deleting a default binding is reversed by the next invocation in both upstream and the fallback. A cache of successful initialization would merely defer that reversal until a new worker/container, restart, version invalidation, or retry. **Default-binding revocation is therefore an existing upstream limitation, not a property this patch fixes.**
2. Returning early whenever all roles exist would leave roles permanently unconfigured after role creation succeeds but binding creation fails. A retry must distinguish that case from intentional revocation; the existing records do not provide that distinction.
3. Two simultaneous first calls against absent roles can both observe absence and race on role uniqueness. A per-container promise would not serialize other containers. The fallback retains the upstream failure/retry behavior; it does not claim distributed initialization safety.
4. The seller-creation workflow also calls the same initializer. A loader alone cannot remove the middleware invocation or prevent later workflow calls from restoring bindings.

A complete deduplication design needs an explicitly reviewed persisted bootstrap/version policy and atomic initialization/provenance, including how to adopt existing installations and handle revoked or partially initialized defaults. It must never interpret an absent binding as permission to grant it. Adding that migration and changing administration semantics exceeds this bounded fallback. Default policy definitions can change on upgrades; this patch continues reading them on every invocation and has no stale readiness state to invalidate.

## Authorization boundary

The patch does not modify middleware, memberships, actor metadata, role assignment, seller state, or access-policy evaluation. Native `api/utils/ensure-seller-middleware.js:8` still performs the seller-scoped membership query before initialization, and native `api/vendor/middlewares.js:83` retains authentication and seller scoping. Existing graph-cache configuration (`cache.enable: true`) is unchanged; these offline tests do not establish freshness of the native membership cache or end-to-end membership revocation. No user authorization is stored by this change.

## Maintained installation and ownership

Coordinator action, not performed by this worker: register the patch in root `pnpm-workspace.yaml` and update the root lockfile through pnpm:

```yaml
patchedDependencies:
  '@mercurjs/core@2.3.3': patches/@mercurjs__core@2.3.3.patch
```

The patch targets the published compiled file because Mercur ships `.medusa/server`, not its original TypeScript source. No installed `node_modules` file was edited. The test applies the real unified diff to an isolated temporary copy using `git apply`, executes that copied initializer, and also supports an already-patched installation by reversing the patch in the temporary copy first. Review/rebase the patch on a Mercur upgrade; do not apply it blindly to another version.

Worker-owned files:

- `patches/@mercurjs__core@2.3.3.patch`
- `packages/api/src/lib/__tests__/seller-rbac-readiness.unit.spec.ts`
- `docs/reports/phase-1-rbac-performance.md`

## Validation

Focused command: `pnpm --filter @marketplace-v2/api test:unit --runTestsByPath src/lib/__tests__/seller-rbac-readiness.unit.spec.ts`.

Executed results:

- Focused suite: **9 passed**, 1 suite, final run 2.282 seconds reported by Jest.
- `pnpm --filter @marketplace-v2/api exec eslint --no-ignore src/lib/__tests__/seller-rbac-readiness.unit.spec.ts`: passed, no warnings. The default lint invocation ignores unit-test files, so the explicit flag was used.
- `pnpm --filter @marketplace-v2/api typecheck`: failed in concurrently edited files outside this worker's ownership, with no remaining diagnostics in the new RBAC test. Errors were nullable/incorrect inventory properties in `src/lib/catalog/offer-validation.ts:46,77`, nullable values in `src/lib/catalog/product-validation.ts:55,56,81,84,85,90`, and missing warehouse fields/nullable mutation in `src/workflows/__tests__/vendor-application.unit.spec.ts:52–54`. The coordinator must rerun after those owners finish.
- Full API lint/tests/build and installed-patch integration were not run by this worker, per dispatch ownership.

Nine offline tests cover original/patched output and grants, projected read fields, overlapping reads before mutation, separate policy/binding read failures, binding-write failure after role creation, concurrent requests with initialized roles, a separate service container, simultaneous empty-store initialization failure/retry, original and patched default-binding revocation behavior, and policy changes on subsequent calls.

The revocation and empty-store concurrency cases are **characterization of known unsafe upstream behavior**, not passing security/concurrency guarantees. No database, Redis, HTTP server, or load test was used. The coordinator owns final API lint, typecheck, full unit tests, build, patch registration and dependency checks.

## Source evidence

- `node_modules/@mercurjs/docs/package.json`: version 2.3.3.
- `node_modules/@mercurjs/docs/content/platform/store/concepts/team.mdx`: seller-member role and store isolation model.
- `node_modules/@mercurjs/docs/content/references/configuration.mdx`: Mercur RBAC registration.
- `packages/api/node_modules/@mercurjs/core/package.json`: version, exports, and published `.medusa/server` files.
- `packages/api/node_modules/@mercurjs/core/.medusa/server/src/modules/seller/utils/ensure-seller-default-roles.js:80`: lookup, creation, missing-binding grant algorithm.
- `packages/api/node_modules/@mercurjs/core/.medusa/server/src/api/utils/ensure-seller-middleware.js:35`: repeated initializer call after membership retrieval.
- `packages/api/node_modules/@mercurjs/core/.medusa/server/src/workflows/seller/steps/create-seller-default-roles.js:8`: second caller, inside the workflow step.
- Installed `@medusajs/rbac@2.18.0/dist/models/rbac-role.js` and `rbac-role-policy.js`: metadata and uniqueness, no initialization provenance.
- `node_modules/@medusajs/types/dist/rbac/service.d.ts`: `FindConfig` accepted by both list methods; `common.d.ts`: selected field contracts.
- `docs/reports/vendor-navigation-performance.md` and `docs/plans/phase-1-vendor-commerce.md`: baseline and bounded performance requirements.

Repository guidance, Medusa skill/authentication/query references, and Postgres skill/batching reference were reviewed. The implementation is based on the exact installed source and types; no current-cloud or unverified SDK behavior was assumed.
