import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const css = await readFile(new URL("../theme.css", import.meta.url), "utf8");
const button = await readFile(new URL("./button.tsx", import.meta.url), "utf8");
const focusOpacity =
  Number(
    button.match(/focus-visible:ring-ring(?:\/(\d+))?(?=\s|")/)[1] ?? 100,
  ) / 100;
const declarations = (selector) =>
  Object.fromEntries(
    [
      ...css
        .match(new RegExp(`${selector} \\{([\\s\\S]*?)\\n\\}`))[1]
        .matchAll(/--([\w-]+):\s*([^;]+);/g),
    ].map((match) => [match[1], match[2]]),
  );
const light = declarations(":root");
const themes = { light, dark: { ...light, ...declarations("\\.dark") } };
const clamp = (value) => Math.min(1, Math.max(0, value));
const encode = (value) =>
  clamp(
    value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055,
  );
const decode = (value) =>
  value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;

function color(value, tokens) {
  if (value.startsWith("var("))
    return color(tokens[value.slice(6, -1)], tokens);
  if (/^#[\da-f]{6}$/i.test(value)) {
    return [1, 3, 5]
      .map((offset) => parseInt(value.slice(offset, offset + 2), 16) / 255)
      .concat(1);
  }
  const match = value.match(/^oklch\(([^)]+)\)$/);
  assert.ok(match, `Unsupported contrast-test color: ${value}`);
  const [channels, alpha = "1"] = match[1].split("/");
  const [l, c, h] = channels.trim().split(/\s+/).map(Number);
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const ll = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const mm = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const ss = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    encode(4.0767416621 * ll - 3.3077115913 * mm + 0.2309699292 * ss),
    encode(-1.2684380046 * ll + 2.6097574011 * mm - 0.3413193965 * ss),
    encode(-0.0041960863 * ll - 0.7034186147 * mm + 1.707614701 * ss),
    alpha.includes("%") ? parseFloat(alpha) / 100 : Number(alpha),
  ];
}

const withAlpha = (rgba, alpha) => [...rgba.slice(0, 3), alpha];
const over = (foreground, background) =>
  foreground
    .slice(0, 3)
    .map(
      (value, index) =>
        value * foreground[3] + background[index] * (1 - foreground[3]),
    )
    .concat(1);
const luminance = (rgba) =>
  rgba
    .slice(0, 3)
    .reduce(
      (sum, value, index) =>
        sum + decode(value) * [0.2126, 0.7152, 0.0722][index],
      0,
    );
const contrast = (foreground, background) => {
  const values = [
    luminance(over(foreground, background)),
    luminance(background),
  ].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
};
function minimum(label, foreground, background, threshold = 4.5) {
  const ratio = contrast(foreground, background);
  assert.ok(
    ratio >= threshold,
    `${label}: ${ratio.toFixed(3)}:1 < ${threshold}:1`,
  );
}

test("contrast calculation matches WCAG reference pairs", () => {
  assert.equal(contrast([0, 0, 0, 1], [1, 1, 1, 1]), 21);
  assert.equal(contrast([1, 1, 1, 1], [1, 1, 1, 1]), 1);
  assert.ok(
    Math.abs(contrast(color("#767676", {}), [1, 1, 1, 1]) - 4.542) < 0.001,
  );
});

for (const [theme, tokens] of Object.entries(themes)) {
  const token = (name) => color(tokens[name], tokens);
  test(`${theme}: normal text, links, field boundaries and focus on application surfaces`, () => {
    for (const surface of ["background", "card", "popover", "muted"]) {
      const background = token(surface);
      for (const text of [
        "foreground",
        "muted-foreground",
        "brand-accent-text",
        "destructive",
      ]) {
        minimum(`${text} on ${surface}`, token(text), background);
      }
      for (const control of ["input", "ring"]) {
        minimum(`${control} on ${surface}`, token(control), background, 3);
      }
      minimum(
        `button focus on ${surface}`,
        withAlpha(token("ring"), focusOpacity),
        background,
        3,
      );
    }
  });

  test(`${theme}: solid buttons retain readable labels at rest and on hover`, () => {
    const accentHover =
      Number(button.match(/hover:bg-brand-accent\/(\d+)/)[1]) / 100;
    for (const surface of ["background", "card"]) {
      for (const [fill, text, hover] of [
        ["primary", "primary-foreground", 0.9],
        ["brand-accent", "brand-accent-foreground", accentHover],
        ["destructive", "destructive-foreground", 0.9],
      ]) {
        minimum(`${fill} button`, token(text), token(fill));
        minimum(
          `${fill} hover on ${surface}`,
          token(text),
          over(withAlpha(token(fill), hover), token(surface)),
        );
      }
    }
  });

  test(`${theme}: status badges, selected options and demonstration messages`, () => {
    for (const surface of ["background", "card", "muted"]) {
      for (const [fill, text, alpha] of [
        ["success", "success-foreground", 0.1],
        ["warning", "warning-foreground", 0.12],
        ["destructive", "destructive", 0.1],
        ["brand-accent", "brand-accent-text", 0.1],
        ["demo", "demo-foreground", 0.18],
      ]) {
        minimum(
          `${text} on ${fill}/${alpha} on ${surface}`,
          token(text),
          over(withAlpha(token(fill), alpha), token(surface)),
        );
      }
    }
  });

  test(`${theme}: sidebar text, selected icons and focus use its permanent dark surface`, () => {
    for (const surface of ["sidebar", "sidebar-accent"]) {
      for (const text of [
        "sidebar-foreground",
        "sidebar-muted",
        "sidebar-primary-text",
      ]) {
        minimum(`${text} on ${surface}`, token(text), token(surface));
      }
      minimum(
        `sidebar focus on ${surface}`,
        token("sidebar-ring"),
        token(surface),
        3,
      );
    }
  });
}
