import { asValue } from "@medusajs/framework/awilix";
import { createMedusaContainer } from "@medusajs/framework/utils";
import { uploadCatalogImagesWorkflow } from "../../../workflows/upload-catalog-images";
import type { CatalogImageUpload } from "../validation";
import type { CreateFileDTO } from "@medusajs/framework/types";

const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jU1sAAAAASUVORK5CYII=";
const input = { seller_id: "sel_one", member_id: "mem_one", auth_identity_id: "auth_one", body: { files: [{ filename: "photo.png", mime_type: "image/png", content: png }] } as CatalogImageUpload };

function fixture(options: { configured?: boolean; permission?: boolean; inactive?: boolean; identityChanged?: boolean; ownershipFails?: boolean; lostOwnershipResponse?: boolean; storageFails?: boolean; revokedDuringUpload?: boolean } = {}) {
  const records: { file_id: string; url: string; seller_id: string; member_id: string }[] = [];
  let uploaded = false;
  const file = {
    createFiles: jest.fn(async (_files: CreateFileDTO[]) => { if (options.storageFails) throw new Error("storage unavailable"); uploaded = true; return [{ id: "fresh.png", url: "https://media.test/fresh.png" }]; }),
    deleteFiles: jest.fn(async () => undefined),
  };
  const catalogMedia = {
    isStorageConfigured: () => options.configured !== false,
    createCatalogImages: jest.fn(async rows => {
      if (options.ownershipFails) throw new Error("ownership transaction failed");
      records.push(...rows);
      if (options.lostOwnershipResponse) throw new Error("response lost");
      return rows;
    }),
    listCatalogImages: jest.fn(async () => records),
  };
  const container = createMedusaContainer();
  container.register({
    catalogMedia: asValue(catalogMedia), file: asValue(file),
    auth: asValue({ retrieveAuthIdentity: jest.fn(async () => ({ app_metadata: { member_id: options.identityChanged ? "mem_foreign" : input.member_id } })) }),
    seller: asValue({ retrieveMember: jest.fn(async () => ({ id: input.member_id, is_active: !options.inactive })), listSellerMembers: jest.fn(async () => [{ role_id: "role_upload" }]), retrieveSeller: jest.fn(async () => ({ id: input.seller_id, status: "open" })) }),
    rbac: asValue({ listPoliciesForRole: jest.fn(async () => options.permission === false || (uploaded && options.revokedDuringUpload) ? [] : [{ resource: "file", operation: "create" }]) }),
    logger: asValue({ error: jest.fn(), warn: jest.fn(), info: jest.fn() }),
  });
  return { container, file, catalogMedia, records };
}

describe("native catalog image upload workflow", () => {
  it("returns native FileDTOs after stamping server-authorized seller ownership", async () => {
    const f = fixture();
    const { result } = await uploadCatalogImagesWorkflow(f.container).run({ input });
    expect(result).toEqual([{ id: "fresh.png", url: "https://media.test/fresh.png" }]);
    expect(f.records).toEqual([{ seller_id: input.seller_id, member_id: input.member_id, file_id: "fresh.png", url: "https://media.test/fresh.png" }]);
    expect(f.file.createFiles.mock.calls[0][0][0]).toMatchObject({ access: "public", content: png });
  });
  it.each([{ configured: false }, { permission: false }, { inactive: true }, { identityChanged: true }])("fails before storage for invalid access/configuration %j", async options => {
    const f = fixture(options);
    await expect(uploadCatalogImagesWorkflow(f.container).run({ input })).rejects.toBeDefined();
    expect(f.file.createFiles).not.toHaveBeenCalled();
  });
  it("does not record ownership when storage fails", async () => {
    const f = fixture({ storageFails: true });
    await expect(uploadCatalogImagesWorkflow(f.container).run({ input })).rejects.toBeDefined();
    expect(f.catalogMedia.createCatalogImages).not.toHaveBeenCalled();
  });
  it.each([{ ownershipFails: true }, { revokedDuringUpload: true }])("compensates only new uploaded files after ownership or authorization fails %j", async options => {
    const f = fixture(options);
    await expect(uploadCatalogImagesWorkflow(f.container).run({ input })).rejects.toBeDefined();
    expect(f.file.deleteFiles).toHaveBeenCalledWith(["fresh.png"]);
    expect(f.records).toEqual([]);
  });
  it("recovers a committed ownership write with a lost response without deleting the file", async () => {
    const f = fixture({ lostOwnershipResponse: true });
    const { result } = await uploadCatalogImagesWorkflow(f.container).run({ input });
    expect(result[0].id).toBe("fresh.png");
    expect(f.file.deleteFiles).not.toHaveBeenCalled();
    expect(f.records).toHaveLength(1);
  });
});
