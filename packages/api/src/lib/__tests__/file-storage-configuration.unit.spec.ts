import { getProductImageStorageConfiguration } from "../file-storage-configuration";

const environment = {
  SUPABASE_S3_ENDPOINT:
    "https://project-test.storage.supabase.co/storage/v1/s3",
  SUPABASE_S3_REGION: "us-east-1",
  SUPABASE_S3_ACCESS_KEY_ID: "test-access-key",
  SUPABASE_S3_SECRET_ACCESS_KEY: "test-secret-value",
  SUPABASE_STORAGE_BUCKET: "product-images",
};

describe("Supabase product image configuration", () => {
  it("keeps uploads unconfigured when no storage credentials exist", () => {
    expect(getProductImageStorageConfiguration({})).toBeNull();
  });

  it("configures native S3 without unsupported ACLs or virtual-host buckets", () => {
    expect(getProductImageStorageConfiguration(environment)).toMatchObject({
      file_url:
        "https://project-test.supabase.co/storage/v1/object/public/product-images",
      endpoint: environment.SUPABASE_S3_ENDPOINT,
      prefix: "products/",
      acl: false,
      additional_client_config: { forcePathStyle: true },
    });
  });

  it("also accepts the project API endpoint", () => {
    expect(
      getProductImageStorageConfiguration({
        ...environment,
        SUPABASE_S3_ENDPOINT: "https://project-test.supabase.co/storage/v1/s3/",
      })?.endpoint,
    ).toBe("https://project-test.supabase.co/storage/v1/s3");
  });

  it.each([
    "http://project-test.supabase.co/storage/v1/s3",
    "https://project-test.supabase.co.evil.test/storage/v1/s3",
    "https://user:password@project-test.supabase.co/storage/v1/s3",
    "https://project-test.supabase.co/storage/v1/s3?token=secret",
    "https://project-test.supabase.co/another-path",
  ])("rejects an unsafe endpoint: %s", (SUPABASE_S3_ENDPOINT) => {
    expect(() =>
      getProductImageStorageConfiguration({
        ...environment,
        SUPABASE_S3_ENDPOINT,
      }),
    ).toThrow("[storage]");
  });

  it("rejects partial configuration without exposing supplied secrets", () => {
    try {
      getProductImageStorageConfiguration({
        SUPABASE_S3_SECRET_ACCESS_KEY:
          environment.SUPABASE_S3_SECRET_ACCESS_KEY,
      });
      throw new Error("Expected configuration failure");
    } catch (error) {
      expect((error as Error).message).toContain("[storage]");
      expect((error as Error).message).not.toContain(
        environment.SUPABASE_S3_SECRET_ACCESS_KEY,
      );
    }
  });
});
