# Vendor onboarding backend handoff

Implemented against installed Mercur 2.3.3 and Medusa 2.18.0 on 2026-09-04/05. This report covers the API, generated transport contracts, dependency manifests, and test-script changes owned by API dispatch `ctx_a732d0e19a46`; application interfaces belong to the coordinator and frontend workers.

## Delivered behavior

- A registered customer and the exact live email/password auth identity own one permanent application. Draft saves, submission snapshots, consent version, corrections, final decisions, review reasons, immutable history, and customer-scoped notices persist in a dedicated module.
- Full strict framework Zod schemas reject actor IDs, roles, status overrides, unknown properties, oversized bodies, unsafe URLs, and control characters. Submission supports individuals and companies with a US business address, valid US phone/state/ZIP, native configured currency, and active public backend categories. No tax, KYC, bank, payment, payout, or checkout data was introduced.
- Version compare-and-swap, transaction-scoped PostgreSQL advisory/row locks, durable UUID request hashes, and native workflow locks serialize writes. The application, mutation receipt, and history event commit in one module transaction. A replay with altered content/actor fails; a pending approval stays fenced.
- Approval calls native `createSellerAccountWorkflow` with an explicitly trusted member ID, then native `approveSellerWorkflow`. Native ownership and seller administration roles are reused. An existing member is reused only through the same auth identity's existing member metadata; email lookup never associates an identity with a member.
- New member IDs are journaled before creation. Custom auth binding preserves buyer metadata and removes only this operation's member key during compensation. Existing members/identities are never deleted by compensation. Reconciliation handles committed writes whose responses were lost; uncertain final database outcomes retain fenced native resources and return processing rather than deleting a possibly approved seller.
- Live middleware checks current auth binding, active membership, seller ownership, and an open seller on native operational vendor routes. Native seller discovery remains available for access-status UI, while the scoped current-member read requires a live active membership. Application-managed sellers additionally require committed approval. Public seller registration stays blocked. Native admin mutation cannot bypass application approval or change its managed binding marker.
- Native product detail/preview/nested mutations reject another seller's private product while retaining eligible published shared catalog access. Inventory mutation checks cover both owned items and owned locations, including batch/location-level IDs.
- Setup checks query actual native profile, locations, owned products/offers, and inventory at owned locations. Approval does not manufacture a configured store.

## Contracts and routes

`packages/vendor-onboarding-contracts/index.d.ts` is generated from the backend's exported schema-inferred aliases by `packages/api/scripts/generate-onboarding-contracts.cjs`. It has no backend runtime imports. Native seller/customer fields retain published `Pick` contracts. All three apps have the workspace package as a development dependency.

Primary exports: `ApplicationStatus`, `ApprovalState`, `WizardStep`, `BusinessAddress`, `DraftData`, `SaveApplicationBody`, `SubmitApplicationBody`, `ReviewApplicationBody`, `ReadNotificationsBody`, `ApplicationView`, `ApplicationResponse`, `ApplicationNotification`, `ApplicationOptionsResponse`, `ApplicationNotificationsResponse`, `ReadNotificationsResponse`, `VerificationResponse`, `AdminApplicationEvent`, `AdminApplicationSummary`, `AdminApplicationView`, `AdminApplicationResponse`, `AdminApplicationListResponse`, `ReviewApplicationResponse`, `SellerSummary`, `ApplicantSummary`, `SetupCheck`, and `VendorOnboardingResponse`.

| Endpoint | Contract |
| --- | --- |
| GET /store/vendor-application | ApplicationResponse |
| POST /store/vendor-application | SaveApplicationBody → ApplicationResponse |
| POST /store/vendor-application/submit | SubmitApplicationBody → ApplicationResponse |
| GET /store/vendor-application/options | ApplicationOptionsResponse |
| POST /store/vendor-application/verification | Empty object → VerificationResponse; 503 without delivery provider |
| GET /store/vendor-application/notifications | ApplicationNotificationsResponse with limit/offset |
| POST /store/vendor-application/notifications/read | ReadNotificationsBody → ReadNotificationsResponse |
| GET /admin/vendor-applications | AdminApplicationListResponse with status/q/limit/offset |
| GET /admin/vendor-applications/:id | AdminApplicationResponse |
| POST /admin/vendor-applications/:id/review | ReviewApplicationBody → ReviewApplicationResponse; 202 when processing |
| GET /vendor/onboarding | VendorOnboardingResponse |

Admin operations recheck live user roles and seller read/update permissions; empty roles and nonhuman API-key actors cannot review. Responses explicitly whitelist transport fields and disable caching.

## Migrations and database boundaries

`Migration20260905012452.ts` was generated with the native CLI and hardened with permanent uniqueness, audit/identity triggers, RLS, and revocation of PUBLIC/anon/authenticated privileges on the three new tables. The coordinator reported successful application and verified the three new tables' protection. This worker did not run migrations and has preserved the applied file unchanged since that report.

`Migration20260905015700.ts` is a separate additive migration pinning the invoker audit function's search path to the empty string. The native generator was rerun and reported no model changes; function configuration needs this explicit migration. It was handed to the coordinator unapplied. It references only the new function in `public` and changes no existing commerce tables.

Read-only module links join the application's scalar customer, seller, and member IDs. This uses native module links without a second non-atomic ownership journal in join tables.

```powershell
pnpm --dir packages/api exec medusa db:generate vendorOnboarding
pnpm --dir packages/api exec medusa db:migrate --skip-scripts --execute-safe-links
```

The first command only generates migrations. The second changes the selected database and is reserved for the coordinator/operator. Existing Supabase commerce/auth tables were observed with RLS disabled and broad browser-role privileges; that preexisting exposure was escalated to the coordinator and was not silently altered by this feature.

## Verification actually executed

Before the final function-only migration, all of these passed on the final feature source:

```powershell
pnpm lint:api
pnpm typecheck:api
pnpm test:api
pnpm build:api
pnpm --filter @marketplace-v2/api contracts:check
pnpm peers check
```

Results: clean lint without warnings; successful TypeScript check; 8 unit suites / 95 tests; successful API build (17.54 seconds); matching generated contracts; no peer-dependency issues. The coordinator owns subsequent final build/check execution to avoid concurrent writes to `.medusa/server`.

The approval tests execute the actual Medusa workflow runtime and installed native Mercur account/approval workflows with isolated in-memory module persistence doubles. Cases cover new and explicitly reused members, native owner role creation, buyer metadata preservation, identity collisions, verification, inactive membership, same-key replay, changed-key payloads, native failures, commit-then-throw member/seller/auth writes, final commit ambiguity, and compensation. Helper tests cover strict schema/security behavior, live identity/RBAC checks, private product access, foreign inventory locations, serialized workflow errors, and the unconfigured email gate.

Real PostgreSQL locking/constraints/trigger behavior and HTTP middleware ordering are not proven by those unit doubles. The review worker supplied `packages/api/integration-tests/http/vendor-onboarding.spec.ts`, guarded to a disposable localhost PostgreSQL database and dedicated localhost TLS Redis instance. This worker did not execute it, create any runtime records, modify real inventory, send email, restart servers, or run destructive shared-database tests.

For the isolated integration suite, set `VENDOR_ONBOARDING_TESTS=disposable-local`, `NODE_ENV=test`, `DB_HOST=localhost`, explicit `DB_USERNAME`, `DB_PASSWORD`, `DB_PORT`, a dedicated credentialed `REDIS_URL=rediss://…@localhost:…/15`, and different test-only JWT/cookie secrets of at least 32 characters. Remove `DB_TEMP_NAME` and `MEDUSA_DB_SCHEMA`. See the test file's header for exact guards and cleanup behavior before running:

```powershell
pnpm --dir packages/api test:integration:http --runTestsByPath integration-tests/http/vendor-onboarding.spec.ts
```

The runner creates and drops a random `vapp_test_*` database and template. It must never target shared infrastructure. It uses only invalid-domain fixture email addresses and disables delivery.

## Delivery and recovery limits

No real email provider is configured. Verification requests clearly return `email_service_unconfigured`; submission/approval still demand an existing exact-identity verified-email record. The notification outbox retains durable events and sends only after a real nonlocal email provider plus existing auth-email configuration are present. Provider delivery templates for `vendor-application-submitted`, `-changes_requested`, `-approved`, and `-rejected` must be supplied when that provider is configured. No keys were added, gate bypass implemented, or real email sent.

`packages/api/src/scripts/recover-vendor-application.ts` inspects a retained operation without mutation by default:

```powershell
pnpm --dir packages/api exec medusa exec ./src/scripts/recover-vendor-application.ts vappmut_REPLACE inspect
```

Recovery acts on the original native workflow transaction. After inspecting the operation and stopping its original executing worker, an operator may set `VENDOR_ONBOARDING_RECOVERY_CONFIRMED=true` and use `finalize` only for a completed native saga with a processing application, or `cancel` only for an unfinished operation stale for five minutes. These actions run guarded workflows; cancellation must complete native compensation/reconciliation before the claim becomes retryable. A completed approval is never canceled, a stale operation cannot reconcile a newer claim, and unresolved database uncertainty remains fenced. This script was not executed.

No commit or push was made. Frontend package test-script edits were coordinated with their owners; unrelated source changes in the shared worktree were preserved.
