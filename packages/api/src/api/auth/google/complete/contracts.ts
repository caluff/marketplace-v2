export type { CompleteGoogleAuthInput } from "./validators";

export type CompleteGoogleAuthResponse =
  | { status: "link_required" }
  | { status: "complete"; token: string };
