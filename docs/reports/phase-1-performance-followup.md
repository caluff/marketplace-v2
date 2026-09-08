# Phase 1 vendor performance follow-up

Date: 2026-09-06 UTC. Mercur 2.3.3, Medusa 2.18.0, Next.js 16.3.4, React 19.2.8.

## Delivered

- Product detail starts its category request alongside the existing product-detail read chain after the authenticated workspace gate. The fieldset consumes that same handled promise inside its existing local Suspense boundary. Product content does not await categories. An early category failure is handled even if product detail fails or a pending proposal suppresses editing.
- Category reads now send native `is_active: true` and `is_internal: false` filters. The native endpoint applies these before pagination, avoiding retrieval of categories the existing UI would discard. The existing page size of 100, complete pagination, selected values, defensive visibility filter, seller scope, and `no-store` policy remain.
- The category data helper now accepts the established scoped SDK client, matching inventory's existing read-helper pattern. The new-product fieldset retains its authenticated fallback. No cache, polling, dependency, permission behavior, or backend endpoint was introduced.
- Removed the redundant Suspense wrapper around the synchronous edit form; the category fieldset retains its meaningful loading region.
- At coordinator request, added a local shadcn/Radix `Checkbox` using the already installed `radix-ui` dependency and the storefront source anatomy, with vendor styling and no cross-app import. Category choices compose it with the existing `Label`. The test renders the real primitive, verifies generated native checkbox inputs, name/value/defaultChecked state, omission of the unchecked category from submitted values, and the successful-load marker. No dependency was added.
- Added eight regression tests for pagination, query filters/headers, errors including a later-page failure, preloaded-result reuse, pending categories, successful empty categories, selected values, and omission of the submission marker on category failure.

The preload can perform a category read that ultimately is unused when a product has a pending proposal or its detail request fails. This is a deliberate bounded request-overlap tradeoff, not a claim of fewer requests for every detail navigation. Categories still require as many pages as the filtered native count dictates.

Inventory already separates the warehouse promise, list, and individual stock controls. Inspection and its existing six tests confirm the bounded list/detail path and ownership checks; no additional inventory edit was justified. The existing `workspace/data.ts` product visibility preflight and parallel detail/options requests remain unchanged by this worker.

## Bounded live SDK samples

Two sequential passes through the existing Medusa SDK against `http://localhost:9000`, using the coordinator-approved member session in memory, JWT `nostore`, selected seller header, and `cache: no-store`. No credentials or response bodies were logged. Authentication time is excluded. These ten GET samples completed successfully; `/health` returned 200 afterwards.

| Read | Sample 1 | Sample 2 | JSON bytes | Native count |
| --- | ---: | ---: | ---: | ---: |
| Memberships, `/vendor/sellers` | 235 ms | 387 ms | 1,245 | 1 |
| Catalog list, `/vendor/products` | 5,456 ms | 5,333 ms | 491 | 2 |
| Active public categories | 3,177 ms | 3,202 ms | 176 | 1 |
| Inventory list with embedded levels | 3,954 ms | 3,753 ms | 54 | 0 |
| Warehouse candidate IDs, limit 2 | 4,034 ms | 4,066 ms | 103 | 1 |

These are current SDK response timings, not a controlled before/after benchmark. They include middleware, native data reads, transport, and response processing. The warehouse sample is the candidate list only, not canonical detail verification. Inventory was empty, so these samples do not establish live populated-level serialization or stock-control performance. Earlier setup failures during service changes and an Orca cookie-read timeout are excluded rather than recorded as route latency.

The small responses still take seconds on seller-scoped endpoints. Moving category loading earlier removes a code-level dependency on product detail; no measured navigation reduction is claimed. No HTTP request's SQL statements or Redis operations were instrumented.

## Bounded SQL stage samples

Coordinator correction after integration: creating this helper under `scripts/`
also triggered the installed Medusa development watcher, as confirmed in its logs.
Its location outside `src` does not avoid restarts in this configuration. Running
the existing helper is still read-only; creation and editing must not be treated
as restart-free. Root applied the visibility patch through pnpm and verified one
authenticated product-ID query successfully after restarting the existing dev
server. This is a correctness smoke test, not a before/after latency measurement.

Reusable command:

```text
pnpm --filter @marketplace-v2/api exec node scripts/profile-vendor-readiness.cjs
```

The helper reads the ignored root `.env` in memory, opens one PostgreSQL connection, enforces a read-only transaction, performs two passes over five SELECT stages, and rolls back/closes. It imports only installed seller-role definitions and never calls `ensureSellerDefaultRoles`, starts Medusa, connects to Redis, creates roles, or grants bindings. It lives outside watched API `src` to avoid triggering the development-server restart. Output is timings, counts, payload sizes, and aggregate missing-record counts; connection errors are sanitized.

Connection establishment took 876 ms, separately from the following measurements:

| SQL read | Rows | Sample 1 | Sample 2 | Serialized row bytes |
| --- | ---: | ---: | ---: | ---: |
| Existing default roles | 5 | 218 ms | 209 ms | 1,143 |
| Active policies, all columns | 289 | 637 ms | 220 ms | 84,069 |
| Active default-role bindings, all columns | 463 | 433 ms | 418 ms | 111,509 |
| Active policies, `id,key` | 289 | 214 ms | 214 ms | 19,787 |
| Active bindings, `role_id,policy_id` | 463 | 215 ms | 217 ms | 40,670 |

These SELECTs characterize the corresponding table reads and projections; they are **not captured ORM SQL** and do not reproduce the initializer's ORM/default-pagination or connection-pool behavior. Timings include database network round trip and driver processing, not server-only execution time. Serialized JSON bytes are not PostgreSQL wire bytes. Fixed execution order, two samples, cache warming, and shared development activity prevent a causal latency claim. The projected rows were smaller in this dataset; SQL statement-count reduction and production throughput were not measured.

The diagnostic found zero missing default roles and zero absent expected default bindings in this snapshot. Absence would remain ambiguous between intentional revocation and incomplete setup. The helper reports it only; it cannot authorize repair. The previously characterized upstream regrant behavior and distributed initialization race remain unresolved. No RBAC readiness patch or automatic grant was proposed/applied in this follow-up. The API-local installed initializer retains the coordinator's earlier projected parallel-read patch; the root-level duplicate package source differs, so package resolution must remain API-local when inspecting behavior.

## Approved core visibility read patch

The installed `getProductIdsRestrictedFromSeller` reads every `product_seller` link, including during the frontend's single-ID `visibleProduct` preflight. The coordinator approved narrowing this read to explicit candidate IDs when the native validated list query already restricts `id`. The maintained patch now includes this change. It keeps all seller links for those products: filtering by the current seller alone would incorrectly turn another seller's restricted product into a public product. For requests without a supported explicit ID shape, it retains the current full-read behavior.

Added compiled-source hunk in `.medusa/server/src/api/vendor/products/helpers.js`:

```diff
-const getProductIdsRestrictedFromSeller = async (scope, sellerId) => {
+const getProductIdsRestrictedFromSeller = async (scope, sellerId, productIds) => {
     const query = scope.resolve(utils_1.ContainerRegistrationKeys.QUERY);
     const { data: links } = await query.graph({
         entity: "product_seller",
         fields: ["product_id", "seller_id"],
+        ...(productIds ? { filters: { product_id: productIds } } : {}),
     });
```

Added hunk in the adjacent `middlewares.js`, inside `applySellerProductLinkFilter`:

```diff
     const sellerId = req.seller_context.seller_id;
+    const requestedId = req.filterableFields?.id;
+    const productIds = typeof requestedId === "string"
+        ? [requestedId]
+        : Array.isArray(requestedId) && requestedId.every((id) => typeof id === "string")
+            ? requestedId
+            : undefined;
     const [ownProductIds, restrictedFromSellerIds] = await (0, utils_3.promiseAll)([
         (0, helpers_1.getSellerOwnedProductIds)(req.scope, sellerId),
-        (0, helpers_1.getProductIdsRestrictedFromSeller)(req.scope, sellerId),
+        (0, helpers_1.getProductIdsRestrictedFromSeller)(req.scope, sellerId, productIds),
     ]);
```

The published helper declaration also adds optional `productIds?: string[]`. The original 2,162-byte patch prefix, containing the RBAC and webhook changes, was preserved byte-for-byte. Only three product helper/middleware/declaration hunks were appended; no installed package was changed. Root owns application through pnpm and subsequent live validation. The surrounding original `$and` filter remains mandatory; it proves that products outside the candidate set cannot appear even though their restriction links are omitted. Empty ID arrays retain an empty native query rather than becoming an unrestricted fallback.

Sixteen dedicated offline cases apply the real maintained patch to isolated temporary copies, execute both original and patched helpers/middleware, and compare resulting visibility. Cases cover single/multiple/empty IDs, whole catalog, unknown/non-string/operator-shaped fallback, shared public products, current/other/both-seller links, creator-owned unpublished products, foreign drafts, missing products, pre-existing AND filters, and read failure before `next`. The existing nine RBAC patch tests also pass with the appended hunks. The fixture evaluates the native filter contract in memory; actual graph serialization and installed-package behavior remain coordinator integration checks. Live validation should be one targeted ID read after root's normal restart, not another benchmark loop.

This is a concrete reduction in unnecessary link work for detail preflight, not a measured reduction in SQL count or latency. The existing two-product SDK dataset does not establish its benefit at scale. The measured SQL round trips and projection sizes support avoiding unnecessary remote data, but do not attribute catalog latency to this helper. No safe readiness bypass follows from this diagnostic: a role/binding absence still needs revocation-aware persisted provenance before any bootstrap deduplication policy changes.

## Validation and limits

- Final `pnpm --filter @marketplace-v2/vendor lint`: passed.
- Final `pnpm --filter @marketplace-v2/vendor typecheck`: passed.
- Final `pnpm --filter @marketplace-v2/vendor test`: **88 passed**, including eight added category regressions. The tests use SDK spies and isolated component evaluation; they do not claim a browser/RSC integration pass.
- Final API typecheck and explicit `eslint --no-ignore` of the new visibility test: passed.
- Focused API patch suites: **25 passed** (16 visibility and 9 RBAC), exercising the maintained unified diff in temporary copies. No `node_modules` write occurred.
- SQL helper syntax check and its live read-only execution: passed.
- Scoped `git diff --check`: passed.
- Browser tab `7f39e920-c5ee-402a-935b-368f54c3bb42` was created for a read-only product-detail inspection. Its snapshot failed with Orca `runtime_unavailable` (connection closed before response). No browser was restarted, no form submitted, and no successful visual verification is claimed. The original coordinator vendor tab was preserved.
- Initial-load/navigation verification under intentionally slow responses, populated inventory integration, actual per-request SQL/Redis attribution, and a controlled navigation before/after comparison remain unverified. Applying the approved native API patch and full API lint/tests/build after all coordinator-owned changes remain coordinator integration gates.

Worker changes: `apps/vendor/src/app/seller/(workspace)/catalog/[id]/page.tsx`, `apps/vendor/src/features/catalog/data.ts`, `apps/vendor/src/features/catalog/category-fields.tsx`, `apps/vendor/src/features/catalog/catalog.test.ts`, `apps/vendor/src/components/ui/checkbox.tsx`, `packages/api/scripts/profile-vendor-readiness.cjs`, `packages/api/src/lib/__tests__/vendor-product-visibility-patch.unit.spec.ts`, the appended product hunks in `patches/@mercurjs__core@2.3.3.patch`, and this report. Other dirty worktree changes predate this dispatch or belong to other owners. No manual server restart, install, migration, grant, stock/content mutation, Redis load loop, or secret output was performed by this worker. The new API test file can trigger the existing development watcher; the coordinator was notified before that edit.

## Sources consulted

- Installed Mercur docs: `content/platform/catalog/concepts/variants-categories-collections.mdx` and `content/platform/store/concepts/team.mdx`.
- API-local Mercur `api/vendor/product-categories/{validators,route}.js`: accepted boolean filters and graph filtering/pagination.
- API-local `modules/seller/utils/ensure-seller-default-roles.js`, published seller-role definitions, and installed Medusa RBAC migrations: table/column contracts and current initializer behavior.
- Next.js documentation via Context7, [streaming](https://nextjs.org/docs/app/guides/streaming), and the installed Next/React skills: start independent work early and await within focused Suspense boundaries.
- Supabase/Postgres skills, [database inspection](https://supabase.com/docs/guides/database/inspect), and the retrieved [Supabase changelog](https://supabase.com/changelog): diagnostic guidance. The skill's monitoring markdown URL returned 404; no Supabase service configuration or schema change was made.
