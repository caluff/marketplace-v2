import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("admin and vendor share storefront dark surfaces and static accessible grain", async () => {
  const files = [
    new URL("../../web/app/globals.css", import.meta.url),
    new URL("../src/app/globals.css", import.meta.url),
    new URL("../../vendor/src/app/globals.css", import.meta.url),
  ];
  const css = await Promise.all(files.map((file) => readFile(file, "utf8")));
  const surfaces = css.map((source) => {
    const dark = source.match(/\.dark\s*\{([^}]+)\}/)?.[1];
    assert.ok(dark);
    const tokens = ["background", "card", "popover", "noise-opacity"].map(
      (token) => dark.match(new RegExp(`--${token}:\\s*([^;]+);`))?.[1],
    );
    assert.ok(tokens.every(Boolean));
    const grain = source.match(/body::after\s*\{([^}]+)\}/)?.[1];
    assert.ok(grain);
    assert.match(grain, /pointer-events:\s*none/);
    assert.match(source, /@media print,\s*\(forced-colors: active\)/);
    return {
      tokens,
      texture: grain.match(/background-image:\s*([^;]+);/)?.[1],
    };
  });
  assert.deepEqual(surfaces[1], surfaces[0]);
  assert.deepEqual(surfaces[2], surfaces[0]);
});
