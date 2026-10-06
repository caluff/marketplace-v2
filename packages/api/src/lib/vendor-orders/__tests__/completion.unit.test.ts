import { orderCompletionEligibility } from "../completion";

const item = (
  id = "item_ship",
  fulfilled = 2,
  delivered = 0,
  requiresShipping = true,
) => ({
  id,
  quantity: 2,
  requires_shipping: requiresShipping,
  detail: { fulfilled_quantity: fulfilled, delivered_quantity: delivered },
});
const fulfillment = (
  id: string,
  lineItemId: string,
  pickup = false,
  delivered = false,
) => ({
  id,
  shipping_option_id: pickup ? "option_pickup" : "option_ship",
  canceled_at: null as string | null,
  delivered_at: delivered ? "2026-10-06T12:00:00Z" : null,
  items: [{ line_item_id: lineItemId }],
});
const options = [
  { id: "option_pickup", metadata: { marketplace_v2_pickup: true } },
  { id: "option_ship", metadata: {} },
];
const order = (
  items = [item()],
  fulfillments = [fulfillment("ful_ship", "item_ship")],
) => ({
  id: "order_1",
  status: "pending",
  items,
  fulfillments,
});

describe("vendor order completion eligibility", () => {
  it("requires full delivery for shipping, never merely preparation or a partial delivery", () => {
    expect(orderCompletionEligibility(order(), options).can_complete).toBe(
      false,
    );
    expect(
      orderCompletionEligibility(order([item("item_ship", 2, 1)]), options)
        .can_complete,
    ).toBe(false);
    expect(
      orderCompletionEligibility(
        order(
          [item("item_ship", 2, 2)],
          [fulfillment("ful_ship", "item_ship", false, true)],
        ),
        options,
      ).can_complete,
    ).toBe(true);
  });
  it("recognizes physical pickup items from the option, requires all prepared and returns pickup fulfillment IDs", () => {
    const pickups = [fulfillment("ful_pickup", "item_ship", true)];
    expect(
      orderCompletionEligibility(
        order([item("item_ship", 1)], pickups),
        options,
      ).can_complete,
    ).toBe(false);
    expect(
      orderCompletionEligibility(order([item()], pickups), options),
    ).toEqual({
      can_complete: true,
      pickup_fulfillment_ids: ["ful_pickup"],
      preparation_groups: [],
    });
    expect(
      orderCompletionEligibility(order([item()], pickups), [
        {
          id: "option_pickup",
          service_zone: { fulfillment_set: { type: "pickup" } },
        },
      ]).can_complete,
    ).toBe(true);
  });
  it("reads versioned item quantities from the native graph detail relation", () => {
    const graphItem = {
      ...item(),
      quantity: undefined,
      detail: { ...item().detail, quantity: 2 },
    };
    expect(
      orderCompletionEligibility(
        {
          ...order(),
          items: [graphItem],
          fulfillments: [fulfillment("ful_pickup", "item_ship", true)],
        },
        options,
      ).can_complete,
    ).toBe(true);
    expect(
      orderCompletionEligibility(
        {
          ...order(),
          items: [
            {
              ...graphItem,
              detail: { fulfilled_quantity: 2, delivered_quantity: 2 },
            },
          ],
        },
        options,
      ).can_complete,
    ).toBe(false);
  });
  it("does not complete mixed pickup and shipping until every shipment is delivered", () => {
    const fulfillments = [
      fulfillment("ful_pickup", "item_pickup", true),
      fulfillment("ful_ship", "item_ship"),
    ];
    expect(
      orderCompletionEligibility(
        order([item("item_pickup"), item()], fulfillments),
        options,
      ).can_complete,
    ).toBe(false);
    expect(
      orderCompletionEligibility(
        order([item("item_pickup"), item("item_ship", 2, 2)], fulfillments),
        options,
      ).can_complete,
    ).toBe(true);
  });
  it("does not let pickup bypass an undelivered shipment for the same item", () => {
    expect(
      orderCompletionEligibility(
        order(
          [item()],
          [
            fulfillment("ful_pickup", "item_ship", true),
            fulfillment("ful_ship", "item_ship"),
          ],
        ),
        options,
      ).can_complete,
    ).toBe(false);
  });
  it("requires digital preparation without delivery and rejects canceled, complete, empty or malformed orders", () => {
    expect(
      orderCompletionEligibility(order([item("digital", 2, 0, false)], []), [])
        .can_complete,
    ).toBe(true);
    for (const value of [
      { ...order(), status: "completed" },
      { ...order(), status: "canceled" },
      order([], []),
      { ...order(), items: [{ ...item(), requires_shipping: undefined }] },
      order([item("item_ship", -1)]),
    ]) {
      expect(orderCompletionEligibility(value, options).can_complete).toBe(
        false,
      );
    }
  });
  it("ignores canceled pickup fulfillments and cannot infer pickup from missing options", () => {
    const pickup = fulfillment("ful_pickup", "item_ship", true);
    expect(
      orderCompletionEligibility(
        order([item()], [{ ...pickup, canceled_at: "2026-10-06" }]),
        options,
      ),
    ).toEqual({
      can_complete: false,
      pickup_fulfillment_ids: [],
      preparation_groups: [],
    });
    expect(
      orderCompletionEligibility(order([item()], [pickup]), []).can_complete,
    ).toBe(false);
  });
  it("groups physical preparation by the selected option and actual offer profile, plus a separate digital group", () => {
    const value = {
      ...order(),
      items: [
        { ...item("pickup"), offer: { shipping_profile_id: "profile_pickup" } },
        {
          ...item("shipping"),
          offer: { shipping_profile_id: "profile_shipping" },
        },
        item("digital", 0, 0, false),
      ],
      shipping_methods: [
        { shipping_option_id: "option_pickup" },
        { shipping_option_id: "option_ship" },
      ],
    };
    const profileOptions = options.map((option) => ({
      ...option,
      shipping_profile_id:
        option.id === "option_pickup" ? "profile_pickup" : "profile_shipping",
    }));
    expect(
      orderCompletionEligibility(value, profileOptions).preparation_groups,
    ).toEqual([
      {
        shipping_option_id: "option_pickup",
        is_pickup: true,
        item_ids: ["pickup"],
      },
      {
        shipping_option_id: "option_ship",
        is_pickup: false,
        item_ids: ["shipping"],
      },
      { shipping_option_id: null, is_pickup: false, item_ids: ["digital"] },
    ]);
    expect(
      orderCompletionEligibility({ ...value, items: [item()] }, profileOptions)
        .preparation_groups,
    ).toEqual([]);
  });
  it("does not classify a mixed fulfillment as pickup when its items belong to a shipping profile", () => {
    const value = {
      ...order(),
      items: [
        { ...item(), offer: { shipping_profile_id: "profile_shipping" } },
      ],
      fulfillments: [fulfillment("ful_wrong_pickup", "item_ship", true)],
      shipping_methods: [
        { shipping_option_id: "option_pickup" },
        { shipping_option_id: "option_ship" },
      ],
    };
    const profileOptions = options.map((option) => ({
      ...option,
      shipping_profile_id:
        option.id === "option_pickup" ? "profile_pickup" : "profile_shipping",
    }));
    expect(orderCompletionEligibility(value, profileOptions)).toEqual({
      can_complete: false,
      pickup_fulfillment_ids: [],
      preparation_groups: [
        {
          shipping_option_id: "option_ship",
          is_pickup: false,
          item_ids: ["item_ship"],
        },
      ],
    });
  });
});
