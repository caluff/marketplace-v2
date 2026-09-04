import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework";
import { MedusaError, Modules } from "@medusajs/framework/utils";

import {
  buildAuthEmailUrl,
  getAuthEmailConfiguration,
  isAuthActor,
  requiredAppUrlVariable,
} from "../lib/auth-email";

type PasswordResetEvent = {
  entity_id: string;
  token: string;
  actor_type: string;
};

export default async function authPasswordResetHandler({
  event: { data },
  container,
}: SubscriberArgs<PasswordResetEvent>) {
  const emailConfig = getAuthEmailConfiguration();
  if (!emailConfig.enabled || !isAuthActor(data.actor_type)) return;

  const resetUrl = buildAuthEmailUrl(
    "password-reset",
    data.actor_type,
    data.token,
    data.entity_id,
  );
  if (!resetUrl) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      `[auth-email] ${requiredAppUrlVariable(data.actor_type)} must be a valid public URL`,
    );
  }

  const notificationService = container.resolve(Modules.NOTIFICATION);
  await notificationService.createNotifications({
    to: data.entity_id,
    from: emailConfig.from,
    channel: "email",
    template: "auth-password-reset",
    trigger_type: "auth.password_reset",
    data: { reset_url: resetUrl },
  });
}

export const config: SubscriberConfig = {
  event: "auth.password_reset",
};
