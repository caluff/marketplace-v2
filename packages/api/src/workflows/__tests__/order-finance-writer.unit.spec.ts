import { asValue } from "@medusajs/framework/awilix";
import { createMedusaContainer } from "@medusajs/framework/utils";
import { COMMERCE_AUTOMATION_MODULE } from "../../modules/commerce-automation";
import { guardOrderFinanceWriterWorkflow } from "../guard-order-finance-writer";

describe("durable native writer fence", () => {
  function fixture(review = false) {
    const container = createMedusaContainer();
    const journal = {
      claimGroup: jest.fn(async () => ({
        id: "group_1",
        active_token: "token_1",
        review_required: review,
      })),
      releaseGroup: jest.fn(async () => undefined),
      observeGroup: jest.fn(async () => undefined),
    };
    container.register({ [COMMERCE_AUTOMATION_MODULE]: asValue(journal) });
    return {
      journal,
      run: (action: "claim" | "finish" | "disconnect") =>
        guardOrderFinanceWriterWorkflow(container).run({
          input: {
            group_id: "group_1",
            cart_id: "cart_1",
            token: "token_1",
            action,
          },
        }),
    };
  }
  it("claims before handing off a native writer", async () => {
    const test = fixture();
    expect((await test.run("claim")).result).toBe("token_1");
    expect(test.journal.claimGroup).toHaveBeenCalledWith("group_1", "cart_1");
    expect(test.journal.releaseGroup).not.toHaveBeenCalled();
  });
  it("releases a completed native writer", async () => {
    const test = fixture();
    await test.run("finish");
    expect(test.journal.releaseGroup).toHaveBeenCalledWith(
      "group_1",
      "token_1",
    );
  });
  it("retains the durable claim after disconnect and records mandatory review", async () => {
    const test = fixture();
    await test.run("disconnect");
    expect(test.journal.releaseGroup).not.toHaveBeenCalled();
    expect(test.journal.observeGroup).toHaveBeenCalledWith(
      "group_1",
      "token_1",
      { finance_writer_disconnected: true },
      true,
    );
  });
  it("does not allow a prior review hold to be bypassed", async () => {
    const test = fixture(true);
    await expect(test.run("claim")).rejects.toMatchObject({
      message: "La compra requiere conciliación del operador.",
    });
    expect(test.journal.releaseGroup).toHaveBeenCalledWith(
      "group_1",
      "token_1",
    );
    expect(test.journal.observeGroup).not.toHaveBeenCalled();
  });
});
