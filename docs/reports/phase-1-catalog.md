# Phase 1: vendor catalog and offers

Implemented in the current shared worktree; no commits, servers, live mutations, migrations, Stripe calls, or Redis tests were run by this worker.

## Delivered

- Catalog creation uses native `POST /vendor/products`: inline `multi_select` attributes with `is_variant_axis: true`, explicit Cartesian variant combinations (at most three axes / 100 variants), independent master SKUs, and existing public categories. Backend validation rejects duplicate combinations, invalid values, duplicate master SKUs, foreign scoped attributes, and unavailable categories. User-entered category names never create public categories.
- Existing product content, categories, and product images go through native moderated product updates. Variant titles, master SKUs, and selected values use native moderated variant routes; extending an existing axis uses the native attribute batch route. Forms display pending review truthfully and wait for a pending request to resolve before exposing the next edit.
- Added `GET /vendor/products/:id/catalog-options` with product read policy and the existing product visibility gate. It reads from the option and variant sides because installed Mercur deliberately omits `product.options` due to its documented joiner issue. Shared option values are restricted to the product's selected attribute values.
- Offers use native `POST /vendor/offers` and native update routes. Each create supplies variant ID, seller offer SKU, USD display-unit price, an existing seller shipping profile, and an inventory item with initial stock in the seller's single warehouse. It does not create a shipping profile or imply payments / sales readiness.
- Offer updates reload the complete price ladder; preserve price IDs, other currencies, quantity tiers and attribute/value rules; and replace only the base USD amount. The form detects an already-changed base amount before posting. This is a preflight stale-form check, not a transaction lock across the read/write window.
- Native offer workflow validation hooks cover single and batch create, updates, and inventory-item link batches. They check published product eligibility / allowlists, active seller, owned shipping profile, canonical warehouse readiness, nested stock locations, and owned inventory items. The canonical warehouse implementation is supplied by the warehouse worker.
- Native category-to-product batch writes are rejected because they bypass the required product moderation flow. Sellers submit category changes through the moderated product endpoint.
- Image UI uploads one validated file per server action via the SDK to `POST /vendor/catalog-images`, using the media worker's native File/Supabase adapter. It supports selection, previews, upload progress, partial-success retry, removal, Sonner feedback, and submit blocking while selected files remain pending. Uploaded files are attached only by submitting the native product proposal/update. No arbitrary URL input is exposed.
- Backend catalog validation calls the media worker's `assertSellerCatalogImages` using authoritative native seller context; client `product_id` is overridden, including explicitly removed for creates. Variant image link IDs must belong to the product. Existing images are fetched and preserved by the form.
- Authentication remains gated. Catalog heading/search render before the data table; product data, category choices and offers have local Suspense boundaries. The creation form's independent labels/options render before category data, and unresolved categories cannot be silently submitted.

## Integration contracts

Coordinator has already registered `vendorCatalogMiddlewares` from `src/api/vendor/catalog/middlewares.ts` and added the new vendor test files to the manifest. Importing this middleware module registers the offer workflow hooks.

Dependencies on other worker/root changes:

- `src/lib/vendor-warehouse/access.ts`: `requireSellerWarehouse(container, sellerId)`.
- `src/lib/catalog-media/access.ts`: `assertSellerCatalogImages(container, sellerId, body)`.
- `POST /vendor/catalog-images`: SDK JSON `{ files: [{ filename, mime_type, content }] }`, canonical base64, returning `{ files: FileDTO[] }`. The vendor UI sends exactly one file (maximum 5 MiB) per action. Root configured a 6 MB action limit; the media route uses a 7 MB JSON limit.
- Root owns File provider configuration, ownership module/migrations, credential readiness, image-upload middleware registration and native Stripe integration.

## Native behavior and differences

Mercur creation derives options from attributes and overwrites top-level options. Its normal product update diff ignores top-level options/variants. The implementation uses the supported native routes rather than pretending that a 202 response changed live data.

The native confirmation pipeline applies variants before its attribute batch. Accordingly, expanding an option and adding a variant using that value are separate moderated requests: approve the option expansion first. This is intentionally not a custom bundled financial/catalog workflow.

Initial new prices are USD. Pre-existing other currencies remain untouched when editing USD; no historical EUR migration occurs. Native offer workflows still determine their own inventory/backorder behavior; this UI uses the normal tracked-inventory creation defaults and does not replace native reservation/concurrency logic.

Uploaded-but-unsubmitted images can remain in storage. The UI does not claim to delete a persisted File when an image is removed from a draft; deletion/retention belongs to the media lifecycle. Missing provider configuration yields a recoverable upload error, and the user can discard pending selection to continue without images.

## Validation evidence

Executed successfully:

- `pnpm --filter @marketplace-v2/vendor exec tsx --test src/features/catalog/catalog.test.ts src/features/offers/offers.test.ts src/features/workspace/workspace.test.ts`: 27 tests passed.
- `pnpm --filter @marketplace-v2/api test:unit --runTestsByPath src/lib/__tests__/catalog-offers.unit.spec.ts`: 13 tests passed.
- Vendor lint and typecheck; full API typecheck also passed on the final run.
- Targeted API ESLint for catalog libraries, workflow, hooks, middleware and catalog-options route.
- Scoped `git diff --check`.

An earlier API typecheck found a coordinator-owned Stripe ESM type-import error; the final full API typecheck passed after the coordinator corrected it. The earlier full API lint found 11 errors in the warehouse worker's `backfill-vendor-warehouse.ts` step-return style and five existing native-inventory import warnings; no catalog lint errors. Those were reported to the coordinator, who owns final integrated lint/build gates.

Not verified: database-backed HTTP mutations, real uploads, persisted reloads, operator confirmation, browser navigation under slow network, reservation races, or production builds. The dispatched task prohibits live mutations/servers and assigns final integrated gates to the coordinator. Unit cases use local fixtures and mocked services only; they do not certify the phase ready for real sales.

