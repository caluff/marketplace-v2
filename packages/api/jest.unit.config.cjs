module.exports = {
  transform: {
    "^.+\\.[jt]s$": [
      "@swc/jest",
      { jsc: { parser: { syntax: "typescript", decorators: true } } },
    ],
  },
  testEnvironment: "node",
  moduleFileExtensions: ["js", "ts", "json"],
  modulePathIgnorePatterns: ["<rootDir>/.medusa/"],
  testPathIgnorePatterns: ["/node_modules/", "[/\\\\]\\.medusa[/\\\\]"],
  testMatch: ["**/src/**/__tests__/**/*.unit.test.ts"],
};
