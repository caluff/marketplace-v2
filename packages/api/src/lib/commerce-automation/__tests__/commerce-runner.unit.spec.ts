import { NATIVE_COMMERCE_BOUNDARIES } from "../configuration";
import { runCommerceGroup, type CommerceRunnerDependencies } from "../runner";
import { COMMERCE_START, HOUR, commerceFixture } from "./fixtures";
import type {
  CommerceGroupRecord,
  CommerceOperationRecord,
} from "../../../modules/commerce-automation/service";

function harness() {
  const group = commerceFixture();
  let owner: string | null = null;
  let review = false;
  const operations = new Map<string, CommerceOperationRecord>();
  const observation = jest.fn();
  const dependencies: CommerceRunnerDependencies = {
    now: () => COMMERCE_START + 144 * HOUR,
    readGroup: jest.fn(async () => structuredClone(group)),
    cancelOrder: jest.fn(async () => undefined),
    journal: {
      claimGroup: jest.fn(async () => {
        if (owner) return null;
        owner = "owner_one";
        return {
          id: group.id,
          cart_id: group.cart_id,
          active_token: owner,
          review_required: review,
        } as CommerceGroupRecord;
      }),
      observeGroup: jest.fn(async (_id, _token, data, requiresReview) => {
        observation(data);
        review ||= requiresReview;
      }),
      releaseGroup: jest.fn(async () => {
        owner = null;
      }),
      claimOperation: jest.fn(async (input) => {
        const id = `${input.kind}:${input.targetId}`;
        if (operations.has(id)) return null;
        const operation = {
          id,
          group_id: input.groupId,
          token: input.token,
          kind: input.kind,
          target_id: input.targetId,
          state: "processing",
        } as CommerceOperationRecord;
        operations.set(id, operation);
        return operation;
      }),
      finishOperation: jest.fn(async (id, _token, state) => {
        operations.get(id)!.state = state;
      }),
    },
  };
  return {
    group,
    dependencies,
    operations,
    observation,
    owner: () => owner,
    review: () => review,
  };
}

describe("commerce durable orchestration boundary", () => {
  afterEach(() => {
    NATIVE_COMMERCE_BOUNDARIES.cancellationSerializesAllWriters = false;
  });

  it("reports the amount/webhook/accounting integration gaps and makes no native call", async () => {
    const state = harness();
    const result = await runCommerceGroup(state.dependencies);
    expect(result.status).toBe("pending");
    expect(result.pending).toEqual(
      expect.arrayContaining([
        "capturePassesExplicitAmount",
        "reducedCaptureFinalizesPaymentAndCollection",
        "successfulWebhookReconcilesWithoutRecapture",
        "retainedOrderAllocationIsAtomicAndUnique",
      ]),
    );
    expect(state.dependencies.cancelOrder).not.toHaveBeenCalled();
    expect(state.dependencies.journal.claimOperation).not.toHaveBeenCalled();
    expect(state.owner()).toBeNull();
  });

  it("keeps a partial-fulfillment hold after a later fulfillment completes", async () => {
    const state = harness();
    state.group.orders[1].items[0].detail.fulfilled_quantity = 1;
    state.group.orders[1].fulfillments.push({
      id: "ful_second",
      canceled_at: null,
    });
    expect((await runCommerceGroup(state.dependencies)).status).toBe(
      "operator_review",
    );
    state.group.orders[1].items[0].detail.fulfilled_quantity = 2;
    expect((await runCommerceGroup(state.dependencies)).status).toBe(
      "operator_review",
    );
    expect(state.review()).toBe(true);
    expect(state.dependencies.cancelOrder).not.toHaveBeenCalled();
  });

  it("serializes concurrent evaluators before entering a verified native cancellation boundary", async () => {
    NATIVE_COMMERCE_BOUNDARIES.cancellationSerializesAllWriters = true;
    const state = harness();
    let complete!: () => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    jest.mocked(state.dependencies.cancelOrder).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          complete = resolve;
          entered();
        }),
    );
    const first = runCommerceGroup(state.dependencies);
    await started;
    expect((await runCommerceGroup(state.dependencies)).status).toBe("busy");
    complete();
    await first;
    expect(state.dependencies.cancelOrder).toHaveBeenCalledTimes(1);
    expect(state.dependencies.cancelOrder).toHaveBeenCalledWith("order_second");
  });

  it("never retries an uncertain external/native response, including on a subsequent scan", async () => {
    NATIVE_COMMERCE_BOUNDARIES.cancellationSerializesAllWriters = true;
    const state = harness();
    jest
      .mocked(state.dependencies.cancelOrder)
      .mockRejectedValue(new Error("timeout after possible success"));
    await expect(runCommerceGroup(state.dependencies)).rejects.toThrow(
      "uncertain",
    );
    expect(state.operations.get("cancel:order_second")?.state).toBe(
      "uncertain",
    );
    expect(state.owner()).not.toBeNull();
    expect((await runCommerceGroup(state.dependencies)).status).toBe("busy");
    expect(state.dependencies.cancelOrder).toHaveBeenCalledTimes(1);
  });

  it("retains the durable group fence if native success is followed by local bookkeeping failure", async () => {
    NATIVE_COMMERCE_BOUNDARIES.cancellationSerializesAllWriters = true;
    const state = harness();
    jest
      .mocked(state.dependencies.journal.finishOperation)
      .mockRejectedValue(new Error("database unavailable"));
    await expect(runCommerceGroup(state.dependencies)).rejects.toThrow();
    expect(state.owner()).not.toBeNull();
    expect((await runCommerceGroup(state.dependencies)).status).toBe("busy");
    expect(state.dependencies.cancelOrder).toHaveBeenCalledTimes(1);
  });

  it("does not retry a permanent operation claim even if a group fence is released manually", async () => {
    NATIVE_COMMERCE_BOUNDARIES.cancellationSerializesAllWriters = true;
    const state = harness();
    await runCommerceGroup(state.dependencies);
    await expect(runCommerceGroup(state.dependencies)).rejects.toThrow(
      "reconciliation",
    );
    expect(state.dependencies.cancelOrder).toHaveBeenCalledTimes(1);
  });

  it("does not mutate when existing captures show a duplicate success-webhook bookkeeping risk", async () => {
    NATIVE_COMMERCE_BOUNDARIES.cancellationSerializesAllWriters = true;
    const state = harness();
    state.group.orders[0].cart.payment_collection.payments[0].captures.push({
      id: "cap_final",
      amount: "69.25",
    });
    expect((await runCommerceGroup(state.dependencies)).status).toBe(
      "operator_review",
    );
    expect(state.dependencies.cancelOrder).not.toHaveBeenCalled();
  });

  it("rechecks fulfillment after claiming ownership", async () => {
    NATIVE_COMMERCE_BOUNDARIES.cancellationSerializesAllWriters = true;
    const state = harness();
    const original = structuredClone(state.group);
    state.group.orders[1].items[0].detail.fulfilled_quantity = 1;
    state.group.orders[1].fulfillments.push({
      id: "ful_second",
      canceled_at: null,
    });
    jest.mocked(state.dependencies.readGroup).mockResolvedValueOnce(original);
    expect((await runCommerceGroup(state.dependencies)).status).toBe(
      "operator_review",
    );
    expect(state.dependencies.cancelOrder).not.toHaveBeenCalled();
  });
});
