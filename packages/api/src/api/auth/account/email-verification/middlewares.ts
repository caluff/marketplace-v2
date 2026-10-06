import { authenticate, type MiddlewareRoute, validateAndTransformBody } from "@medusajs/framework/http";
import { ConfirmAccountEmailVerification, RequestAccountEmailVerification } from "./validators";

export const accountEmailVerificationMiddlewares: MiddlewareRoute[] = [{
  matcher: "/auth/account/email-verification",
  method: "GET",
  middlewares: [authenticate(["user", "member"], ["session", "bearer"])],
}, {
  matcher: "/auth/account/email-verification/request",
  method: "POST",
  middlewares: [authenticate(["user", "member"], ["session", "bearer"]), validateAndTransformBody(RequestAccountEmailVerification)],
}, {
  matcher: "/auth/account/email-verification/confirm",
  method: "POST",
  middlewares: [authenticate(["user", "member"], ["session", "bearer"]), validateAndTransformBody(ConfirmAccountEmailVerification)],
}];
