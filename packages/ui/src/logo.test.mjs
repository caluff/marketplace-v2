import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BRAND_COLORS, Logo, LogoMark, LogoWordmark } from "./logo.tsx";

const root = new URL("../../../", import.meta.url);
const webRequire = createRequire(new URL("apps/web/package.json", root));
const sharp = createRequire(webRequire.resolve("next/package.json"))("sharp");
const readAsset = (path) => readFile(new URL(path, root));
const render = (Component, props) =>
  renderToStaticMarkup(createElement(Component, props));

test("standalone logos have an accessible name, and decorative logos do not duplicate a link's name", () => {
  const standalone = render(Logo, { "aria-label": "USAPEEK, tienda" });
  assert.match(standalone, /role="img"/);
  assert.match(standalone, /aria-label="USAPEEK, tienda"/);
  assert.match(standalone, /<title>USAPEEK, tienda<\/title>/);

  for (const value of [true, "true"]) {
    const decorative = render(LogoMark, { "aria-hidden": value });
    assert.match(decorative, /aria-hidden="true"/);
    assert.doesNotMatch(decorative, /<title|aria-label|role="img"/);
  }
});

test("numeric widths keep each variant's aspect ratio and explicit dimensions take precedence", () => {
  assert.match(render(Logo, { width: 252 }), /width="252" height="130"/);
  assert.match(render(LogoMark, { size: 116 }), /width="116" height="76"/);
  assert.match(render(LogoWordmark, { width: 252 }), /width="252" height="36"/);
  assert.match(
    render(LogoMark, { width: 48, height: 32, size: 100 }),
    /width="48" height="32"/,
  );
});

test("light and dark variants change only the navy ink and keep every background transparent", async () => {
  for (const variant of ["full", "mark", "wordmark"]) {
    const light = render(Logo, { variant, tone: "light" });
    const dark = render(Logo, { variant, tone: "dark" });
    assert.equal(
      dark,
      light
        .replaceAll('data-tone="light"', 'data-tone="dark"')
        .replaceAll(BRAND_COLORS.navy, BRAND_COLORS.surface),
    );
    assert.match(dark, /#7c3aed/);
    assert.doesNotMatch(light + dark, /<rect\b|background/);
    for (const suffix of ["", "-dark"]) {
      const svg = await readAsset(
        `apps/web/public/branding/logo-${variant}${suffix}.svg`,
      );
      const { data } = await sharp(svg)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      assert.equal(data.at(-1), 0, "SVG canvas must be transparent");
    }
  }
  const favicon = (await readAsset("apps/web/public/favicon.svg")).toString();
  assert.doesNotMatch(favicon, /<rect\b|background/);
  assert.match(favicon, /prefers-color-scheme:dark/);
});

test("production SVGs remain vector-only and preserve the original palette and transparent outline", async () => {
  const svg = (
    await readAsset("apps/web/public/branding/logo-full.svg")
  ).toString();
  assert.doesNotMatch(
    svg,
    /<(?:image|text|script|foreignObject)\b|data:image|<rect\b/,
  );
  assert.match(svg, /<g fill="none" stroke="#0b2135" stroke-width="8">/);
  assert.match(svg, /<path fill="#7c3aed" d="m330 134 30-54 30 54Z"/);
  assert.equal(BRAND_COLORS.accent, "#7c3aed");
  const theme = (await readAsset("packages/ui/theme.css")).toString();
  assert.ok(theme.includes(`--brand-navy: ${BRAND_COLORS.navy};`));
  assert.ok(theme.includes(`--brand-accent: ${BRAND_COLORS.accent};`));
});

test("all deployable applications ship the same generated brand geometry and icons", async () => {
  for (const [app, appDir] of [
    ["admin", "src/app"],
    ["vendor", "src/app"],
  ]) {
    for (const variant of [
      "full",
      "mark",
      "wordmark",
      "full-dark",
      "mark-dark",
      "wordmark-dark",
    ]) {
      assert.deepEqual(
        await readAsset(`apps/${app}/public/branding/logo-${variant}.svg`),
        await readAsset(`apps/web/public/branding/logo-${variant}.svg`),
      );
    }
    for (const asset of ["icon.svg", "favicon.ico", "apple-icon.png"]) {
      assert.deepEqual(
        await readAsset(`apps/${app}/${appDir}/${asset}`),
        await readAsset(`apps/web/app/${asset}`),
      );
    }
  }
});

test("ICO entries decode at 16, 32 and 48 pixels and retain both navy and purple", async () => {
  const ico = await readAsset("apps/web/app/favicon.ico");
  assert.equal(ico.readUInt16LE(2), 1);
  assert.equal(ico.readUInt16LE(4), 3);
  for (const [index, size] of [16, 32, 48].entries()) {
    const entry = 6 + index * 16;
    assert.equal(ico[entry], size);
    assert.equal(ico[entry + 1], size);
    const offset = ico.readUInt32LE(entry + 12);
    const length = ico.readUInt32LE(entry + 8);
    const png = ico.subarray(offset, offset + length);
    const metadata = await sharp(png).metadata();
    assert.equal(metadata.width, size);
    assert.equal(metadata.height, size);
    assert.equal(metadata.hasAlpha, true);
    const { data } = await sharp(png)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let navy = 0;
    let purple = 0;
    assert.equal(data[3], 0, "ICO canvas must remain transparent");
    for (let pixel = 0; pixel < data.length; pixel += 4) {
      if (data[pixel + 3] < 128) continue;
      if (data[pixel] < 60 && data[pixel + 1] < 85 && data[pixel + 2] < 110)
        navy++;
      if (
        data[pixel] > 80 &&
        data[pixel] < 190 &&
        data[pixel + 1] < 140 &&
        data[pixel + 2] > 170
      )
        purple++;
    }
    assert.ok(navy > size, `navy silhouette missing at ${size}px`);
    assert.ok(purple > size / 2, `cart accent missing at ${size}px`);
  }
});

test("social previews decode as opaque 1200x630 PNGs and stay identical across applications", async () => {
  const preview = await readAsset("apps/web/app/opengraph-image.png");
  const metadata = await sharp(preview).metadata();
  assert.equal(metadata.format, "png");
  assert.equal(metadata.width, 1200);
  assert.equal(metadata.height, 630);
  assert.ok(preview.length < 5 * 1024 * 1024, "social card exceeds Twitter's size limit");

  const { data } = await sharp(preview).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let white = 0;
  let purple = 0;
  for (let pixel = 0; pixel < data.length; pixel += 4) {
    assert.equal(data[pixel + 3], 255, "social preview must have an opaque backdrop");
    if (data[pixel] === 255 && data[pixel + 1] === 255 && data[pixel + 2] === 255) white++;
    if (data[pixel] === 124 && data[pixel + 1] === 58 && data[pixel + 2] === 237) purple++;
  }
  assert.ok(white > 10000, "white brand silhouette missing");
  assert.ok(purple > 1000, "violet brand accent missing");
  assert.deepEqual([...data.subarray(0, 4)], [11, 33, 53, 255]);

  const alt = await readAsset("apps/web/app/opengraph-image.alt.txt");
  assert.match(alt.toString(), /USAPEEK/);
  for (const app of ["admin", "vendor"]) {
    assert.deepEqual(await readAsset(`apps/${app}/src/app/opengraph-image.png`), preview);
    assert.deepEqual(await readAsset(`apps/${app}/src/app/opengraph-image.alt.txt`), alt);
  }
});

test("Apple and manifest icons have the advertised dimensions; maskable artwork stays inside its safe circle", async () => {
  for (const [path, size] of [
    ["apps/web/app/apple-icon.png", 180],
    ["apps/web/public/branding/icon-192.png", 192],
    ["apps/web/public/branding/icon-512.png", 512],
    ["apps/web/public/branding/icon-maskable-512.png", 512],
  ]) {
    const input = await readAsset(path);
    const metadata = await sharp(input).metadata();
    assert.equal(metadata.width, size);
    assert.equal(metadata.height, size);
    assert.equal(metadata.hasAlpha, true);
    const { data: rgba } = await sharp(input)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    assert.equal(rgba[3], 0, "the icon canvas must remain transparent");
    if (!path.includes("maskable")) continue;
    const { data } = await sharp(input)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (Math.hypot(x - size / 2, y - size / 2) <= size * 0.4) continue;
        const pixel = (y * size + x) * 4;
        assert.ok(
          data[pixel + 3] === 0,
          "artwork outside the maskable safe circle",
        );
      }
    }
  }
});
