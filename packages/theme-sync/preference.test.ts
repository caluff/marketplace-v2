import assert from "node:assert/strict";
import test from "node:test";
import {
  createThemeSyncController,
  readThemeCookie,
  serializeThemeCookie,
  themeCookieDomain,
  type ThemePreference,
} from "./preference";

test("only valid theme preferences are accepted from the shared cookie", () => {
  assert.equal(
    readThemeCookie("session=private; marketplace-v2-theme=dark"),
    "dark",
  );
  assert.equal(
    readThemeCookie("marketplace-v2-theme=system; other=x"),
    "system",
  );
  assert.equal(readThemeCookie("marketplace-v2-theme=light"), "light");
  assert.equal(readThemeCookie("marketplace-v2-theme=garbage"), undefined);
  assert.equal(readThemeCookie("other-marketplace-v2-theme=dark"), undefined);
});

test("localhost ports share a host-only cookie, preview apps use orca.localhost", () => {
  assert.equal(themeCookieDomain("localhost"), undefined);
  assert.equal(
    themeCookieDomain("marketplace-v2.orca.localhost"),
    "orca.localhost",
  );
  assert.equal(
    themeCookieDomain("marketplace-v2-3.orca.localhost"),
    "orca.localhost",
  );
  assert.equal(themeCookieDomain("notorca.localhost"), undefined);
  assert.equal(themeCookieDomain("orca.localhost.evil.example"), undefined);
});

test("production only shares a validated explicitly configured ancestor domain", () => {
  assert.equal(themeCookieDomain("admin.shop.example.com"), undefined);
  assert.equal(
    themeCookieDomain("admin.shop.example.com", ".shop.example.com"),
    "shop.example.com",
  );
  assert.equal(
    themeCookieDomain("shop.example.com", "shop.example.com"),
    "shop.example.com",
  );
  assert.equal(themeCookieDomain("notexample.com", "example.com"), undefined);
  assert.equal(
    themeCookieDomain("admin.example.com", "other.example.com"),
    undefined,
  );
  assert.equal(
    themeCookieDomain("admin.example.com", "https://example.com"),
    undefined,
  );
  assert.equal(
    themeCookieDomain("admin.example.com", "example.com; Secure"),
    undefined,
  );
  assert.equal(themeCookieDomain("admin.example.com", "com"), undefined);
});

test("cookie is non-sensitive, site-wide, bounded and secure over HTTPS", () => {
  assert.equal(
    serializeThemeCookie("light", "localhost", "http:"),
    "marketplace-v2-theme=light; Path=/; Max-Age=31536000; SameSite=Lax",
  );
  assert.equal(
    serializeThemeCookie("dark", "admin.example.com", "https:", "example.com"),
    "marketplace-v2-theme=dark; Path=/; Max-Age=31536000; SameSite=Lax; Domain=example.com; Secure",
  );
});

function harness(shared?: ThemePreference) {
  const writes: ThemePreference[] = [];
  const applied: ThemePreference[] = [];
  const controller = createThemeSyncController({
    read: () => shared,
    write: (theme) => {
      writes.push(theme);
      shared = theme;
    },
    apply: (theme) => applied.push(theme),
  });
  return {
    controller,
    writes,
    applied,
    setShared: (theme: ThemePreference) => {
      shared = theme;
    },
  };
}

test("a stale mounting origin adopts the shared preference without overwriting it", () => {
  const { controller, writes, applied } = harness("dark");
  controller.observe(undefined);
  controller.observe("light");
  controller.observe("light");
  assert.deepEqual(applied, ["dark"]);
  assert.deepEqual(writes, []);
  controller.observe("dark");
  assert.deepEqual(writes, []);
});

test("initial local preference seeds an absent cookie once, including system", () => {
  const { controller, writes } = harness();
  controller.observe("system");
  controller.observe("system");
  assert.deepEqual(writes, ["system"]);
});

test("user theme changes publish, incoming cookie changes do not echo", () => {
  const { controller, writes, applied, setShared } = harness("dark");
  controller.observe("dark");
  controller.observe("light");
  assert.deepEqual(writes, ["light"]);
  setShared("system");
  controller.synchronize();
  controller.synchronize();
  assert.deepEqual(applied, ["system"]);
  controller.observe("system");
  assert.deepEqual(writes, ["light"]);
  controller.observe("dark");
  assert.deepEqual(writes, ["light", "dark"]);
});

test("latest external choice wins while a previous external update is pending", () => {
  const { controller, applied, writes, setShared } = harness("light");
  controller.observe("light");
  setShared("dark");
  controller.synchronize();
  setShared("system");
  controller.synchronize();
  controller.observe("system");
  assert.deepEqual(applied, ["dark", "system"]);
  assert.deepEqual(writes, []);
});
