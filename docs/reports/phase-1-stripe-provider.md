# Phase 1 native Stripe Connect provider

The coordinator relayed the user's later preference for native Mercur flows. This supersedes the dispatched Accounts v2 adapter: this work preserves `@mercurjs/payout-stripe-connect@2.3.3`, Accounts v1 Express, hosted onboarding, native PayoutAccount/Onboarding and workflows. No custom provider, embedded Account Session, thin-event handler, durable journal, legal acceptance or money job was created.

## Delivered integration contracts

`packages/api/src/lib/stripe-connect/provider-client.ts` contains pure input guards, despite the originally assigned client filename:

- `getNativeStripeAccountInput(body: unknown): CreatePayoutAccountInput` accepts only `{data:{country:"US"}}` and optionally an empty context. It rejects caller account IDs, metadata and idempotency context. Mercur remains responsible for generating local account metadata and its native idempotency key.
- `getNativeStripeOnboardingInput(body: unknown, {returnUrl,refreshUrl}): CreateOnboardingInput` fills server-owned redirects, accepts supplied URLs only when they match exactly, and rejects account/context overrides. It permits HTTPS or local HTTP development hosts, prohibits credentials/fragments, and requires one origin.

`packages/api/src/lib/stripe-connect/native-guards.ts` exports:

- `guardNativeStripeConnect(req,sellerId)`: root calls this from its authenticated vendor guard. It blocks account GET/POST/onboarding when root's test Stripe configuration is unavailable, preserves native ownership validation through `validateSellerPayoutAccount`, and replaces raw/validated body with safe native input. Native policy/RBAC handling must remain registered.
- `nativeStripePayoutWebhookGuard(req,res,next)`: root registers this before native `POST /hooks/payout`, preserving raw request bytes and bounding the parser to 256 KB. It rejects missing/oversized bodies, verifies through the native payout provider before querying data or enqueueing, requires signed `livemode:false`, verifies `event.account === event.data.object.id`, checks signed metadata against the provider result and local PayoutAccount `data.id`, disables query cache, and replaces parsed request body with the verified body. Unsupported verified events receive 200 without queueing. Native signature errors are replaced with a generic message.

The helpers do not install middleware, change configuration or expose routes by themselves; root owns registration. The webhook guard deliberately retains the native provider's second signature check in its queued subscriber. It does not replace native webhook processing or establish event ordering. The maintained package patch below adds current-state hydration at both native verification calls.

## Installed native contracts and observed behavior

Inspected `packages/api/node_modules/@mercurjs/payout-stripe-connect/dist/index.js`, its declarations/package manifest, `@mercurjs/types/dist/payout/*`, and `@mercurjs/core/.medusa/server/src/{modules/payout,workflows/payout,api/vendor/payout-accounts,api/hooks/payout,subscribers/payout-webhook}`. Provider manifest declares Stripe `^15.5.0`; no direct newer SDK dependency is needed for this integration.

| Surface | Exact behavior in the installed provider/core |
| --- | --- |
| Provider registration | Default ESM module export contains `services[0]`; identifier is `stripe-connect`; configure under `@mercurjs/core/modules/payout` with `apiKey`, `webhookSecret`, optional `accountValidation`. |
| Account creation | `stripe.accounts.create({type:"express",country:data.country,metadata:{account_id:data.account_id}}, {idempotencyKey:context.idempotency_key})`; country is required; email, seller metadata, explicit capabilities and controller settings are not forwarded. |
| Native workflow | `createPayoutAccountWorkflow({seller_id,data,context})` validates existing seller account, creates provider account, and links seller/PayoutAccount. Local account ID is authoritative metadata. Caller context can override the native default idempotency key, which this task's guard prevents. |
| Native onboarding route | `POST /vendor/payout-accounts/:id/onboarding` checks the seller/local account link and runs `createOnboardingWorkflow({account_id,data,context})`. |
| Hosted onboarding | Provider requires `data.id`, `data.refresh_url`, `data.return_url` and creates `accountLinks` of type `account_onboarding`. URLs belong in `data`, despite an older high-level documentation example using `context`. |
| Onboarding persistence | Module merges persisted Stripe account data then caller data; caller `data.id` can otherwise replace Stripe account ID despite local ownership checking. The guard removes this entry point. Native Onboarding persists AccountLink data (`url`, expiry, etc.); no `client_secret` is involved. |
| Webhook | Standard signed snapshot `account.updated` only; `constructEvent(rawData,headers["stripe-signature"],webhookSecret)`. Native `/hooks/payout` otherwise queues before verification; root must register prequeue guard. |
| Readiness | Defaults require details submitted, charges enabled, payouts enabled, no currently/past due or pending verification requirements. `requiredCapabilities` defaults to `[]`; specifying `["transfers"]` adds V1 transfer capability checking. Native default is not V2 recipient-only readiness. |
| Transfer | `createPayout` calls `stripe.transfers.create`; USD 49.99 is converted to 4999 only at Stripe boundary. Destination is stored account `data.id`, transfer group is order ID, and idempotency context is forwarded. Native result is `PAID` on Transfer creation, not proof of bank settlement. |
| Amount | Native `createPayoutWorkflow` computes `order.total - sum(commission_line.amount)` for items and shipping methods; it does not implement the earlier detailed refund/debt policy. |
| Source transaction | Provider supports `data.source_transaction`; inspected native `createPayoutWorkflow` does not supply it. The guide's claim that every transfer is linked to the original charge is not established by this source. |

## Maintained security patch and remaining limits

The unpatched native provider maps signed snapshot metadata directly. It does not check event livemode or compare event account/object IDs, and does not retrieve latest remote account state. The prequeue guard adds test mode/local identity binding for the HTTP entry point. By itself it cannot prevent a delayed activation snapshot processed after a newer restriction from changing native account state; direct internal subscriber invocation also bypasses HTTP checks.

Implemented `patches/@mercurjs__payout-stripe-connect@2.3.3.patch`, with root retaining dependency/lock registration: after native signature verification, for `account.updated`, require `event.livemode === false`; require `event.account === snapshot.id` and nonempty `snapshot.metadata.account_id`; retrieve `this.stripe_.accounts.retrieve(snapshot.id)`; require the returned non-deleted account's `id` and `metadata.account_id` equal the signed identity; pass the latest account to existing `getWebhookResultFromAccount_`. Status mapping remains native. This is security hydration, not a V2 migration. Tests apply the actual patch using `git apply` in a temporary directory, support both patched/unpatched installed packages, and prove rejection on retrieval failure and zero reads for unsupported events/signature failures. No installed package was edited by this worker.

The patch prevents replaying an old active snapshot from overriding an account that is currently restricted at retrieval time. Simultaneous retrieve/update races still need assessment; strict serialization is not delivered here. Each accepted HTTP event is read remotely once in the prequeue guard and once again in the native queued subscriber. The latter retrieval checks current state at processing time. Root must register the patch before exposing this webhook, and money jobs remain a separate activation decision.

Native account creation is not a durable cross-request journal: native local IDs and compensation govern retry behavior. A provider response lost after Stripe success, or native rollback/retry producing a new local ID, needs explicit recovery validation; this task does not claim exactly-once creation. AccountLink refresh intentionally makes a new native link.

## Business-rule differences retained for later decision

- Accounts v1 Express and hosted Stripe links replace the earlier v2 recipient-only embedded setup preference. Native code does not explicitly configure the earlier application fee/loss controller dimensions or send trusted email/seller metadata; confirm Dashboard configuration separately.
- Native manual authorization at checkout and later capture replace immediate capture. Default documented fulfillment requirement is `fulfilled`, authorization window seven days, seller action window 72 hours and safety buffer one day.
- Native documented daily eligibility is capture + active account + no payout; it has no seven-days-after-confirmed-delivery rule, issue-specific holds, delivery confirmer permissions, or debt recovery journal.
- Installed platform payout documentation says capture/daily jobs and their request subscribers are project wiring, not bundled core scheduling. Configuration alone does not prove that pipeline runs. Core does bundle payout workflows and webhook subscriber.
- Provider creates Transfers and immediately returns PAID; the inspected provider handles no bank `payout.*` events. Do not represent this as bank-arrival tracking.
- Charge refund and Transfer reversal are separate; earlier commission/refund/return-shipping/debt rules are not certified by native code. No payment/release workflow was modified here.

## Verification

Tests use synthetic account/event data and an injected offline Stripe client. Native ESM source is evaluated with mocked account/link/transfer methods; its installed SDK's real webhook verifier validates locally generated HMAC signatures. No real Stripe API, shared database/Redis, dependency install, server or CLI listener was used.

The provider tests cover country/metadata/idempotency input, safe and swapped onboarding IDs/URLs, active/missing/pending/inactive capabilities, requirements/rejection, real missing/tampered/wrong-secret signature failures, native missing live/ID checks, duplicate stale snapshot behavior, and USD conversion using a mocked transfer. Guard tests cover unconfigured native fallback, ownership, validated body replacement, signature-before-query, payload bounds, test/live and account mismatch, absent local account, and unsupported-event no-enqueue behavior.

Executed validations:

- `pnpm test:api`: 25 suites / 307 tests passed before adding the maintained-patch cases.
- Focused provider + guard tests after the patch: 2 suites / 64 tests passed, including all 15 new patched-provider cases.
- `pnpm typecheck:api`: passed, including the final added patch cases.
- Targeted ESLint on the new production helper files: passed. The repository ESLint configuration ignores unit-test files; their validation comes from TypeScript and executed Jest cases.
- `pnpm lint:api` and `pnpm build:api`: both failed on 11 `step-must-return-step-response` errors in `src/workflows/steps/backfill-vendor-warehouse.ts`, outside this task. Six additional unrelated internal-import warnings were reported. No Stripe files were reported by lint.

Root owns the final shared checks after all parallel changes, middleware and patch registration. No real Connect creation/onboarding, remote webhook retrieval, native SQL persistence or queue delivery was verified here. Worker-started check processes finished; no background service was started.

## Sources

- Version-matched local documentation: `node_modules/@mercurjs/docs/content/resources/integrations/stripe-connect.mdx`, `content/platform/payout/concepts/payout-pipeline.mdx`, `content/platform/payout/guides/create-a-payout-account.mdx`, `content/learn/payouts.mdx`.
- Installed source/types listed above take precedence where the high-level examples differ.
- Current Stripe SDK signature reference queried through Context7: [Stripe webhook signing example](https://github.com/stripe/stripe-node/blob/master/examples/webhook-signing/express/main.ts), [Stripe webhook implementation](https://github.com/stripe/stripe-node/blob/master/src/Webhooks.ts).
