import type { ApplicationResponse } from "@marketplace-v2/vendor-onboarding-contracts"

export type ApplicationActionResult = {
  status: "success" | "error" | "conflict"
  message: string
  response?: ApplicationResponse
  fieldErrors?: Record<string, string>
  retryable?: boolean
}

export type Feedback = {
  status: "success" | "error"
  message: string
  retryAfterSeconds?: number
}
