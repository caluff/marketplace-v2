# Vendor dashboard

Independent Next.js 16 seller dashboard connected to the Mercur Vendor API. Member authentication uses isolated HTTP-only cookies, explicit seller context, and fresh membership and seller-status checks for each mutation.

The dashboard provides real counts and recent orders, searchable paginated catalog and orders, product details and approval requests, inventory levels with absolute stock adjustments, US stock-location creation, and editable seller profile, US business address, and corporate name (without tax identifiers). The preparation checklist comes from `/vendor/onboarding`. Catalog counts include shared published products visible to the seller; they are not an owned-product or sellable-offer count.

Products are created as `proposed`; edits return a pending `product_change` and never immediately update the live product. The native vendor update schema cannot submit an existing draft for publication, so draft creation is intentionally unavailable. Offers, prices, shipping setup, payments, payouts, commissions, fulfillment, cancellation, and refunds are outside these controls. Creating a product or stock location does not make an offer sellable.

Configure `NEXT_PUBLIC_MEDUSA_BACKEND_URL` and `NEXT_PUBLIC_STOREFRONT_URL` in the deployment environment. The storefront URL supplies an ordinary `/account/sell` link, never credentials or tokens; it defaults to `http://localhost:3000` only outside production and requires HTTPS in production. Approved applicants sign in with their retained buyer credentials. Pending and suspended sellers see a status page; terminated sellers with an existing selection can see their exact status if the backend permits the membership read, while new sessions use the no-access page because Mercur omits terminated sellers from its membership list.

Stock updates verify current item/level and seller-owned location, reject stale displayed counts, and reject reductions below reservations. The native absolute update has no compare-and-swap contract, so changes racing between the read and write still require backend concurrency protection.

After the repository-wide install has completed, use `pnpm --filter @marketplace-v2/vendor dev` to open the app on port `7001`. Static checks are available through the package's `lint`, `typecheck`, and `test` scripts.
