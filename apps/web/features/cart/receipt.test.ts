import assert from "node:assert/strict"
import test from "node:test"
import { getReceiptOrderIds } from "./receipt.ts"

test("guest receipt only contains orders returned for the shopper's own cart", () => {
  assert.deepEqual(
    getReceiptOrderIds(
      {
        cart_id: "cart_buyer",
        orders: [{ id: "order_one" }, { id: "order_two" }],
      },
      "cart_buyer",
    ),
    ["order_one", "order_two"],
  )
})

test("a successful completion response for another cart cannot become a receipt", () => {
  assert.throws(
    () =>
      getReceiptOrderIds(
        { cart_id: "cart_other", orders: [{ id: "order_private" }] },
        "cart_buyer",
      ),
    /verificar/,
  )
})

test("missing cart ownership never becomes a receipt", () => {
  for (const group of [null, {}, { orders: [{ id: "order_private" }] }]) {
    assert.throws(() => getReceiptOrderIds(group, "cart_buyer"), /verificar/)
  }
})

test("a receipt requires bounded valid order IDs from the verified group", () => {
  for (const orders of [
    undefined,
    [],
    [{ id: "cart_wrong" }],
    [null],
    Array.from({ length: 31 }, () => ({ id: "order_one" })),
  ]) {
    assert.throws(() =>
      getReceiptOrderIds({ cart_id: "cart_buyer", orders }, "cart_buyer"),
    )
  }
})
