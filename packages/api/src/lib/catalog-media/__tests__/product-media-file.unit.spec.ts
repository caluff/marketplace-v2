import type { FileTypes, Logger } from "@medusajs/framework/types";
import { ProductMediaFileService } from "../../../modules/product-media-file/service";

const content = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jU1sAAAAASUVORK5CYII=";
class TestProvider extends ProductMediaFileService {
  readonly send = jest.fn(async (_command: { input: Record<string, unknown> }) => ({}));
  protected getClient(): ReturnType<ProductMediaFileService["getClient"]> { return { send: (command: { input: Record<string, unknown> }) => this.send(command) } as unknown as ReturnType<ProductMediaFileService["getClient"]>; }
  configuration() { return this.config_; }
}

function fixture() {
  return new TestProvider({ logger: { error: jest.fn() } as unknown as Logger }, { access_key_id: "test-access", secret_access_key: "test-secret", region: "test-region", bucket: "product-images", endpoint: "https://storage.example.test/storage/v1/s3", file_url: "https://storage.example.test/storage/v1/object/public/product-images", acl: "private", additional_client_config: { forcePathStyle: false } });
}

describe("public image-only native S3 provider", () => {
  it("omits unsupported ACLs and sends validated image bytes through native PutObject", async () => {
    const provider = fixture();
    const result = await provider.upload({ filename: "image.png", mimeType: "image/png", content, access: "public" });
    expect(provider.configuration()).toMatchObject({ acl: false, additionalClientConfig: { forcePathStyle: true } });
    expect(provider.send.mock.calls[0][0].input).toMatchObject({ Bucket: "product-images", ContentType: "image/png", Body: Buffer.from(content, "base64"), ACL: undefined });
    expect(result.url).toContain("/storage/v1/object/public/product-images/");
  });
  it.each([undefined, "private"] as const)("rejects access=%s before sending to a public bucket", async access => {
    const provider = fixture();
    await expect(provider.upload({ filename: "image.png", mimeType: "image/png", content, access })).rejects.toBeDefined();
    expect(provider.send).not.toHaveBeenCalled();
  });
  it("rejects SVG, spoofed MIME, upload streams and presigned uploads", async () => {
    const provider = fixture();
    for (const mimeType of ["image/svg+xml", "image/jpeg", "application/pdf"]) await expect(provider.upload({ filename: "image.png", mimeType, content, access: "public" })).rejects.toBeDefined();
    await expect(provider.getUploadStream()).rejects.toBeDefined();
    await expect(provider.getPresignedUploadUrl()).rejects.toBeDefined();
    expect(provider.send).not.toHaveBeenCalled();
  });
  it("returns a recoverable error without claiming upload success", async () => {
    const provider = fixture();
    provider.send.mockRejectedValueOnce(new Error("network unavailable"));
    await expect(provider.upload({ filename: "image.png", mimeType: "image/png", content, access: "public" } satisfies FileTypes.ProviderUploadFileDTO)).rejects.toMatchObject({ code: "catalog_image_storage_unavailable" });
  });
});
