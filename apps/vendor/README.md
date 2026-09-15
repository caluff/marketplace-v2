# Vendor dashboard

Independent Next.js seller application connected to the Mercur Vendor API.
Member authentication uses isolated HTTP-only cookies, explicit seller context
and fresh membership/status checks. Backend ownership and authorization remain
authoritative for every operation.

## Connected surfaces

| Route                         | Current behavior                                                                                                                                                                      |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/seller`                     | Real catalog-visible, assigned-order and inventory counts, recent orders and backend preparation checks. Counts are not financial earnings.                                           |
| `/seller/catalog`             | Searchable, paginated shared catalog; proposed products, staged content/image edits, variants and seller offers/prices. Product approval and a sellable offer remain distinct.        |
| `/seller/catalog/[id]/stock`  | Inventory associated with the product and the seller's approved warehouse.                                                                                                            |
| `/seller/inventory`           | Scoped inventory with absolute stock adjustments, stale-count/reservation checks and backend concurrency protection.                                                                  |
| `/seller/inventory/locations` | Read/recheck the single US warehouse based on the approved application address. Free creation of warehouses is not part of the current flow.                                          |
| `/seller/orders`              | Assigned orders, details, partial preparation, shipping/tracking and supported fulfillment transitions; cancellation/refund controls in Stripe TEST, governed by backend eligibility. |
| `/seller/settings`            | Profile, business address and corporate name. Tax identifiers are not collected by these profile controls.                                                                            |
| `/seller/settings/shipping`   | Supported US shipping setup and editable marketplace shipping options/prices.                                                                                                         |
| `/seller/settings/payments`   | Stripe Connect TEST onboarding/re-entry, account state and refresh. An enabled account is not evidence of a transfer or bank payout.                                                  |
| `/seller/status`              | Restricted-state information for accounts outside the operational workspace.                                                                                                          |

Approved applicants retain buyer credentials but obtain a separate member
session. The generic public seller registration route remains closed. Shared
published products can be visible to multiple sellers; their offers, inventory
and assigned orders remain seller-scoped.

New master products are proposed for review; staged edits do not immediately
replace published content. Existing drafts require operator progression when the
native vendor schema does not support the required status change. A product is
buyable only after the backend's offer, stock, shipping, seller and payment-account
requirements are satisfied.

## Financial limits

Order details expose allocated, captured, refunded and refundable amounts plus
operation history. They do not yet provide the complete commission/earnings
snapshot or reconciled seller balances. General settlement and recovery remain
incomplete. The development audit records **Financial Readiness: FAIL**; Connect
onboarding and successful TEST refunds do not establish commercial readiness.

## Development

Follow the [root README](../../README.md) for workspace installation and backend
configuration, then run:

```bash
pnpm --filter @marketplace-v2/vendor dev
```

Open `http://localhost:7001/seller`. Configure
`NEXT_PUBLIC_MEDUSA_BACKEND_URL` and `NEXT_PUBLIC_STOREFRONT_URL` as public origins.
The storefront origin supplies an ordinary `/account/sell` link, never credentials
or tokens. It defaults to `http://localhost:3000` outside production; production
requires an explicit HTTPS origin.

```bash
pnpm lint:vendor
pnpm typecheck:vendor
pnpm test:vendor
pnpm build:vendor
```

These are verification commands, not results for the current tree. Inventory
concurrency relies on the backend extension documented in the
[inventory contract](../../packages/api/src/modules/inventory/README.md).

## Documentation

- [Current vendor operations](../../docs/vendor-operations.md)
- [Development audit](../../docs/develpment/development-completion-audit.md)
- [Implementation phases](../../docs/develpment/development-implementation-plan.md)
- [Session handoff/progress](../../docs/develpment/development-progress.md)
- [Historical initial integration report](IMPLEMENTATION.md)
