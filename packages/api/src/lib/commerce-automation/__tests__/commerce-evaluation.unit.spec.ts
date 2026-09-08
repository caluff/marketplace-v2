import type { MedusaContainer } from "@medusajs/framework/types";
import evaluateCommerceJob from "../../../jobs/evaluate-commerce";
import { evaluateCommerceBatch } from "../../../workflows/steps/evaluate-commerce";
import { commerceAutomationEnabled } from "../configuration";
import { runCommerceGroup } from "../runner";
import { MAX_COMMERCE_GROUPS } from "../policy";

jest.mock("../configuration", () => ({
  ...jest.requireActual("../configuration"),
  commerceAutomationEnabled: jest.fn(),
}));
jest.mock("../runner", () => ({ runCommerceGroup: jest.fn() }));

function fixture(ids: string[] = []) {
  const journal = {
    listCommerceScans: jest.fn(async () => [{ position: "og_previous" }]),
    advanceScan: jest.fn(),
  };
  const query = {
    graph: jest.fn(async () => ({ data: ids.map((id) => ({ id })) })),
  };
  const payout = { getOptions: jest.fn(() => ({ disabled: false })) };
  const logger = { warn: jest.fn() };
  const services: Record<string, unknown> = {
    commerceAutomation: journal,
    query,
    payout,
    logger,
  };
  const resolve = jest.fn((name: string) => {
    if (!(name in services))
      throw new Error(`Unexpected infrastructure: ${name}`);
    return services[name];
  });
  return {
    journal,
    query,
    payout,
    logger,
    resolve,
    container: { resolve } as unknown as MedusaContainer,
  };
}

describe("bounded commerce evaluation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(commerceAutomationEnabled).mockReturnValue(true);
    jest.mocked(runCommerceGroup).mockResolvedValue({ status: "pending" });
  });

  it("disabled job and direct evaluation exit without resolving infrastructure", async () => {
    jest.mocked(commerceAutomationEnabled).mockReturnValue(false);
    const state = fixture();
    await evaluateCommerceJob(state.container);
    expect((await evaluateCommerceBatch(state.container)).status).toBe(
      "disabled",
    );
    expect(state.resolve).not.toHaveBeenCalled();
  });

  it("honors the native payout disabled option before touching persistence", async () => {
    const state = fixture();
    state.payout.getOptions.mockReturnValue({ disabled: true });
    expect((await evaluateCommerceBatch(state.container)).status).toBe(
      "disabled",
    );
    expect(state.journal.listCommerceScans).not.toHaveBeenCalled();
    expect(state.query.graph).not.toHaveBeenCalled();
  });

  it("limits work even if a query violates the requested page bound", async () => {
    const state = fixture(
      Array.from(
        { length: MAX_COMMERCE_GROUPS + 5 },
        (_, index) => `og_${index}`,
      ),
    );
    const result = await evaluateCommerceBatch(state.container);
    expect(result.evaluated).toBe(MAX_COMMERCE_GROUPS);
    expect(runCommerceGroup).toHaveBeenCalledTimes(MAX_COMMERCE_GROUPS);
    expect(state.journal.advanceScan).toHaveBeenCalledWith(
      "og_previous",
      `og_${MAX_COMMERCE_GROUPS - 1}`,
    );
    expect(state.query.graph).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: { id: { $gt: "og_previous" } },
        pagination: { take: MAX_COMMERCE_GROUPS, order: { id: "ASC" } },
      }),
      { cache: { enable: false } },
    );
  });

  it("wraps the durable cursor on an empty page without another query", async () => {
    const state = fixture();
    await evaluateCommerceBatch(state.container);
    expect(state.query.graph).toHaveBeenCalledTimes(1);
    expect(state.journal.advanceScan).toHaveBeenCalledWith("og_previous", null);
    expect(runCommerceGroup).not.toHaveBeenCalled();
  });

  it("advances past an invalid group and keeps valid siblings in the bounded scan", async () => {
    const state = fixture(["og_bad", "og_good"]);
    jest
      .mocked(runCommerceGroup)
      .mockRejectedValueOnce(new Error("invalid graph"));
    expect(await evaluateCommerceBatch(state.container)).toMatchObject({
      invalid: 1,
      evaluated: 1,
      pending: 1,
    });
    expect(state.journal.advanceScan).toHaveBeenCalledWith(
      "og_previous",
      "og_good",
    );
    expect(state.logger.warn).toHaveBeenCalledTimes(1);
  });
});

describe("commerce environment guard", () => {
  const actual: typeof import("../configuration") =
    jest.requireActual("../configuration");
  it("does not parse credentials while disabled", () => {
    expect(
      actual.commerceAutomationEnabled({ STRIPE_API_KEY: "sk_live_invalid" }),
    ).toBe(false);
  });
  it("cannot enable with a live key or incomplete test configuration", () => {
    expect(() =>
      actual.commerceAutomationEnabled({
        STRIPE_AUTOMATIC_JOBS_ENABLED: "true",
        STRIPE_API_KEY: "sk_live_invalid",
      }),
    ).toThrow();
    expect(
      actual.commerceAutomationEnabled({
        STRIPE_AUTOMATIC_JOBS_ENABLED: "true",
      }),
    ).toBe(false);
  });
});
