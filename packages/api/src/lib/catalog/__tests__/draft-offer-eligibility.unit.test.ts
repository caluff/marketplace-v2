import type { MedusaContainer } from "@medusajs/framework/types";
import {
  validateOfferEligibility,
  validateOfferUpdates,
} from "../offer-validation";

const graph = jest.fn();
const container = { resolve: () => ({ graph }) } as unknown as MedusaContainer;
let status: string;
let creator: string;
let profileOwner: string;
let restrictedSeller: string | undefined;

beforeEach(() => {
  status = "proposed";
  creator = "seller_own";
  profileOwner = "seller_own";
  restrictedSeller = undefined;
  graph.mockReset().mockImplementation(async ({ entity, filters }) => {
    const data =
      entity === "product_variant"
        ? [{ id: "variant", product: { id: "product", status } }]
        : entity === "seller"
          ? [{ id: "seller_own", status: "open" }]
          : entity === "shipping_profile_seller"
            ? filters.seller_id === profileOwner
              ? [{ shipping_profile_id: "profile" }]
              : []
            : entity === "product_change_action"
              ? filters.product_change.created_by === creator
                ? [{ product_id: "product" }]
                : []
              : entity === "product_seller"
                ? restrictedSeller
                  ? [{ product_id: "product", seller_id: restrictedSeller }]
                  : []
                : entity === "offer"
                  ? [
                      {
                        id: "offer",
                        seller_id: "seller_own",
                        variant_id: "variant",
                        shipping_profile_id: "profile",
                      },
                    ]
                  : [];
    return { data };
  });
});

it.each(["draft", "proposed"])(
  "allows %s commercial data only for its native PRODUCT_ADD creator",
  async (pendingStatus) => {
    status = pendingStatus;
    await expect(
      validateOfferEligibility(container, "seller_own", "variant", "profile"),
    ).resolves.toBeUndefined();
    creator = "seller_other";
    await expect(
      validateOfferEligibility(container, "seller_own", "variant", "profile"),
    ).rejects.toThrow("unavailable seller resources");
  },
);

it("keeps rejected products ineligible even for their creator", async () => {
  status = "rejected";
  await expect(
    validateOfferEligibility(container, "seller_own", "variant", "profile"),
  ).rejects.toThrow();
  expect(
    graph.mock.calls.some(
      ([query]) => query.entity === "product_change_action",
    ),
  ).toBe(false);
});

it("retains native published eligibility and seller restrictions", async () => {
  status = "published";
  creator = "seller_other";
  await expect(
    validateOfferEligibility(container, "seller_own", "variant", "profile"),
  ).resolves.toBeUndefined();
  restrictedSeller = "seller_other";
  await expect(
    validateOfferEligibility(container, "seller_own", "variant", "profile"),
  ).rejects.toThrow();
});

it("retains profile ownership and restriction checks on own pending products", async () => {
  profileOwner = "seller_other";
  await expect(
    validateOfferEligibility(container, "seller_own", "variant", "profile"),
  ).rejects.toThrow();
  profileOwner = "seller_own";
  restrictedSeller = "seller_other";
  await expect(
    validateOfferEligibility(container, "seller_own", "variant", "profile"),
  ).rejects.toThrow();
});

it("allows editing an own pending offer but blocks the same update after rejection", async () => {
  const update = [
    { id: "offer", prices: [{ currency_code: "usd", amount: 18.5 }] },
  ];
  await expect(
    validateOfferUpdates(container, update),
  ).resolves.toBeUndefined();
  status = "rejected";
  await expect(validateOfferUpdates(container, update)).rejects.toThrow();
});
