# Phase 1 native commerce readiness audit

Inspected installed Mercur 2.3.3 / Medusa 2.18.0 source in the shared worktree. This report describes the inspected package and project code, not running database configuration or proof of operational checkout. No Stripe API mutation, server, database migration, Redis poll, commission record edit or money job was performed by this worker.

## Implemented sale boundary

Native cart completion did not require a seller's payout account to be ready. The new `packages/api/src/lib/stripe-connect/sale-readiness.ts` exports:

- `assertCartSellersReadyForSale(container, cartId, options?)`: reads the authoritative cart with query cache disabled, requires configured test Stripe and USD, derives seller IDs from persisted item → offer links, and reads all distinct sellers in one query. Every seller must be `OPEN`, have a native `ACTIVE` payout account, and carry US Stripe account data whose metadata points to that same native payout account. Missing sellers/links, pending/restricted/rejected accounts, system-provider data and mismatched IDs fail closed. Errors do not disclose seller/account IDs. It does not trust seller IDs supplied by the caller.
- `assertPaymentCollectionSellersReadyForSale(container, paymentCollectionId)`: resolves the native `cart_payment_collection` link without cache, rejects absent/ambiguous links, then applies the same cart check. It rejects creating a new payment session for an already completed cart.

The coordinator approved NEW `packages/api/src/workflows/hooks/stripe-sale-readiness.ts`. It registers `completeCartWithSplitOrdersWorkflow.hooks.validate` and runs the first guard. This native extension point precedes order creation and the workflow's payment authorization step, and is shared by direct Store API completion and Mercur's payment-webhook completion path. Completion retries for a persisted `completed_at` cart remain possible after later seller restrictions, since they retrieve an existing sale.

Root registered the payment-session helper on native `POST /store/payment-collections/:id/payment-sessions`. That protects client-secret creation earlier in checkout. The installed `createPaymentSessionsWorkflow` has no validate hook; the Store route invokes it directly. Shared middleware was not edited by this worker.

Catalog creation, draft preparation, offer editing and listing are unchanged by these guards. They do not initiate transfers or change capture timing. Readiness uses trusted native local status updated by the signed/hydrated webhook integration; it makes no remote Stripe request on each cart read. A remote restriction not yet processed locally can therefore still be stale. Existing payment client secrets and remote authorizations are not revoked by this guard; payment confirmation can precede order completion, so rejecting completion does not claim that a prior card authorization never occurred.

## Native eligibility found in source

| Area | Observed enforcement |
| --- | --- |
| Store offer browsing | `api/store/offers/middlewares.js` limits sellers through `resolveVisibleSellerIds` and limits products to `PUBLISHED`; requested seller filters intersect visible IDs. `api/utils/sellers.js` filters seller status `OPEN` and closure dates. No payout-account condition. |
| Offer model | `modules/offer/models/offer.js` owns seller/variant/product/shipping-profile IDs, SKU, inventory/backorder settings and metadata. There is no native payout-ready or sale-enabled boolean on the offer. |
| Add/increase cart items | `workflows/cart/hooks/validate.js` loads linked offers, rejects missing requested offer IDs, and confirms managed non-backorder inventory. It does not inspect payout status. |
| Complete cart | `workflows/cart/workflows/complete-cart-with-split-orders.js` locks the cart, loads cart and order group, validates payment sessions, exposes the validate hook, validates seller assignment and shipping, splits by offer seller, reserves stock, authorizes payment and computes commission. `validate-seller-cart-items.js` checks only that items have an offer seller ID. |
| Existing stale carts | Native completion does not itself reload seller payout readiness. The new guard addresses that requirement and seller `OPEN` status. It does not duplicate listing closure-date or product-publication policy; those listing filters are not proof of a complete checkout policy. |
| Webhook completion | `workflows/payment/workflows/process-payment.js` invokes the same split-order completion workflow for cart-linked sessions without orders. Thus a Store-route-only completion check would be insufficient. The new native hook covers this path. |
| Payout | `modules/payout/services/payout-module-service.js#createPayouts` rejects non-`ACTIVE` native payout accounts. `workflows/payout/workflows/create-payout.js` loads order/seller/account and commission lines, computes order total minus commission and invokes the provider. The workflow itself does not check captured/fulfilled/elapsed-day conditions or the module `disabled` option. Eligibility is expected from the caller/job. |

The guard does not introduce a marketplace-wide hold, a custom sale flag, a debt ledger, Accounts v2, or a second provider. Approved catalogue preparation remains independent from ability to complete a new purchase.

## Commission: defaults, base and admin contract

`modules/commission/loaders/seed-default-commission-rate.js` creates a missing global rate with `name:"Default"`, `code:"default"`, `type:"percentage"`, `value:0`, `is_default:true`, `is_enabled:true`, `include_tax:false`, `include_shipping:false`. The model defaults both include flags to false. These are source defaults; no existing database rate was read here.

Use native `GET /admin/commission-rates?is_default=true` to identify the global rate, then `POST /admin/commission-rates/:id` with `{ "value": 8 }` to set the requested initial percentage while preserving other fields. The update route uses `updateCommissionRatesWorkflow`, and its native middleware requires `commission_rate:update`. The validator supports `value`, `type`, `include_tax`, `include_shipping`, `is_enabled`, name/code/currency and fixed per-currency values. Global/default deletion is protected by a validation step. This worker changed no records; root owns the authorized initial setting.

The installed `modules/commission/service.js#getCommissionLines`:

1. Loads enabled rates and rules/values, oldest first; applicable legacy currency filters must match.
2. Matches item rules by product/seller/type/category/collection dimensions; the most distinct dimensions win, with oldest rate as tie-break.
3. Computes percentage as `item.subtotal × value / 100`. `include_tax` adds the item's tax total. Fixed commissions are once per line, not multiplied by quantity; they use the matching currency amount or scalar fallback.
4. Computes shipping commission only when the global default rate's `include_shipping` is true, independently from item-specific rules, using shipping method subtotal and optional tax.

The base is **before discounts**. `refresh-order-commission-lines.js` forwards `item.subtotal`, not `subtotal - discount_subtotal`. Installed Medusa `@medusajs/utils/dist/totals/line-item/index.js` computes `subtotal` before adjustments and computes `total` separately by subtracting discount subtotal and adding tax. Shipping totals follow the same distinction. For a $100 item with a $20 discount and 8% rate excluding tax, native item commission is $8, not $6.40. Default shipping commission is zero; including shipping is an available native configuration choice and was not silently enabled here.

`subscribers/order-edit-confirmed.js` refreshes commission on confirmed order edits, return received, claim created and exchange created. Refresh reads **currently enabled rates** and replaces existing matching commission anchors. Commission lines store applied rate/amount, but are derived data, not immutable original-rate snapshots. Changing an admin rate does not directly refresh every old order, yet a later supported order event can recompute using the new rate. This differs from the earlier requested original-rate refund snapshot.

Potential native edge: `upsertCommissionLines` deletes anchors derived from incoming computed lines. If recomputation returns no line for a formerly commissioned anchor, that old anchor is absent from the deletion list; the code does not prove removal of the former commission. This was observed in source, not reproduced against a database, and was not changed.

## Capture, cancellation and release: code versus documentation

Installed `@mercurjs/types/dist/payout/common.js` defines default options: authorization window seven days, seller action window 72 hours, capture safety buffer 24 hours and fulfillment requirement `fulfilled`. These are configuration values, **not installed scheduling logic**.

Search of `@mercurjs/core/.medusa/server/src` found no capture-check/daily-payout job or request/expiration subscriber implementing those options. The only payout subscriber is the webhook subscriber. The project's inspected `src/jobs` contains its vendor notification job, and its subscribers contain onboarding/auth-related code, not a capture/cancellation/transfer scheduler. `PayoutModuleService.getOptions()` exposes defaults, but the inspected money workflows do not consume the timing properties. The current detailed installed `platform/payout/concepts/payout-pipeline.mdx` explicitly says jobs and request events are project wiring; older high-level `learn/payouts.mdx` language suggesting a fully automatic installed pipeline is misleading for this package.

Concrete native entry points:

- `POST /vendor/payments/:id/capture`: checks native seller ownership through the payment's cart and any of that cart's seller orders, then invokes Medusa `capturePaymentWorkflow` with optional caller amount. It does not inspect fulfillment, seller action window, Stripe payout readiness or a capture deadline. Since split orders share the payment collection, owning one order passes this helper; it is not a per-seller capture allocation check.
- `POST /vendor/orders/:id/cancel`: checks seller/order ownership and invokes Medusa `cancelOrderWorkflow`. No native 72-hour timer triggers it in the inspected package. Medusa's workflow-level cancellation constraints remain applicable.
- `createPayoutWorkflow`: calculates seller share and uses native account ACTIVE check; no native seven-days-after-delivery release condition. Provider creates a Stripe Transfer with order-based idempotency and immediately returns native `PAID`; bank arrival is outside this status.

Therefore neither automatic capture after preparation nor automatic cancellation after 72 hours nor automatic daily payout is certified by merely configuring this package. Root reported a separate npm/GitHub comparison confirming stable 2.3.3 is latest and the nine commits in 2.3.4-canary.3 concern product/offer changes, not money automation; that comparison was not independently performed by this worker. The conditional upgrade was not taken. No timing automation or changed business rule was introduced to close the documentation gap. Root must keep money jobs disabled until their concrete integration is deliberately implemented and verified.

## Provider patch repair in this dispatch

The coordinator reported that pnpm rejected the prior Stripe patch despite passing Git-based tests. Its hunk header named line 217 although the unpatched provider file had only 211 lines; Git silently applied it at line 193. Corrected the maintained patch to `@@ -193,7 +193,27 @@` and extended the existing offline test to assert exact source position and old-line count before patching. Root confirmed successful pnpm install with the corrected patch. The focused test command also triggered pnpm 12's automatic workspace preflight install; it succeeded. No worker directly edited manifests, lockfiles or installed package contents.

## Validation and limits

Focused readiness cases cover multi-seller deduplication, missing sellers, pending/restricted/rejected accounts, inactive sellers, account metadata/remote ID/US constraints, empty or unsupported carts, absent configuration, cache-disabled reads, preservation of completed-sale retries, payment-collection mapping/ambiguity and failed persistence. Provider tests retain real offline signature verification and temp-copy patch application with exact-hunk checks.

Final validation: 76 focused tests passed (29 readiness/payment-collection cases and 47 provider/maintained-patch cases); `pnpm typecheck:api` passed; targeted ESLint for the new helper and native hook passed. Root explicitly owns final full API test/lint/build after all workers finish. Native workflow graph execution, payment sessions, actual financial operations and database state were not exercised here; all worker-started checks finished and no background services were started.

Primary evidence is the installed source paths named above. Supporting version-matched docs: `node_modules/@mercurjs/docs/content/platform/commission/concepts/{rules-and-rates,order-commission-lines}.mdx` and `content/platform/payout/concepts/payout-pipeline.mdx`. The patch repair also consulted Context7's [pnpm patch-commit source](https://github.com/pnpm/pnpm/blob/main/patching/commands/src/patchCommit.ts) to avoid using a command that writes shared workspace registration.
