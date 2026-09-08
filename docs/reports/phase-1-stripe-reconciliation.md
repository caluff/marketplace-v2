# Phase 1 — Stripe account reconciliation

Completed the prior draft for native Mercur 2.3.3 Stripe Express Accounts v1, using the installed Stripe 15.12.0 SDK as explicitly requested. This task did not install dependencies, restart services, inspect credentials, call Stripe, or mutate a database.

## Result

- `POST /vendor/stripe-account-refresh` accepts a strict empty body and takes member, auth identity, and seller identity exclusively from authenticated request context. It returns only the native payout account ID/status with private no-store headers and sanitized errors.
- The vendor workflow verifies current auth identity, active membership, open seller/application access, and the membership role's `payout_account:update` policy. It resolves the seller's sole native payout account rather than accepting a client-supplied account ID.
- Manual refresh and the coordinator-owned patched native webhook subscriber both use workflow `reconcile-stripe-account` and the shared `payout-account-status/<pacc ID>` lock. Each call acquires a unique-owner lock without expiry; overlap fails before Stripe access, and the successful owner releases in `finally`. The Stripe account is fetched after acquiring that lock, using the configured test key, a 10-second request timeout, and no SDK retries.
- Reconciliation checks US/Express type, remote account ID, native `metadata.account_id`, deleted/live flags when present, and sole seller/account links in both directions. It checks links and local remote ID again after Stripe responds; vendor requests additionally recheck access and role permissions. Missing or conflicting identity fails closed.
- Account API v1 objects do not ordinarily expose a `livemode` property. Test isolation relies on the validated test API key; a returned live-mode property is rejected. The existing coordinator-owned webhook guard additionally validates signed event mode before enqueueing.
- Status mapping follows the installed native provider's `accountValidation` defaults, including pending verification and required capabilities. Persistence changes only native `status`, skips redundant writes, and intentionally has no compensation that could restore stale provider state.
- The payments page preserves its static heading and test-environment notice while streaming the account card under local Suspense. Returning from Stripe consumes `returned=1` before making one automatic refresh; ordinary visits do not refresh automatically. Manual refresh remains available with pending state, inline feedback, and the existing Sonner feedback adapter. Success/restricted/rejected observations refresh the card; failures retain the previous recorded state with an explicit unverified-again message.

## Changes made while finishing the draft

The webhook path previously checked only the payout-account-to-seller direction. Added seller-to-payout-account uniqueness checks before and after the remote lookup, so corrupt multi-account seller links also fail closed for webhooks. Preserved Next navigation exceptions in the onboarding action with `unstable_rethrow`, aligned the reconciliation step ID with its name, formatted the assigned draft, and added dedicated reconciliation, route, SDK, and component-callback tests. Replaced expiring `locking.execute` after the coordinator requested verification of its installed semantics.

## Lock lifetime and deliberate recovery

Installed Medusa Redis 2.18.0 `services/redis-lock.js` lines 85–107 show that `execute({ timeout: 30 })` sets both the acquisition wait deadline and a 30-second lease, uses owner `*`, and does not cancel its callback after expiry. A slow callback could therefore write stale status or release a newer owner's lock. Merely extending the timeout or checking a clock before an asynchronous DB write does not prevent this race.

The final implementation uses `acquire(key, { ownerId: randomUUID() })` with no `expire` and releases that same owner only after callback completion. Installed `acquire_` passes TTL zero when expiry is omitted; its Lua adds `EX` only for positive TTL. A behavioral test executes that installed provider against a fake Redis command adapter and confirms TTL zero and matching release ownership. Overlapping requests fail closed; a later manual refresh or webhook redelivery fetches fresh state. Acquisition failure never enters `finally`, so it cannot release someone else's lock.

A process crash, ambiguous Redis acquisition failure, or failed release can leave a permanent orphan lock. **There is no automatic unlock, age-based deletion, or background cleanup.** Recovery requires an operator to quiesce reconciliation writers for the affected account, confirm the original writer cannot resume (including any in-flight database write), identify the exact account lock and recorded owner, then release only that exact owner through the locking module. Never use `releaseAll`, wildcard-owner cleanup, or delete locks merely because a request timed out. After deliberate recovery, retry reconciliation to fetch the latest Stripe observation. This availability tradeoff was explicitly confirmed by the coordinator; no recovery or infrastructure action was executed in this task.

## Validation

- API focused Jest suites: **107 tests passed** across account reconciliation, refresh route, native webhook subscriber, native route/webhook guards, patched provider behavior, and Stripe configuration; affected suites were rerun after the lock change.
- Vendor Stripe tests: **17 tests passed**, including SDK scope/body/cache, no automatic refresh on ordinary visits, duplicate effect execution, one-time return consumption, success/warning/error feedback, and explicit manual retry.
- `pnpm lint:vendor`: passed.
- `pnpm typecheck:vendor`: passed.
- `pnpm lint:api`: passed with warnings; the only warning in this ownership area was the step ID, subsequently fixed and verified with targeted ESLint. Remaining warnings observed were in other workers' commerce automation, inventory, and storage files. API test files are excluded by repository ESLint configuration.
- `pnpm typecheck:api`: passed on the final run. An earlier run encountered a concurrently missing commerce-automation service, now resolved; a subsequent route-test request generic was corrected before the final pass.

Concurrency tests use a deterministic exclusive locking fixture and deferred remote responses; UI tests execute transpiled component callbacks with hook/action adapters. These are unit checks, not Redis integration, real browser hydration/streaming, or an actual Stripe onboarding session. Coordinator owns full API/vendor builds and integrated QA; no live financial operations were performed.

## References reviewed

- Repository AGENTS and installed Medusa workflow/API-route guidance.
- Installed Stripe integration/security, Next.js, shadcn, React, and Orca skills.
- Version-matched `node_modules/@mercurjs/docs/content/platform/payout/concepts/accounts-and-onboarding.mdx`, `account-lifecycle.mdx`, and `resources/integrations/stripe-connect.mdx`.
- Installed `@mercurjs/payout-stripe-connect/dist/index.js` account status mapping and account creation metadata; existing repository auth, SDK, feedback, native guards, and webhook patch tests.

The confirmed partial/72-hour-hold business policy remains coordinator/automation-worker scope and did not require another readiness-flow decision for this reconciliation task.
