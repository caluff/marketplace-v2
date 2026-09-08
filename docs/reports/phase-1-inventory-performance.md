# Phase 1 — vendor inventory and request counts

## Delivered

The inventory and warehouse routes now present the single warehouse associated with the approved application. The UI first requests at most two seller-linked location IDs; zero produces a pending state and multiple or inconsistent results produce a recovery state. For exactly one candidate, it reads the native stock-location detail route, whose existing `guardSellerWarehouse` invokes the backend canonical warehouse ownership/claim validation. The frontend does not infer approval from the list alone or create a replacement location.

The verified location name and US address are shown read-only. Missing locations, conflicting links, rejected warehouse claims, missing addresses, and unexpected detail IDs suppress stock controls and explain operator recovery. A refresh button requests fresh server data without creating locations. Authentication and service failures retain the existing local error treatment and Sonner feedback. The obsolete location-creation operation still authorizes callers, but rejects before making any API request, so stale server-action submissions cannot recreate the removed free-form warehouse flow.

Inventory rows use the native paginated inventory list with selected embedded `location_levels` fields. The old per-item level pagination loop and per-location detail fan-out have been removed. Items without a level show a configuration state; foreign, duplicate, missing, or invalid levels show a recovery state without displaying their quantities. Valid rows show physical, reserved, and available units and retain the existing atomic stock-adjustment operation, expected original quantity, integer validation, and backend ownership/concurrency checks. Form keys refresh original quantities after successful updates.

## Version-matched contracts consulted

- `node_modules/@mercurjs/docs/content/platform/offer/guides/manage-offer-inventory.mdx`: inventory item/level creation belongs to native offer workflows; inventory attachment batches are mutations, not list-read APIs.
- `node_modules/@mercurjs/core/.medusa/server/src/api/vendor/inventory-items/route.js`: native list uses Query graph with supplied fields, filters, and pagination.
- The adjacent `query-config.js` includes `*location_levels` in native default fields; `middlewares.js` applies the authoritative seller inventory-item link filter. `validators.js` supports native list pagination/search and location filters.
- `node_modules/@mercurjs/types/dist/http/inventory-item.d.ts`: native list/level response contracts. The inventory feature composes selected fields from these published contracts because the base `InventoryItemDTO` alias omits the supported expanded level relation.
- `packages/api/src/lib/vendor-warehouse/access.ts` and `native-guards.ts`: existing canonical ready claim, exclusive seller/location links, guarded stock-location detail, and mutation location validation. These backend files were read only.
- Repository guidance and previously loaded Medusa skills, plus Next.js data/RSC patterns, shadcn, frontend design, and React review skills.

## Request-count evidence

Counts below cover this feature's SDK data requests only, excluding the unchanged authentication/membership gate, SQL statements, Redis operations, navigation prefetching, and mutation-triggered refreshes.

| Scenario | Previous implementation | Current implementation |
| --- | --- | --- |
| 20 items, one existing level each, one shared warehouse | 22 calls, derived from the old code: 1 list + 20 level reads + 1 location detail | **3 calls recorded by the offline SDK spy**: 1 inventory list + 1 location list + 1 guarded location detail |
| Warehouse view, one candidate | 1 location list with a free create form | **2 calls recorded by the offline SDK spy**, including canonical guarded detail verification |
| Warehouse missing, multiple, or inconsistent list | List only; allowed creation | **1 bounded list call recorded by the offline SDK spy**; no follow-up read or creation |

The old inventory request count generally grew as `1 + sum(level pages per item) + unique location IDs`. The current inventory path requires at most three data requests per navigation, independent of the number of items on the page. Inventory list pagination remains 20 items, with the original search, count, offset, and page navigation. The expanded relation itself follows native Query behavior and is not separately paginated; legacy data with multiple levels is rejected for editing rather than assumed canonical. No latency, backend query reduction, Redis reduction, or production throughput was measured or claimed.

## Progressive rendering

Both pages await the existing authentication gate before exposing protected content. Static headings render without awaiting warehouse/inventory requests. Warehouse data has its own Suspense region; search controls wait only for route input, and the item list has a separate region. Item titles and pagination can render before warehouse verification, while each stock-control region waits on the same shared warehouse promise. Warehouse data does not wait on the inventory list. Existing shadcn cards, badges, buttons, fields, MutationForm pending states, and Sonner feedback are retained.

## Validation

- `pnpm --filter @marketplace-v2/vendor exec tsx --test src/features/inventory/inventory.test.ts src/features/workspace/workspace.test.ts`: **26 passing tests**. Covers bounded request counts, authoritative seller headers/no-store reads, pagination/search, missing/conflicting canonical state, auth/service error propagation, malformed/foreign inventory levels, disabled free creation, and existing atomic adjustment conflicts without write retries.
- `pnpm --filter @marketplace-v2/vendor typecheck`: passed.
- `pnpm --filter @marketplace-v2/vendor lint`: passed without warnings.
- Scoped `git diff --check`: passed.

This worker performed no server start, live mutation, Redis load loop, migration, commit, manifest, lockfile, root configuration, or backend warehouse edit. The coordinator confirmed registration of the new inventory test file in the vendor test script and separately applied the migrations. Root owns integrated QA; slow-response browser verification, live native response serialization, and end-to-end stock mutation verification remain for that authorized integrated pass.

## Change in phase-1 behavior

The prior multi-location registration UI is replaced by the already approved single-warehouse policy. Native Mercur list/relations provide the read optimization; no custom read endpoint or inventory workflow was introduced. Existing guarded native reads and the already established atomic adjustment workflow remain the authorization and mutation authorities.
