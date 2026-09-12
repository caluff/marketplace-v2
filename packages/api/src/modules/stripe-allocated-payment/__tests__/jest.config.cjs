// Keep provider unit verification independent of the application .env loader.
module.exports = {
  rootDir: "../../../..",
  transform: {
    "^.+\\.[jt]s$": [
      "@swc/jest",
      { jsc: { parser: { syntax: "typescript", decorators: true } } },
    ],
  },
  testEnvironment: "node",
  modulePathIgnorePatterns: ["<rootDir>/.medusa/"],
  testMatch: ["**/modules/stripe-allocated-payment/__tests__/*.unit.spec.ts"],
};
