import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PriceRuleDTO } from "@medusajs/types";
import {
  baseUsdPrice,
  replaceBaseUsdPrice,
  usdAmount,
  type OfferPrice,
} from "./operations";

const rules = (attribute = "offer_id", value = "offer_1") =>
  [{ attribute, value }] as PriceRuleDTO[];
describe("offer price replacement", () => {
  it("preserves IDs, other currencies, tiers and rule values in display units", () => {
    const prices: OfferPrice[] = [
      {
        id: "price_usd",
        amount: 49.99,
        currency_code: "usd",
        price_rules: rules(),
      },
      {
        id: "price_eur",
        amount: 42,
        currency_code: "eur",
        price_rules: rules(),
      },
      {
        id: "price_tier",
        amount: 35,
        currency_code: "usd",
        min_quantity: 10,
        max_quantity: 50,
        price_rules: rules(),
      },
      {
        id: "price_region",
        amount: 39,
        currency_code: "usd",
        price_rules: [...rules(), ...rules("region_id", "region_1")],
      },
    ];
    const result = replaceBaseUsdPrice(prices, usdAmount("52.75"));
    assert.deepEqual(
      result.map((price) => [price.id, price.amount]),
      [
        ["price_usd", 52.75],
        ["price_eur", 42],
        ["price_tier", 35],
        ["price_region", 39],
      ],
    );
    assert.equal(result[2].min_quantity, 10);
    assert.equal(result[2].max_quantity, 50);
    assert.deepEqual(result[3].rules, {
      offer_id: "offer_1",
      region_id: "region_1",
    });
    assert.equal(prices[0].amount, 49.99);
  });
  it("adds a USD base without deleting existing ladders and rejects incomplete pricing reads", () => {
    const result = replaceBaseUsdPrice(
      [{ id: "eur", amount: 10, currency_code: "eur", price_rules: rules() }],
      12.34,
    );
    assert.equal(result.length, 2);
    assert.equal(result[0].id, "eur");
    assert.equal(result[1].amount, 12.34);
    assert.throws(() =>
      replaceBaseUsdPrice(
        [{ id: "unknown", amount: 10, currency_code: "usd" }],
        12,
      ),
    );
    assert.throws(() =>
      baseUsdPrice([
        { id: "a", amount: 10, currency_code: "usd", price_rules: rules() },
        { id: "b", amount: 20, currency_code: "usd", price_rules: rules() },
      ]),
    );
  });
  it("rejects negative, exponential, fractional-cent and nonfinite price input", () => {
    for (const value of ["", "-1", "NaN", "Infinity", "1e2", "0.001", "1,20"])
      assert.throws(() => usdAmount(value));
    assert.equal(usdAmount("49.99"), 49.99);
    assert.equal(usdAmount("0"), 0);
  });
});
