import type { MedusaContainer } from "@medusajs/framework/types";
import { batchVariantImagesWorkflow } from "@medusajs/medusa/core-flows";
import { linkInitialVariantImages } from "../steps/link-initial-variant-images";

jest.mock("@medusajs/medusa/core-flows", () => ({
  batchVariantImagesWorkflow: jest.fn(),
}));
const run = jest.fn();
const container = {} as MedusaContainer;
const first = { variant_id: "variant_blue", add: ["image_blue"], remove: [] };
const second = { variant_id: "variant_red", add: ["image_red"], remove: [] };
beforeEach(() => {
  run.mockReset().mockResolvedValue({});
  jest
    .mocked(batchVariantImagesWorkflow)
    .mockReturnValue({ run } as unknown as ReturnType<
      typeof batchVariantImagesWorkflow
    >);
});

it("uses the native variant image workflow and returns links for parent compensation", async () => {
  await expect(
    linkInitialVariantImages(container, [first, second]),
  ).resolves.toEqual([first, second]);
  expect(run.mock.calls.map(([input]) => input)).toEqual([
    { input: first },
    { input: second },
  ]);
});

it("compensates earlier links when a later native image workflow fails", async () => {
  run
    .mockResolvedValueOnce({})
    .mockRejectedValueOnce(new Error("Native image linking failed"))
    .mockResolvedValueOnce({});
  await expect(
    linkInitialVariantImages(container, [first, second]),
  ).rejects.toThrow("Native image linking failed");
  expect(run).toHaveBeenLastCalledWith({
    input: { variant_id: first.variant_id, remove: first.add },
  });
});
