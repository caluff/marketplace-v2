import { MedusaError } from "@medusajs/framework/utils";
import {
  prepareConcurrentOfferPriceUpdate,
  type ConcurrentOfferPriceInput,
  type OfferPriceUpdateSnapshot,
} from "../catalog/offer-price-concurrency";

const input: ConcurrentOfferPriceInput = {
  seller_id: "seller_1",
  offer_id: "offer_1",
  amount: 52.75,
  expected_amount: 49.99,
  sku: "SKU-NEW",
  expected_sku: "SKU-OLD",
  shipping_profile_id: "sp_new",
  expected_shipping_profile_id: "sp_old",
};

function offer(
  overrides: Partial<OfferPriceUpdateSnapshot> = {},
): OfferPriceUpdateSnapshot {
  return {
    id: "offer_1",
    seller_id: "seller_1",
    sku: "SKU-OLD",
    shipping_profile_id: "sp_old",
    prices: [
      {
        id: "price_usd",
        amount: 49.99,
        currency_code: "usd",
        min_quantity: null,
        max_quantity: null,
        price_rules: [{ attribute: "offer_id", value: "offer_1" }],
      },
      {
        id: "price_eur",
        amount: 42,
        currency_code: "eur",
        min_quantity: null,
        max_quantity: null,
        price_rules: [{ attribute: "offer_id", value: "offer_1" }],
      },
      {
        id: "price_tier",
        amount: 35,
        currency_code: "usd",
        min_quantity: 10,
        max_quantity: 50,
        price_rules: [{ attribute: "offer_id", value: "offer_1" }],
      },
    ],
    ...overrides,
  };
}

describe("concurrent vendor offer price updates", () => {
  it("builds a complete native ladder update from the locked authoritative read", () => {
    expect(prepareConcurrentOfferPriceUpdate(offer(), input)).toEqual({
      id: "offer_1",
      sku: "SKU-NEW",
      shipping_profile_id: "sp_new",
      prices: [
        {
          id: "price_usd",
          amount: 52.75,
          currency_code: "usd",
          min_quantity: null,
          max_quantity: null,
          rules: { offer_id: "offer_1" },
        },
        {
          id: "price_eur",
          amount: 42,
          currency_code: "eur",
          min_quantity: null,
          max_quantity: null,
          rules: { offer_id: "offer_1" },
        },
        {
          id: "price_tier",
          amount: 35,
          currency_code: "usd",
          min_quantity: 10,
          max_quantity: 50,
          rules: { offer_id: "offer_1" },
        },
      ],
    });
  });

  it("rejects a stale price, SKU, shipping profile, and foreign offer", () => {
    expect(() =>
      prepareConcurrentOfferPriceUpdate(
        offer({ prices: [{ ...offer().prices![0], amount: 51 }] }),
        input,
      ),
    ).toThrow("El precio cambió");
    expect(() =>
      prepareConcurrentOfferPriceUpdate(offer({ sku: "SKU-OTHER" }), input),
    ).toThrow("El SKU cambió");
    expect(() =>
      prepareConcurrentOfferPriceUpdate(
        offer({ shipping_profile_id: "sp_other" }),
        input,
      ),
    ).toThrow("El perfil de envío cambió");
    expect(() =>
      prepareConcurrentOfferPriceUpdate(
        offer({ seller_id: "seller_other" }),
        input,
      ),
    ).toThrow(new MedusaError(MedusaError.Types.NOT_ALLOWED, "La oferta no pertenece a esta tienda."));
  });

  it("adds a USD base when the existing ladder has only other currencies", () => {
    const result = prepareConcurrentOfferPriceUpdate(
      offer({
        prices: [
          {
            id: "price_eur",
            amount: 42,
            currency_code: "eur",
            price_rules: [{ attribute: "offer_id", value: "offer_1" }],
          },
        ],
      }),
      { ...input, expected_amount: null },
    );
    expect(result.prices).toHaveLength(2);
    expect(result.prices[1]).toMatchObject({
      amount: 52.75,
      currency_code: "usd",
      rules: {},
    });
  });
});
