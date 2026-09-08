import type { CommerceGroup } from "../policy";

export const COMMERCE_START = Date.parse("2026-09-01T00:00:00Z");
export const HOUR = 60 * 60 * 1000;
export function commerceFixture(): CommerceGroup {
  const payment = {
    id: "pay_one",
    provider_id: "pp_stripe_stripe",
    amount: "100.00",
    created_at: "2026-09-01T00:00:00Z",
    captured_at: null,
    canceled_at: null,
    captures: [],
    refunds: [],
    data: { id: "pi_test", livemode: false as const },
  };
  return {
    id: "og_one",
    cart_id: "cart_one",
    created_at: "2026-09-01T00:00:00Z",
    orders: ["first", "second"].map((name, index) => ({
      id: `order_${name}`,
      created_at: "2026-09-01T00:00:00Z",
      status: "pending",
      currency_code: "usd" as const,
      total: index ? "30.75" : "69.25",
      payment_collections: [],
      cart: {
        id: "cart_one",
        payment_collection: {
          id: "pc_one",
          status: "authorized",
          amount: "100.00",
          payments: [structuredClone(payment)],
        },
      },
      seller: {
        id: `seller_${name}`,
        status: "open",
        payout_account: {
          id: `pa_${name}`,
          status: "active",
          data: {
            id: `acct_${name}`,
            country: "US",
            metadata: { account_id: `pa_${name}` },
          },
        },
      },
      items: [
        {
          id: `item_${name}`,
          quantity: 2,
          detail: { fulfilled_quantity: index ? 0 : 2 },
        },
      ],
      fulfillments: index ? [] : [{ id: "ful_first", canceled_at: null }],
    })),
  };
}
