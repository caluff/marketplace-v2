# Storefront checkout: United States / USD

## Price diagnosis

`Producto 1` had a USD 200 seller offer, but no Store region existed. The
storefront also read variant pricing instead of Mercur offer pricing. Offer
prices are scoped by `offer_id`; a variant price without that context cannot
represent the seller's offer.

The storefront now reads native calculated offer prices with a US/USD region,
preserves Medusa display units, and never substitutes zero for a missing price.
The region was configured using the native workflow script below.

## Implemented flow

1. Catalog and favorites link to `/products/[handle]`, showing calculated USD
   offer prices. The product page selects variant, seller offer and quantity.
2. Server Actions create a native US/USD cart and add `offer_id` and quantity.
   The cart ID lives in an HttpOnly cookie; the backend owns pricing and stock.
3. `/cart` supports quantity updates and removal, and displays backend totals.
4. `/checkout` validates a US address and phone, then lists native shipping
   options for every seller/profile represented in the cart. Billing uses the
   shipping address. Checkout supports guests and existing customer sessions.
5. Stripe Elements confirms the native Medusa payment session. Reloading reuses
   a compatible session; an already accepted payment can retry order completion
   without a second confirmation.
6. Native Mercur cart completion creates the order group. Confirmation retrieves
   actual orders through the SDK and displays their real payment/shipping states.
   Browser redirect parameters are never treated as proof of payment.

Static layout, headings and navigation render independently of cart/product
requests. Local Suspense boundaries cover the data-dependent regions; pending,
empty and error states preserve the shopper's context.

## Native completion retry correction

The Stripe test exposed a Mercur 2.3.3 completion bug: the existing order-group
query selected `cart_id` but later tested `orderGroup.data.id`. Without the ID,
a retry entered the new-order branch. The existing pinned Mercur patch now adds
`id` to that selection. Native locking, validations, hooks and compensation
remain in place for both Store completion and webhook execution.

`cart-completion-retry.unit.spec.ts` runs the actual workflow with Mercur's hooks
and the application's sale guard loaded. Its query double returns only requested
fields and verifies that retries neither create orders, reserve inventory nor
authorize payment again. Two native retries against the QA cart also returned
the same group with no additional order groups or orders.

The lock also runs when Stripe webhook processing invokes completion as a
subworkflow. Its timeout/TTL arguments are expressed in seconds, as required by
the installed locking step/provider. This keeps browser and webhook completion
serialized and avoids a lock lasting 33 hours after a crash.

The three orders created while reproducing the original bug were cancelled
through native workflows. Their three inventory reservations were released;
stock remained 20. The shared Stripe test authorization was cancelled with
zero amount received. QA records remain as cancelled audit records.

Production packaging now copies the root dependency patches and resolution
settings into a generated standalone workspace for installation. The former
`--ignore-workspace` install silently dropped those patches. Only generated
installation files change; the repository retains one source lockfile.

## Configuration

- Backend secrets: `STRIPE_API_KEY`, `STRIPE_WEBHOOK_SECRET` and
  `STRIPE_PAYOUT_WEBHOOK_SECRET`, stored only in the ignored root `.env` and
  platform environment. The existing integration accepts Stripe test mode.
- Storefront public value: `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, from the same
  Stripe test account. Set it before building the storefront.
- Platform webhook: `/hooks/payment/stripe_stripe`, subscribed to
  `payment_intent.amount_capturable_updated`, `payment_intent.succeeded` and
  `payment_intent.payment_failed`.
- Connect webhook: `/hooks/payout`, subscribed to connected `account.updated`
  events, with its own signing secret.
- Native region: US country, USD currency, enabled `pp_stripe_stripe` provider.
  Seller must be open with an active Stripe payout account and US shipping.

Run from `packages/api` with the intended environment loaded:

```powershell
pnpm exec medusa exec ./src/scripts/configure-storefront-region.ts dry-run
pnpm exec medusa exec ./src/scripts/configure-storefront-region.ts apply
```

The script preserves existing store currencies/provider links and rejects a
conflicting US region instead of silently replacing it.

## Capture and verification limits

The existing provider uses `capture: false`. Successful checkout creates an
authorized order; capture remains the operator's native payment action.
Automatic capture, fulfillment and payouts are not enabled by this storefront
change. The receipt distinguishes authorization from captured payment.

Verified in the browser: USD 200 product price, add-to-cart persistence, US
address entry, the seller's USD 20 shipping option and Stripe Elements loading.
The seller's Stripe account is active and has no pending requirements. The
public test key is configured locally and in Railway. At 390px the checkout has
no horizontal overflow. An actual streamed checkout response delivered the
heading at 139ms and its cart summary at 3509ms.

Completion checks: workspace lint, typecheck and builds passed; all application
tests passed (web 70, API 574 plus three deployment tests). The exact
`pnpm build:api:deploy` command passed with the patched standalone dependencies.
Workspace peer dependency validation passed. API lint retains seven pre-existing
warnings.
