# Storefront product search

The storefront uses the Medusa Store API to search Algolia. It does not expose an Algolia key to the browser. The integration adapts the official Mercur Algolia registry block to Mercur 2.3.3's offer-based pricing model; it does not install a second commerce engine.

## Configuration

Set these variables in the ignored root `.env` locally, and in both the API and worker environment when deploying:

```dotenv
ALGOLIA_APP_ID=ZYFJI8HPMX
ALGOLIA_API_KEY=<private restricted indexing key>
ALGOLIA_PRODUCT_INDEX=marketplace_v2_dev_products
```

The development key is restricted to `marketplace_v2_dev_products*`, with the permissions `search`, `browse`, `addObject`, `deleteObject`, `settings`, and `editSettings`. Never put it in `NEXT_PUBLIC_*`, `apps/web/.env.local`, a commit, or a browser bundle. Production must use a separate index prefix and restricted key.

The API and worker also require a working `REDIS_URL`. Updating the root environment requires restarting the running processes. Switching Redis does not migrate queued events from the previous instance; the full reindex below rebuilds the search projection from PostgreSQL through Medusa, not from old queue data.

## Initial indexing and recovery

```powershell
pnpm --filter @marketplace-v2/api search:reindex
```

This native Medusa workflow configures the primary index and three standard replicas (`_price_asc`, `_price_desc`, `_newest`), indexes eligible products, and removes obsolete records from this index. It does not delete other indexes or modify products, prices, orders, or inventory. No manual product upload or Algolia onboarding wizard is required.

Replicas and seller-specific records increase the indexed record count; monitor Algolia usage before increasing the catalog substantially. Redis is used by the native workflow/event/locking modules and must have available quota.

The index is updated by product, offer, pricing, seller, category, region, and sales-channel events. A native scheduled job reconciles every 15 minutes to cover scheduled price changes and recover drift. Synchronization is asynchronous: prices and facet counts in the index can briefly lag commerce data. Product cards retrieve current public offer prices from Mercur, and purchase validation remains native.

## Search behavior

- The persistent root navbar contains the same search input on all storefront pages.
- Enter/search submits to `/search?q=...`; suggestions start after two characters and a 300 ms pause. Superseded requests are cancelled.
- URL state uses repeated `category_id` and `seller_id` (up to twenty stores), `min_price`, `max_price`, `sort`, and one-based `page`.
- Desktop has a filter sidebar; mobile uses an accessible dialog. Apply commits filters together; clear preserves the search term and sorting.
- Sorting: relevance, ascending/descending price, newest. Pagination is global in Algolia, not applied to a downloaded page.
- Search currently targets the same United States/USD public pricing context as the storefront. It does not index customer-specific pricing.
- Store checkboxes select any of the checked stores; no selection searches all stores. Price filtering and sorting use the lowest public offer price among the selected stores. Each seller record indexes `lower_price_seller_ids`, ordered by price and then seller ID to resolve ties. Excluding selected predecessors leaves one minimum-price record per product before filtering, counting, sorting, and pagination. A cheaper unselected store cannot affect the result.
- Store facet counts are disjunctive: they retain other visible stores with matching products and their own minimum prices, so more stores can be added after applying a selection.
- Run the full reindex command when introducing `lower_price_seller_ids`, before serving the updated search queries. This configures its filter attribute on the primary index and replicas and populates every seller record; old records without the field cannot guarantee unique results across multiple stores. Subsequent offer/price synchronization recalculates every seller scope for the affected product.
- Search results are rechecked against current product publication, seller visibility, and the publishable key's sales channels before being returned. The index is not an authorization source.
- Search errors are not presented as an empty catalog. The navbar and page shell remain usable while dependent regions load.

## Contracts and validation

`POST /store/products/search` is called through the existing Medusa SDK. Its body is validated with Medusa's Zod, and generated declarations are exposed through the type-only `@marketplace-v2/api/search-contracts` export.

```powershell
pnpm --filter @marketplace-v2/api search:contracts:generate
pnpm --filter @marketplace-v2/api search:contracts:check
pnpm lint:web
pnpm typecheck:web
pnpm test:web
pnpm build:web
pnpm lint:api
pnpm typecheck:api
pnpm test:api
pnpm build:api
pnpm peers check
```

Sources: [Mercur official blocks](https://docs.mercurjs.com/blocks), [Medusa Algolia integration](https://docs.medusajs.com/resources/integrations/guides/algolia), [Algolia API-key security](https://www.algolia.com/doc/guides/security/api-keys).
