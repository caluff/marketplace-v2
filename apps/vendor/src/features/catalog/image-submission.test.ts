import assert from "node:assert/strict";
import { test } from "node:test";
import {
  prepareCatalogImages,
  type CatalogAttachment,
} from "./image-submission";

const retainedImages = (count: number): CatalogAttachment[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `img_${index}`,
    name: `Imagen ${index + 1}`,
    url: `https://example.test/${index}.jpg`,
  }));

const pendingImage = (): CatalogAttachment => ({
  id: "pending",
  name: "Nueva imagen",
  url: "blob:pending",
  file: new File([new Uint8Array([255, 216, 255])], "new.jpg", {
    type: "image/jpeg",
  }),
});

test("a product gallery can upload a replacement while retaining more than six photos", async () => {
  const attachments = [...retainedImages(7), pendingImage()];
  const uploaded: CatalogAttachment[] = [];
  let uploads = 0;
  const result = await prepareCatalogImages(
    attachments,
    async (form) => {
      uploads++;
      assert.equal(form.getAll("file").length, 1);
      return {
        files: [{ id: "file_new", url: "https://example.test/new.jpg" }],
      };
    },
    (attachment) => uploaded.push(attachment),
    8,
  );
  assert.equal(uploads, 1);
  assert.deepEqual(result, [
    ...retainedImages(7).map(({ url }) => ({ url })),
    { url: "https://example.test/new.jpg" },
  ]);
  assert.equal(uploaded[0].file, undefined);
});

test("the default creation limit still rejects more than six images before uploading", async () => {
  let uploads = 0;
  const upload = async () => {
    uploads++;
    return { files: [{ id: "file_new", url: "https://example.test/new.jpg" }] };
  };
  await assert.rejects(
    prepareCatalogImages(
      [...retainedImages(6), pendingImage()],
      upload,
      () => {},
    ),
    /hasta 6 imágenes/,
  );
  await assert.rejects(
    prepareCatalogImages(retainedImages(7), upload, () => {}),
    /hasta 6 imágenes/,
  );
  assert.equal(uploads, 0);
});

test("a saved gallery submits only the retained URLs without reuploading removed photos", async () => {
  const attachments = retainedImages(8).filter(({ id }) => id !== "img_2");
  const result = await prepareCatalogImages(
    attachments,
    async () => {
      throw new Error("Saved images must not upload again");
    },
    () => {
      throw new Error("Saved images must not change locally");
    },
    8,
  );
  assert.deepEqual(
    result,
    attachments.map(({ url }) => ({ url })),
  );
  assert.equal(
    result.some(({ url }) => url.endsWith("/2.jpg")),
    false,
  );
});
