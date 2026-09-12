import { financeView, initialAllocation } from "../policy";
import { financeGroup } from "./fixtures";

function fixture() {
  const group = financeGroup();
  const allocation = initialAllocation(group);
  const payment = group.orders[0].cart.payment_collection.payments[0];
  payment.captures = [];
  group.orders[0].status = "canceled";
  group.orders[1].items = [{ quantity: 2, detail: { fulfilled_quantity: 2 } }];
  group.orders[1].fulfillments = [{ id: "ful_1", canceled_at: null }];
  return {
    group,
    allocation,
    payment,
    input: {
      group,
      allocation,
      orderId: "order_2",
      history: [],
      knownRefundIds: [],
      hasPayout: false,
      isHeld: false,
      isOperator: true,
    },
  };
}
describe("final shared capture allocation", () => {
  it("charges only the prepared retained order", () => {
    const test = fixture();
    expect(financeView(test.input).finance.capture).toMatchObject({
      allowed: true,
      amount: 80,
    });
    test.group.orders[1].items![0].detail.fulfilled_quantity = 1;
    expect(financeView(test.input).finance.capture.allowed).toBe(false);
  });
  it("never exposes or authorizes the shared capture amount to a vendor", () => {
    const test = fixture();
    expect(
      financeView({ ...test.input, isOperator: false }).finance.capture,
    ).toMatchObject({ allowed: false, amount: 0 });
  });
  it("preserves original authorization while allowing refunds only from recorded per-store capture", () => {
    const test = fixture();
    test.payment.captures = [{ id: "cap_final", amount: 80 }];
    const finalCapture = {
      capture_id: "cap_final",
      orders: [
        { order_id: "order_1", amount: 0 },
        { order_id: "order_2", amount: 80 },
      ],
      released_refund_ids: ["re_release"],
    };
    expect(financeView({ ...test.input, finalCapture }).finance).toMatchObject({
      captured_total: 80,
      refundable_total: 80,
      refund: { allowed: true },
      capture: { allowed: false },
    });
    expect(
      financeView({ ...test.input, orderId: "order_1", finalCapture }).finance,
    ).toMatchObject({ captured_total: 0, refundable_total: 0 });
    finalCapture.orders[1].amount = 79;
    expect(
      financeView({ ...test.input, finalCapture }).finance.refund.allowed,
    ).toBe(false);
  });
});
