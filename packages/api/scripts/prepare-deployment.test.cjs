const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { prepareDeployment } = require("./prepare-deployment.cjs");

function fixture(context) {
  const workspaceRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "marketplace-deployment-"),
  );
  context.after(() =>
    fs.rmSync(workspaceRoot, { recursive: true, force: true }),
  );
  const deploymentRoot = path.join(
    workspaceRoot,
    "packages/api/.medusa/server",
  );
  fs.mkdirSync(deploymentRoot, { recursive: true });
  fs.mkdirSync(path.join(workspaceRoot, "patches"));
  fs.writeFileSync(
    path.join(workspaceRoot, "package.json"),
    JSON.stringify({ packageManager: "pnpm@12.0.0" }),
  );
  fs.writeFileSync(
    path.join(deploymentRoot, "package.json"),
    JSON.stringify({ name: "api", dependencies: { core: "1.0.0" } }),
  );
  return { workspaceRoot, deploymentRoot };
}

test("standalone deployment keeps every patch and root resolution policy without a second source lockfile", (context) => {
  const { workspaceRoot, deploymentRoot } = fixture(context);
  const patchedDependencies = {};
  for (const name of ["framework", "core", "payout"]) {
    const file = path.join(workspaceRoot, "patches", `${name}.patch`);
    fs.writeFileSync(file, `verified ${name} patch\n`);
    patchedDependencies[`${name}@1.0.0`] = file;
  }
  const rootSettings = {
    patchedDependencies,
    overrides: { vite: "5.4.21" },
    packageExtensions: { core: { peerDependencies: { react: "*" } } },
    allowBuilds: { esbuild: true },
    minimumReleaseAgeExclude: ["core@1.0.0"],
  };
  const result = prepareDeployment({
    workspaceRoot,
    deploymentRoot,
    readSetting: (key) => rootSettings[key],
  });
  assert.deepEqual(result.packages, ["."]);
  for (const key of [
    "overrides",
    "packageExtensions",
    "allowBuilds",
    "minimumReleaseAgeExclude",
  ])
    assert.deepEqual(result[key], rootSettings[key]);
  for (const [dependency, destination] of Object.entries(
    result.patchedDependencies,
  )) {
    assert.equal(path.isAbsolute(destination), false);
    assert.equal(
      fs.readFileSync(path.join(deploymentRoot, destination), "utf8"),
      fs.readFileSync(patchedDependencies[dependency], "utf8"),
    );
  }
  assert.deepEqual(
    JSON.parse(
      fs.readFileSync(path.join(deploymentRoot, "pnpm-workspace.yaml"), "utf8"),
    ),
    result,
  );
  assert.equal(
    JSON.parse(
      fs.readFileSync(path.join(deploymentRoot, "package.json"), "utf8"),
    ).packageManager,
    "pnpm@12.0.0",
  );
  assert.equal(
    fs.existsSync(path.join(deploymentRoot, "pnpm-lock.yaml")),
    false,
  );
});

test("deployment fails closed when patch configuration is lost", (context) => {
  const roots = fixture(context);
  assert.throws(
    () => prepareDeployment({ ...roots, readSetting: () => null }),
    /requires the workspace dependency patches/,
  );
  assert.equal(
    fs.existsSync(path.join(roots.deploymentRoot, "pnpm-workspace.yaml")),
    false,
  );
});

test("missing patch files stop deployment before a partial configuration is written", (context) => {
  const roots = fixture(context);
  assert.throws(
    () =>
      prepareDeployment({
        ...roots,
        readSetting: (key) =>
          key === "patchedDependencies"
            ? { "core@1.0.0": "patches/missing.patch" }
            : null,
      }),
    /ENOENT/,
  );
  assert.equal(
    fs.existsSync(path.join(roots.deploymentRoot, "pnpm-workspace.yaml")),
    false,
  );
});
