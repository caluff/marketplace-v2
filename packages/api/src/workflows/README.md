# Marketplace workflows

This directory orchestrates local mutations around native Medusa/Mercur flows.

| Area                 | Entry points                                                                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Onboarding           | `mutate-vendor-application.ts`, `recover-vendor-application.ts`, `vendor-application-notifications.ts`, `backfill-vendor-warehouse.ts`.           |
| Auth                 | `complete-google-auth.ts`, `vendor-session.ts`.                                                                                                   |
| Catalog/inventory    | `validate-vendor-catalog.ts`, `upload-catalog-images.ts`, `update-vendor-offer-price.ts`, `update-vendor-stock.ts`, `set-product-sale-status.ts`. |
| Checkout/finance     | `validate-cart-sale-status.ts`, `guard-order-finance-writer.ts`, `operate-order-finance.ts`, `order-finance-native.ts`.                           |
| Shipping/Connect     | `configure-vendor-shipping.ts`, `shipment-notification.ts`, `refresh-vendor-stripe-account.ts`, `reconcile-stripe-account.ts`.                    |
| Search/favorites     | `algolia/`, `update-customer-favorite.ts`.                                                                                                        |
| Scheduled evaluation | `evaluate-commerce.ts`; automatic money movement remains incomplete.                                                                              |

Focused operations live in `steps/`. `hooks/` composes native offer-validation
and Stripe sale-readiness hooks. Review installed and local registrations before
adding handlers; retain composition/load regression tests.

Keep composition synchronous and use workflow primitives for branching/transforms.
Business validation, authorization and compensation belong in workflows; modules
own persistence. Reuse native inventory, pricing, payment and order operations.

The journal protects selected manual TEST/USD operations, but does not yet
provide a complete immutable financial history, general settlement or recovery.
Follow the [development plan](../../../../docs/develpment/development-implementation-plan.md).
Do not enable automatic jobs to bypass its gates.
