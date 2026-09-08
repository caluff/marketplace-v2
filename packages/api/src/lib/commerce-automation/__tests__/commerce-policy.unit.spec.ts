import { planCommerceGroup, usdAmount } from "../policy";
import { COMMERCE_START, HOUR, commerceFixture } from "./fixtures";

describe("commerce split policy", () => {
  it("cancels only the entirely unfulfilled late split and retains precise product/shipping/tax totals", () => {
    const result = planCommerceGroup(
      commerceFixture(),
      COMMERCE_START + 72 * HOUR,
    );
    expect(result.cancelOrderIds).toEqual(["order_second"]);
    expect(result.retained).toEqual([
      { orderId: "order_first", amount: "69.25" },
    ]);
    expect(result.captureAmount).toBe("69.25");
    expect(result.captureDue).toBe(false);
  });
  it("does not cancel before 72 elapsed hours", () => {
    expect(
      planCommerceGroup(commerceFixture(), COMMERCE_START + 72 * HOUR - 1)
        .cancelOrderIds,
    ).toEqual([]);
  });
  it("holds partial fulfillment at the deadline without removing any of its lines", () => {
    const group = commerceFixture();
    group.orders[1].items[0].detail.fulfilled_quantity = 1;
    group.orders[1].fulfillments.push({ id: "ful_second", canceled_at: null });
    const result = planCommerceGroup(group, COMMERCE_START + 144 * HOUR);
    expect(result.holdOrderIds).toEqual(["order_second"]);
    expect(result.cancelOrderIds).toEqual([]);
    expect(result.captureAmount).toBe("100.00");
    expect(result.reasons).toContain("partial_fulfillment_operator_hold");
  });
  it("treats an active fulfillment with incomplete quantity records conservatively", () => {
    const group = commerceFixture();
    group.orders[1].fulfillments.push({ id: "ful_second", canceled_at: null });
    expect(
      planCommerceGroup(group, COMMERCE_START + 72 * HOUR).holdOrderIds,
    ).toEqual(["order_second"]);
  });
  it("uses day six and day seven native elapsed authorization deadlines", () => {
    expect(
      planCommerceGroup(commerceFixture(), COMMERCE_START + 144 * HOUR - 1)
        .captureDue,
    ).toBe(false);
    expect(
      planCommerceGroup(commerceFixture(), COMMERCE_START + 144 * HOUR)
        .captureDue,
    ).toBe(true);
    expect(
      planCommerceGroup(commerceFixture(), COMMERCE_START + 168 * HOUR)
        .authorizationExpired,
    ).toBe(true);
  });
  it("keeps canceled splits out of retained allocation", () => {
    const group = commerceFixture();
    group.orders[1].status = "canceled";
    const result = planCommerceGroup(group, COMMERCE_START + 144 * HOUR);
    expect(result.captureAmount).toBe("69.25");
    expect(result.cancelOrderIds).toEqual([]);
  });
  it("detects totals inconsistent with the common authorization", () => {
    const group = commerceFixture();
    group.orders[0].total = "69.26";
    expect(
      planCommerceGroup(group, COMMERCE_START + 144 * HOUR).reasons,
    ).toContain("allocation_requires_reconciliation");
  });
  it("flags a reduced capture even when native captured_at is still null", () => {
    const group = commerceFixture();
    group.orders[0].cart.payment_collection.payments[0].captures.push({
      id: "cap_one",
      amount: "69.25",
    });
    expect(
      planCommerceGroup(group, COMMERCE_START + 144 * HOUR).reasons,
    ).toContain("payment_requires_reconciliation");
  });
  it.each(["restricted", "pending", "rejected"])(
    "blocks capture eligibility for %s accounts",
    (status) => {
      const group = commerceFixture();
      group.orders[0].seller.payout_account!.status = status;
      expect(
        planCommerceGroup(group, COMMERCE_START + 144 * HOUR).reasons,
      ).toContain("seller_account_not_ready");
    },
  );
  it("rejects direct order/payment collection links before native cancellation", () => {
    const group = commerceFixture();
    group.orders[1].payment_collections.push({ id: "pc_one" });
    expect(() => planCommerceGroup(group, COMMERCE_START + 144 * HOUR)).toThrow(
      "topology",
    );
  });
  it("rejects missing groups, currencies, live data and more than fifty splits", () => {
    const group = commerceFixture();
    for (const changed of [
      { ...group, orders: [] },
      { ...group, orders: [{ ...group.orders[0], currency_code: "eur" }] },
      { ...group, orders: Array.from({ length: 51 }, () => group.orders[0]) },
    ])
      expect(() => planCommerceGroup(changed, COMMERCE_START)).toThrow();
    const live = structuredClone(group);
    Object.assign(live.orders[0].cart.payment_collection.payments[0].data, {
      livemode: true,
    });
    expect(() => planCommerceGroup(live, COMMERCE_START)).toThrow();
  });
  it("rejects ambiguous seller/order membership and mixed carts", () => {
    const group = commerceFixture();
    group.orders[1].seller.id = group.orders[0].seller.id;
    expect(() => planCommerceGroup(group, COMMERCE_START)).toThrow("topology");
    group.orders[1].seller.id = "seller_second";
    group.orders[1].cart.id = "cart_other";
    expect(() => planCommerceGroup(group, COMMERCE_START)).toThrow("topology");
  });
  it("preserves display units and rejects rounding or negative amounts", () => {
    expect(usdAmount("0.10")).toBe("0.10");
    expect(usdAmount(49.99)).toBe("49.99");
    expect(() => usdAmount("1.001")).toThrow();
    expect(() => usdAmount(-1)).toThrow();
  });
  it("validates timestamps and preserves the input", () => {
    const group = commerceFixture();
    const original = structuredClone(group);
    planCommerceGroup(group, COMMERCE_START + 144 * HOUR);
    expect(group).toEqual(original);
    expect(() => planCommerceGroup(group, Number.NaN)).toThrow();
    expect(() => planCommerceGroup(group, COMMERCE_START - 1)).toThrow();
    expect(() =>
      planCommerceGroup(
        { ...group, created_at: "2026-02-30T00:00:00Z" },
        COMMERCE_START,
      ),
    ).toThrow();
  });
});
