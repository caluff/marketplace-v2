import { submissionNetwork } from "../network";

describe("submission network behind Railway ingress", () => {
  const environment = process.env;
  beforeEach(() => {
    process.env = {
      ...environment,
      NODE_ENV: "production",
      RAILWAY_SERVICE_ID: "service",
      RAILWAY_ENVIRONMENT_ID: "environment",
    };
  });
  afterEach(() => {
    process.env = environment;
  });

  function request() {
    return {
      ip: "10.0.0.5",
      headers: {
        "x-real-ip": "198.51.100.5",
        "x-forwarded-for": "forged",
        "x-forwarded-proto": "https",
        "x-railway-edge": "edge",
        "x-railway-request-id": "request",
      } as Record<string, string | string[]>,
      rawHeaders: ["X-Real-IP", "198.51.100.5"],
    };
  }

  it("keeps the client budget stable across Railway internal proxies", () => {
    const req = request();
    expect(submissionNetwork(req)).toBe("198.51.100.5");
    req.ip = "10.0.0.6";
    expect(submissionNetwork(req)).toBe("198.51.100.5");
    req.headers["x-real-ip"] = "2001:db8::1";
    expect(submissionNetwork(req)).toBe("2001:db8::1");
  });

  it.each(["NODE_ENV", "RAILWAY_SERVICE_ID", "RAILWAY_ENVIRONMENT_ID"])(
    "ignores forwarding headers outside the Railway production runtime (%s)",
    (key) => {
      delete process.env[key];
      expect(submissionNetwork(request())).toBe("10.0.0.5");
    },
  );

  it.each(["x-forwarded-proto", "x-railway-edge", "x-railway-request-id"])(
    "requires Railway HTTPS ingress markers (%s)",
    (key) => {
      const req = request();
      delete req.headers[key];
      expect(submissionNetwork(req)).toBe("10.0.0.5");
    },
  );

  it.each([
    { header: "invalid" },
    { header: "198.51.100.5, 198.51.100.6" },
    { header: "198.51.100.5:443" },
    { header: ["198.51.100.5"] },
  ])("rejects invalid or ambiguous client IP headers: $header", ({ header }) => {
    const req = request();
    req.headers["x-real-ip"] = header;
    expect(submissionNetwork(req)).toBe("10.0.0.5");
  });

  it("rejects duplicate raw headers even if the HTTP parser selects one", () => {
    const req = request();
    req.rawHeaders.push("x-real-ip", "198.51.100.6");
    expect(submissionNetwork(req)).toBe("10.0.0.5");
  });
});
