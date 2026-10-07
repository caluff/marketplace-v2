import type { MedusaContainer } from "@medusajs/framework/types";
import {
  assertProductLifecycleOperation,
  readProductLifecycleState,
} from "../product-lifecycle";
import { readCatalogPermission } from "../../catalog-permission/read";
import { ProductChangeActionType } from "@mercurjs/types";
jest.mock("../../catalog-permission/read", () => ({
  readCatalogPermission: jest.fn(),
}));

const graph = jest.fn();
const container = { resolve: () => ({ graph }) } as unknown as MedusaContainer;
let status: string;
let owns: boolean;
let shared: boolean;
let restrictedElsewhere: boolean;
let pending: boolean;
let publication: Record<string, unknown> | null;
beforeEach(() => {
  status = "published";
  owns = true;
  shared = false;
  restrictedElsewhere = false;
  pending = false;
  publication = null;
  jest
    .mocked(readCatalogPermission)
    .mockResolvedValue({ seller_id: "seller_own", mode: "authorized" });
  graph
    .mockReset()
    .mockImplementation(async ({ entity, filters }) => ({
      data:
        entity === "product"
          ? [{ id: "product", status }]
          : entity === "offer"
            ? shared
              ? [{ id: "other_offer" }]
              : []
            : entity === "product_seller"
              ? restrictedElsewhere
                ? [{ seller_id: "seller_other" }]
                : []
              : entity === "product_change"
                ? pending
                  ? [{ id: "pending" }]
                  : []
                : filters.action === ProductChangeActionType.PRODUCT_ADD
                  ? owns
                    ? [{ id: "addition" }]
                    : []
                  : publication
                    ? [{ details: publication }]
                    : [],
    }));
});
const read = () =>
  readProductLifecycleState(container, "seller_own", "product");

it("allows native operations on an exclusive seller submission without requiring configured offers", async () => {
  const state = await read();
  expect(state.can_manage).toBe(true);
  expect(state.requires_review).toBe(false);
  expect(() => assertProductLifecycleOperation(state, "archive")).not.toThrow();
  expect(() =>
    assertProductLifecycleOperation(state, "deactivate"),
  ).not.toThrow();
  expect(
    graph.mock.calls.find(([query]) => query.entity === "offer")[0].filters,
  ).toEqual({ product_id: "product", seller_id: { $ne: "seller_own" } });
});

it.each(["creator", "offer", "assignment", "pending"])(
  "rejects unsafe %s changes before native mutations",
  async (cause) => {
    if (cause === "creator") owns = false;
    if (cause === "offer") shared = true;
    if (cause === "assignment") restrictedElsewhere = true;
    if (cause === "pending") pending = true;
    const state = await read();
    expect(state.can_manage).toBe(false);
    expect(() => assertProductLifecycleOperation(state, "archive")).toThrow();
    expect(() =>
      assertProductLifecycleOperation(state, "deactivate"),
    ).toThrow();
  },
);

it("retains approval for supervised sellers", async () => {
  jest
    .mocked(readCatalogPermission)
    .mockResolvedValue({ seller_id: "seller_own", mode: "supervised" });
  expect((await read()).requires_review).toBe(true);
});

it("never publishes a draft that was not previously approved", async () => {
  status = "draft";
  expect((await read()).can_activate).toBe(false);
  const state = await read();
  expect(() => assertProductLifecycleOperation(state, "activate")).toThrow();
});

it.each([
  { status: "published" },
  { status: "draft", previous_status: "published" },
])(
  "restores prior approval using native confirmed history %j",
  async (details) => {
    status = "draft";
    publication = details;
    const state = await read();
    expect(state.can_activate).toBe(true);
    expect(() =>
      assertProductLifecycleOperation(state, "activate"),
    ).not.toThrow();
    expect(() =>
      assertProductLifecycleOperation(state, "deactivate"),
    ).toThrow();
    const historyQuery = graph.mock.calls.find(
      ([query]) =>
        query.entity === "product_change_action" &&
        query.fields.includes("details"),
    )[0];
    expect(historyQuery.filters.product_change.status).toBe("confirmed");
  },
);
