import assert from "node:assert/strict"
import test from "node:test"

import { getFavoriteProductIds } from "./favorites"

test("favorite IDs are safely read from missing or malformed metadata", () => {
  assert.deepEqual(getFavoriteProductIds(undefined), [])
  assert.deepEqual(getFavoriteProductIds({}), [])
  assert.deepEqual(
    getFavoriteProductIds({ account_favorite_product_ids: "prod_one" }),
    [],
  )
})

test("favorite IDs discard invalid data and preserve unique saved product order", () => {
  assert.deepEqual(
    getFavoriteProductIds({
      other_metadata: "preserved",
      account_favorite_product_ids: [
        "prod_second",
        "prod_first",
        "prod_second",
        null,
        2,
        {},
        "cus_other",
        "prod_",
        "prod_/unsafe",
        `prod_${"x".repeat(128)}`,
      ],
    }),
    ["prod_second", "prod_first"],
  )
})
