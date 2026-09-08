import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import test from "node:test"
import { fileURLToPath } from "node:url"

test("shipping groups preserve seller, profile and choice order without Map.groupBy", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--input-type=module",
      "--eval",
      `
        import assert from "node:assert/strict"
        import { createRequire } from "node:module"
        Reflect.deleteProperty(Map, "groupBy")
        assert.equal(Map.groupBy, undefined)
        const require = createRequire(import.meta.url)
        const { shippingGroups } = require(${JSON.stringify(fileURLToPath(new URL("./presentation.ts", import.meta.url)))})
        const groups = shippingGroups({
          seller_b: [
            { id: "express", shipping_profile_id: "small" },
            { id: "freight", shipping_profile_id: "large" },
            { id: "standard", shipping_profile_id: "small" },
          ],
          seller_a: [{ id: "second_seller", shipping_profile_id: "small" }],
        })
        assert.deepEqual(groups.map(({ key, choices }) => ({
          key,
          ids: choices.map(({ id }) => id),
        })), [
          { key: "seller_b_small", ids: ["express", "standard"] },
          { key: "seller_b_large", ids: ["freight"] },
          { key: "seller_a_small", ids: ["second_seller"] },
        ])
      `,
    ],
    {
      cwd: fileURLToPath(new URL("../../", import.meta.url)),
      encoding: "utf8",
      timeout: 10_000,
      windowsHide: true,
    },
  )

  assert.ifError(result.error)
  assert.equal(result.status, 0, result.stderr || result.stdout)
})
