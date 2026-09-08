import { asValue } from "@medusajs/framework/awilix";
import { createMedusaContainer } from "@medusajs/framework/utils";
import { assertSellerCatalogImages } from "../access";
import { CatalogImageUploadSchema, MAX_CATALOG_IMAGE_BYTES, prepareCatalogImages, validateCatalogImageContent } from "../validation";
import { denyUnownedVendorUploads, vendorCatalogImageMiddlewares } from "../../../api/vendor/catalog-images/middlewares";
import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http";

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jU1sAAAAASUVORK5CYII=";
const JPEG = "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD8qqKKKAP/2Q==";
const WEBP = "UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA";

describe("catalog image payload validation", () => {
  it("preserves the live membership roles established by the vendor guard", async () => {
    const context = { actor_id: "mem_current", app_metadata: { roles: ["role_current"] } };
    const request = {
      body: { files: [{ filename: "photo.png", mime_type: "image/png", content: PNG }] },
      auth_context: context,
    } as unknown as AuthenticatedMedusaRequest;
    // A second authenticate() would parse the original token and discard live roles.
    for (const middleware of vendorCatalogImageMiddlewares[0].middlewares ?? []) {
      const next = jest.fn();
      await middleware(request, {} as MedusaResponse, next);
      expect(next).toHaveBeenCalledWith();
      expect(request.auth_context).toBe(context);
    }
    expect(request.validatedBody).toEqual(request.body);
    expect(vendorCatalogImageMiddlewares[0].policies).toEqual([{ resource: "file", operation: "create" }]);
  });
  it("denies the native unbounded vendor upload endpoint with the guarded replacement route", () => {
    expect(() => denyUnownedVendorUploads()).toThrow("/vendor/catalog-images");
  });
  it("validates PNG bytes and generates a server filename with explicit public access", () => {
    expect(validateCatalogImageContent(PNG, "image/png")).toEqual(Buffer.from(PNG, "base64"));
    const [file] = prepareCatalogImages({ files: [{ filename: "../../not-an-image.svg", mime_type: "image/png", content: PNG }] });
    expect(file).toMatchObject({ access: "public", mimeType: "image/png", content: PNG });
    expect(file.filename).toMatch(/^[a-f0-9-]+\.png$/);
  });
  it.each([[JPEG, "image/jpeg"], [WEBP, "image/webp"]])("accepts the supported raster signature for %s", (content, mime) => {
    expect(validateCatalogImageContent(content, mime)).toEqual(Buffer.from(content, "base64"));
  });
  it.each(["image/jpeg", "image/webp", "image/svg+xml", "text/html"])("rejects declared MIME %s when it does not match the file signature", mime => {
    expect(() => validateCatalogImageContent(PNG, mime)).toThrow();
  });
  it("rejects noncanonical base64, truncated images, SVG, oversized files and excessive counts", () => {
    for (const content of [PNG + "\n", "data:image/png;base64," + PNG, PNG.slice(0, -4), Buffer.from("<svg></svg>").toString("base64"), Buffer.alloc(MAX_CATALOG_IMAGE_BYTES + 1).toString("base64")]) {
      expect(() => validateCatalogImageContent(content, "image/png")).toThrow();
    }
    const file = { filename: "image.png", mime_type: "image/png", content: PNG };
    expect(CatalogImageUploadSchema.safeParse({ files: Array(7).fill(file) }).success).toBe(false);
    expect(CatalogImageUploadSchema.safeParse({ files: [{ ...file, access: "private" }] }).success).toBe(false);
  });
  it("rejects PNG bytes with trailing HTML or invalid chunk bounds", () => {
    expect(() => validateCatalogImageContent(Buffer.concat([Buffer.from(PNG, "base64"), Buffer.from("<script>alert(1)</script>")]).toString("base64"), "image/png")).toThrow();
    const bytes = Buffer.from(PNG, "base64");
    bytes.writeUInt32BE(0x7fffffff, 8);
    expect(() => validateCatalogImageContent(bytes.toString("base64"), "image/png")).toThrow();
  });
  it("caps aggregate decoded upload content at 5 MiB even when individual files fit", () => {
    const file = { filename: "image.png", mime_type: "image/png", content: Buffer.alloc(3 * 1024 * 1024).toString("base64") };
    expect(CatalogImageUploadSchema.safeParse({ files: [file, file] }).success).toBe(false);
  });
});

function ownershipFixture() {
  const owned = [{ seller_id: "sel_one", file_id: "own.png", url: "https://media.test/own.png" }];
  const product = { id: "prod_shared", status: "published", thumbnail: "https://media.test/shared.png", images: [{ id: "img_shared", url: "https://media.test/shared.png" }, { id: "img_own", url: "https://media.test/own.png" }], variants: [{ id: "variant_own", thumbnail: "https://media.test/own.png" }] };
  const listCatalogImages = jest.fn(async ({ seller_id, url }) => owned.filter(row => row.seller_id === seller_id && url.includes(row.url)));
  const container = createMedusaContainer();
  container.register({ catalogMedia: asValue({ listCatalogImages }), query: asValue({ graph: jest.fn(async ({ entity }) => ({ data: entity === "product" ? [product] : [] })) }) });
  return { container, product, listCatalogImages };
}

describe("durable seller image ownership", () => {
  it("authorizes its own uploaded URL without trusting origin prefixes", async () => {
    const f = ownershipFixture();
    await expect(assertSellerCatalogImages(f.container, "sel_one", { images: [{ url: "https://media.test/own.png" }], thumbnail: "https://media.test/own.png" })).resolves.toBeUndefined();
    await expect(assertSellerCatalogImages(f.container, "sel_two", { images: [{ url: "https://media.test/own.png" }] })).rejects.toBeDefined();
    await expect(assertSellerCatalogImages(f.container, "sel_one", { thumbnail: "https://media.test/forged.png" })).rejects.toBeDefined();
  });
  it("preserves shared images unchanged and permits removal of only owned URLs", async () => {
    const f = ownershipFixture();
    await expect(assertSellerCatalogImages(f.container, "sel_one", { product_id: f.product.id, images: [f.product.images[0]], thumbnail: f.product.thumbnail })).resolves.toBeUndefined();
    await expect(assertSellerCatalogImages(f.container, "sel_one", { product_id: f.product.id, images: [f.product.images[1]] })).rejects.toBeDefined();
    await expect(assertSellerCatalogImages(f.container, "sel_one", { product_id: f.product.id, thumbnail: null })).rejects.toBeDefined();
  });
  it("rejects forged image IDs and unpublished products belonging to another seller", async () => {
    const f = ownershipFixture();
    await expect(assertSellerCatalogImages(f.container, "sel_one", { product_id: f.product.id, images: [{ id: "img_foreign", url: f.product.images[0].url }] })).rejects.toBeDefined();
    f.product.status = "proposed";
    await expect(assertSellerCatalogImages(f.container, "sel_one", { product_id: f.product.id, images: f.product.images })).rejects.toBeDefined();
  });
  it("does not load image ownership for unrelated product edits", async () => {
    const f = ownershipFixture();
    await assertSellerCatalogImages(f.container, "sel_one", { title: "New title" });
    expect(f.listCatalogImages).not.toHaveBeenCalled();
  });
  it("checks nested variant thumbnails on product creation", async () => {
    const f = ownershipFixture();
    await expect(assertSellerCatalogImages(f.container, "sel_one", { variants: [{ thumbnail: "https://media.test/forged.png" }] })).rejects.toBeDefined();
    await expect(assertSellerCatalogImages(f.container, "sel_one", { variants: [{ thumbnail: "https://media.test/own.png" }] })).resolves.toBeUndefined();
  });
  it("compares variant thumbnail edits with that variant and rejects foreign variant IDs", async () => {
    const f = ownershipFixture();
    await expect(assertSellerCatalogImages(f.container, "sel_one", { product_id: f.product.id, variant_context: true, variant_id: "variant_own", thumbnail: null })).resolves.toBeUndefined();
    await expect(assertSellerCatalogImages(f.container, "sel_one", { product_id: f.product.id, variant_context: true, variant_id: "variant_foreign", thumbnail: null })).rejects.toBeDefined();
  });
});
