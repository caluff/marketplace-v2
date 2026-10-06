import assert from "node:assert/strict"
import test from "node:test"
import { getProductImageZoom } from "./product-image-zoom-geometry.ts"

const square = {
  width: 400,
  height: 400,
  naturalWidth: 1000,
  naturalHeight: 1000,
  pointerX: 200,
  pointerY: 200,
  availableWidth: 600,
}

test("the preview shows exactly the image region covered by the lens", () => {
  const zoom = getProductImageZoom(square)
  assert.equal(zoom.previewWidth, 600)
  assert.equal(zoom.previewHeight, 400)
  assert.equal(zoom.zoomWidth / square.width, 3)
  assert.equal(zoom.zoomLeft, -zoom.lensLeft * 3)
  assert.equal(zoom.zoomTop, -zoom.lensTop * 3)
  assert.equal(zoom.previewWidth, zoom.lensWidth * 3)
  assert.equal(zoom.previewHeight, zoom.lensHeight * 3)
})

test("all corners keep the lens inside the image and the preview filled", () => {
  for (const pointerX of [0, 400]) {
    for (const pointerY of [0, 400]) {
      const zoom = getProductImageZoom({ ...square, pointerX, pointerY })
      assert.ok(zoom.lensLeft >= 0)
      assert.ok(zoom.lensTop >= 0)
      assert.ok(zoom.lensLeft + zoom.lensWidth <= 400)
      assert.ok(zoom.lensTop + zoom.lensHeight <= 400)
      assert.ok(zoom.zoomWidth + zoom.zoomLeft >= zoom.previewWidth)
      assert.ok(zoom.zoomHeight + zoom.zoomTop >= zoom.previewHeight)
    }
  }
})

test("portrait and landscape images exclude their empty contain margins", () => {
  assert.equal(
    getProductImageZoom({ ...square, naturalWidth: 500, pointerX: 20 }),
    null,
  )
  assert.equal(
    getProductImageZoom({ ...square, naturalHeight: 500, pointerY: 20 }),
    null,
  )
  const portrait = getProductImageZoom({ ...square, naturalWidth: 500 })
  assert.equal(portrait.lensLeft, 100)
  assert.equal(portrait.zoomWidth, 600)
  const landscape = getProductImageZoom({ ...square, naturalHeight: 500 })
  assert.ok(landscape.lensTop >= 100)
  assert.ok(landscape.lensTop + landscape.lensHeight <= 300)
})

test("the preview fits the space to the right even for very narrow images", () => {
  assert.equal(
    getProductImageZoom({ ...square, availableWidth: 280 }).previewWidth,
    280,
  )
  const narrow = getProductImageZoom({ ...square, naturalWidth: 100 })
  assert.equal(narrow.previewWidth, 120)
  assert.ok(narrow.zoomLeft === 0)
})

test("unloaded images, unavailable space and invalid coordinates have no zoom", () => {
  for (const invalid of [
    { naturalWidth: 0 },
    { naturalHeight: 0 },
    { availableWidth: 0 },
    { width: 0 },
    { pointerX: NaN },
    { pointerY: -1 },
  ]) {
    assert.equal(getProductImageZoom({ ...square, ...invalid }), null)
  }
})
