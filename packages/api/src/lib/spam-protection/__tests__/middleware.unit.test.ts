import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { protectSubmission } from "../middleware";

function fixture(retryAfter = 0) {
  const consume = jest.fn().mockResolvedValue(retryAfter);
  const req = {
    method: "POST",
    originalUrl: "/auth/customer/emailpass/reset-password?ignored=yes",
    path: "/",
    ip: "198.51.100.5",
    headers: { "x-forwarded-for": "forged", "x-real-ip": "forged" },
    body: { identifier: "mail@example.test" },
    scope: { resolve: jest.fn().mockReturnValue({ consume }) },
  };
  const res = {
    setHeader: jest.fn(),
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  const next = jest.fn();
  const run = () =>
    protectSubmission(
      req as unknown as MedusaRequest,
      res as unknown as MedusaResponse,
      next,
    );
  return { req, res, next, consume, run };
}

describe("spam protection middleware", () => {
  it("passes accepted requests to native validators and workflows", async () => {
    const f = fixture();
    await f.run();
    expect(f.next).toHaveBeenCalledTimes(1);
    expect(f.res.status).not.toHaveBeenCalled();
    expect(f.consume).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          scope: "email-network",
          subject: "198.51.100.5",
        }),
      ]),
    );
    expect(JSON.stringify(f.consume.mock.calls)).not.toContain("forged");
  });

  it("stops before downstream work and gives the actual retry interval", async () => {
    const f = fixture(47);
    await f.run();
    expect(f.next).not.toHaveBeenCalled();
    expect(f.res.status).toHaveBeenCalledWith(429);
    expect(f.res.setHeader).toHaveBeenCalledWith("Retry-After", "47");
    expect(f.res.setHeader).toHaveBeenCalledWith(
      "Cache-Control",
      "private, no-store",
    );
    expect(f.res.json).toHaveBeenCalledWith(
      expect.objectContaining({ code: "too_many_requests" }),
    );
  });

  it("rejects safely on an unavailable counter without leaking private diagnostics", async () => {
    const f = fixture();
    f.consume.mockRejectedValue(new Error("private redis credentials"));
    await f.run();
    expect(f.next).not.toHaveBeenCalled();
    expect(f.res.status).toHaveBeenCalledWith(503);
    expect(f.res.setHeader).toHaveBeenCalledWith("Retry-After", "30");
    expect(JSON.stringify(f.res.json.mock.calls)).not.toContain(
      "private redis credentials",
    );
  });

  it("does not resolve Redis for unrelated requests", async () => {
    const f = fixture();
    f.req.originalUrl = "/health";
    await f.run();
    expect(f.req.scope.resolve).not.toHaveBeenCalled();
    expect(f.next).toHaveBeenCalledTimes(1);
  });

  it("uses the authenticated identity after mounted application middleware", async () => {
    const f = fixture();
    f.req.originalUrl = "/store/vendor-application/verification";
    Object.assign(f.req, {
      auth_context: { auth_identity_id: "auth_verified" },
    });
    await f.run();
    expect(f.consume).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          scope: "verification-identity-hour",
          subject: "auth_verified",
        }),
      ]),
    );
  });
});
