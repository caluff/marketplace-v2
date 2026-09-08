# Phase 1: admin commission editor

Implemented `/dashboard/commissions` in the current worktree and enabled the existing Comisiones navigation item for desktop and mobile.

## Behavior

- The static heading renders outside a local Suspense boundary. Only the commission card waits for its authenticated backend request; the existing dashboard authentication gate remains in place.
- The existing `requireAdminSdk` verifies the operator session for both reads and the Server Action. Native backend authorization remains authoritative, including POST denial after a successful read.
- The editor discovers the existing default with `GET /admin/commission-rates?is_default=true&limit=2` and `cache: no-store`. No runtime seed, fallback percentage, or hardcoded default ID is introduced. The coordinator's reported current record (`comrate_default`, enabled percentage 8, tax/shipping excluded) is compatible with the editor.
- Saves validate the percentage as a finite decimal from 0 through 100, reject missing/duplicate/file inputs, re-read the default, and compare the displayed ID and value before mutation. Only an enabled global percentage rate with no rule/currency restriction can be edited.
- The sole mutation is authenticated SDK `POST /admin/commission-rates/{backend-returned-id}` with the plain object `{ value }`. Submitted flags, names, rules, currency amounts, IDs, or types cannot enter the request body. No create/delete/rules endpoint is called.
- The card describes the pre-discount item subtotal and whether taxes/shipping participate, using the returned flags. It warns that later order changes can recalculate commissions using current rates; it does not promise immutable rate snapshots.
- Local denied/error/empty/unsupported states provide recovery. Save outcomes use the existing Sonner wrapper and inline accessible feedback. Read failures use the existing FeedbackToast. Submission disables the percentage and save control while pending.

## Verified contracts

- Installed `@mercurjs/docs` 2.3.3: `content/learn/commissions.mdx` and `content/references/api/admin/commission-rates/{list,update}-commission-rate.mdx`.
- Installed `@mercurjs/types` 2.3.3: `CommissionRateDTO`, `UpdateCommissionRateDTO`, and `HttpTypes.AdminCommissionRateListResponse` / `AdminCommissionRateResponse`.
- Installed Mercur core native validators/query configuration and `[id]/route.js` confirm optional update fields, native default filtering, returned base flags/rules, and workflow-backed native POST.
- Installed core `subscribers/order-edit-confirmed.js` invokes `refreshOrderCommissionLinesWorkflow`. This is why the bundled learn page's broad permanent-audit wording is not reproduced as an immutable snapshot guarantee.
- Context7 Next.js documentation confirmed action-level authentication and validation of untrusted form data. Existing local primitives and auth/feedback patterns are reused.
- The installed Medusa SDK has no Mercur commission convenience method, so the existing authenticated `sdk.client.fetch` pattern is used with published Mercur response types.

## Validation

- `pnpm lint:admin`: passed.
- `pnpm typecheck:admin`: passed.
- `pnpm test:admin`: passed, 63 tests including nine new commission tests.
- Tests cover forged/non-finite/out-of-range/duplicate/file input, zero and 100 boundaries, exact percentage-only payloads, unexpected defaults and stale IDs/values, base flags, actual SDK request serialization/auth headers, denied reads and writes, and static heading/local Suspense wiring.
- No dependency installation, manifest/common configuration changes, migrations, live financial writes, server restarts, commits, or pushes were performed.

## Integrated QA and limits

The coordinator owns browser/integrated QA. This worker did not run a live financial mutation, browser verification, or application build. Verify the existing live default initializes to its returned percentage, desktop/mobile navigation, slow-load card-only fallback, backend-denied states, retry behavior, and Sonner outcomes using mocks or an explicitly authorized isolated environment.

The read-before-write stale-value check reduces accidental overwrites but is not atomic: the native endpoint offers no conditional update token here, so concurrent edits between read and POST remain last-write-wins. Flags/rules are never echoed into the update, including in that race. Native API validation/permissions govern direct API callers; this frontend adds its requested percentage-range constraint without changing the backend contract.

## Owned files

- `apps/admin/src/features/commissions/{helpers,operations,actions}.ts`
- `apps/admin/src/features/commissions/components/{commission-form,commission-panel}.tsx`
- `apps/admin/src/app/dashboard/commissions/page.tsx`
- `apps/admin/src/components/admin/navigation.tsx` (commission entry and connected-module copy only)
- `apps/admin/tests/commissions.test.ts`
- `docs/reports/phase-1-admin-commissions.md`

Unrelated dirty-worktree changes were preserved.
