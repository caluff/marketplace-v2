import assert from "node:assert/strict"
import test from "node:test"
import { createRequire } from "node:module"
import { retrieveReceiptOrders } from "./receipt.ts"
import { adoptCustomerCart, CART_COOKIE, RECEIPT_COOKIE } from "./session.ts"

const { FetchError } = createRequire(import.meta.url)("@medusajs/js-sdk")

const receipt = JSON.stringify({
  cartId: "cart_guest",
  orderIds: ["order_guest"],
})
const unavailableCart = {
  retrieve: async () => {
    throw new Error("An absent cart must not be requested")
  },
  transferCart: async () => {
    throw new Error("An absent cart must not be transferred")
  },
}

function cookieStore(values) {
  const cookies = new Map(Object.entries(values))
  return {
    get: (name) =>
      cookies.has(name) ? { value: cookies.get(name) } : undefined,
    delete: (name) => cookies.delete(name),
  }
}

test("ordinary login clears the previous receipt", async () => {
  const store = cookieStore({ [RECEIPT_COOKIE]: receipt })
  await adoptCustomerCart(store, unavailableCart, "cus_account")
  assert.equal(store.get(RECEIPT_COOKIE), undefined)
})

test("confirmation login preserves the exact existing receipt", async () => {
  const store = cookieStore({ [RECEIPT_COOKIE]: receipt })
  await adoptCustomerCart(store, unavailableCart, "cus_account", {
    preserveReceipt: true,
  })
  assert.equal(store.get(RECEIPT_COOKIE)?.value, receipt)
})

test("preserving a receipt never transfers a completed guest cart", async () => {
  const store = cookieStore({
    [CART_COOKIE]: "cart_guest",
    [RECEIPT_COOKIE]: receipt,
  })
  await adoptCustomerCart(
    store,
    {
      retrieve: async () => ({
        cart: {
          id: "cart_guest",
          completed_at: "2026-10-06",
          customer_id: "cus_guest",
        },
      }),
      transferCart: async () => {
        throw new Error("A completed cart must not be transferred")
      },
    },
    "cus_account",
    { preserveReceipt: true },
  )
  assert.equal(store.get(CART_COOKIE), undefined)
  assert.equal(store.get(RECEIPT_COOKIE)?.value, receipt)
})

test("a guest receipt denied to the new account is retrieved with the same cart capability", async () => {
  let fallbackCalls = 0
  const orders = await retrieveReceiptOrders(
    {
      retrieve: async () => {
        throw new FetchError("Resource not found", "not_found", 404)
      },
    },
    receipt,
    async () => {
      fallbackCalls += 1
      return {
        retrieve: async (id, _query, headers) => {
          assert.equal(id, "order_guest")
          assert.equal(headers["x-marketplace-cart-id"], "cart_guest")
          return { order: { id, customer_id: "cus_guest" } }
        },
      }
    },
  )
  assert.deepEqual(orders, [{ id: "order_guest", customer_id: "cus_guest" }])
  assert.equal(fallbackCalls, 1)
})

test("a receipt belonging to the authenticated customer needs no anonymous request", async () => {
  const orders = await retrieveReceiptOrders(
    {
      retrieve: async () => ({ order: { id: "order_guest" } }),
    },
    receipt,
    async () => {
      throw new Error("Unexpected anonymous request")
    },
  )
  assert.deepEqual(orders, [{ id: "order_guest" }])
})

test("an invalid receipt cannot trigger authenticated or anonymous retrieval", async () => {
  const orders = await retrieveReceiptOrders(
    {
      retrieve: async () => {
        throw new Error("Unexpected retrieval")
      },
    },
    JSON.stringify({ cartId: "cart_guest", orderIds: ["invalid"] }),
    async () => {
      throw new Error("Unexpected anonymous request")
    },
  )
  assert.deepEqual(orders, [])
})

for (const status of [401, 403, 500]) {
  test(`a ${status} error is preserved instead of requesting anonymous access`, async () => {
    const failure = new FetchError("Request failed", "error", status)
    await assert.rejects(
      retrieveReceiptOrders(
        {
          retrieve: async () => {
            throw failure
          },
        },
        receipt,
        async () => {
          throw new Error("Unexpected anonymous request")
        },
      ),
      (error) => error === failure,
    )
  })
}

test("an anonymous capability rejected by the backend stays inaccessible without further retries", async () => {
  let fallbackCalls = 0
  const denied = {
    retrieve: async () => {
      throw new FetchError("Resource not found", "not_found", 404)
    },
  }
  const orders = await retrieveReceiptOrders(denied, receipt, async () => {
    fallbackCalls += 1
    return denied
  })
  assert.deepEqual(orders, [])
  assert.equal(fallbackCalls, 1)
})
