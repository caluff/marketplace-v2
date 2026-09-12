import type { FinanceGroup } from "../policy";

export function financeGroup(): FinanceGroup {
  const cart: FinanceGroup["orders"][number]["cart"] = {
    id: "cart_shared",
    payment_collection: {
      id: "paycol_shared",
      amount: 150,
      status: "completed",
      payments: [
        {
          id: "pay_shared",
          provider_id: "pp_stripe_stripe",
          amount: 150,
          canceled_at: null,
          data: { id: "pi_test", livemode: false },
          captures: [{ id: "cap_shared", amount: 150 }],
          refunds: [],
        },
      ],
    },
  };
  return {
    id: "group_shared",
    cart_id: cart.id,
    orders: [70, 80].map((total, index) => ({
      id: `order_${index + 1}`,
      seller: { id: `seller_${index + 1}` },
      status: "pending",
      currency_code: "usd",
      total,
      summary: { pending_difference: 0 },
      payment_collections: [],
      fulfillments: [],
      transactions: [],
      cart,
    })),
  };
}
