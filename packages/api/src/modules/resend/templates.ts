import { z } from "@medusajs/framework/zod";
import { MedusaError } from "@medusajs/framework/utils";

const actionUrl = z.url().refine((value) => {
  const url = new URL(value);
  return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password;
}, "Action URL must use HTTP or HTTPS without credentials");
const verificationSchema = z.object({
  verification_url: actionUrl,
  expires_at: z.union([z.string().datetime({ offset: true }), z.date()]),
});
const resetSchema = z.object({ reset_url: actionUrl });
const applicationSchema = z.object({
  application_id: z.string().trim().min(1),
  status: z.enum(["submitted", "changes_requested", "approved", "rejected"]),
  reason: z.string().nullable().optional(),
});

const APPLICATION_MESSAGES = {
  submitted: { subject: "Marketplace V2: recibimos tu solicitud", message: "Recibimos tu solicitud para vender en Marketplace V2. Te avisaremos por correo cuando cambie su estado. Podés consultar el avance en la sección para vender de tu cuenta." },
  changes_requested: { subject: "Marketplace V2: tu solicitud necesita cambios", message: "Revisá los comentarios y actualizá tu solicitud desde la sección para vender de tu cuenta de Marketplace V2 antes de volver a enviarla." },
  approved: { subject: "Marketplace V2: tu solicitud fue aprobada", message: "Tu solicitud para vender en Marketplace V2 fue aprobada. Ya podés ingresar al portal de vendedores con tu cuenta." },
  rejected: { subject: "Marketplace V2: novedades sobre tu solicitud", message: "Tu solicitud para vender en Marketplace V2 no fue aprobada. Podés consultar el estado y los comentarios en la sección para vender de tu cuenta." },
} as const;

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
}

function render(subject: string, paragraphs: string[], action?: { label: string; url: string }) {
  const content = paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\r?\n/g, "<br>")}</p>`).join("");
  return {
    subject,
    html: `<!doctype html><html lang="es"><body><h1>${escapeHtml(subject)}</h1>${content}${action ? `<p><a href="${escapeHtml(action.url)}">${escapeHtml(action.label)}</a></p>` : ""}</body></html>`,
    text: [subject, ...paragraphs, ...(action ? [`${action.label}: ${action.url}`] : [])].join("\n\n"),
  };
}

export function renderNotification(template: string, data: Record<string, unknown> | null | undefined) {
  switch (template) {
    case "auth-email-verification": {
      const input = verificationSchema.parse(data);
      return render("Marketplace V2: verificá tu correo", [
        "Confirmá tu dirección de correo para continuar en Marketplace V2.",
        `Este enlace vence el ${new Date(input.expires_at).toISOString()} (UTC).`,
        "Si no solicitaste esta verificación, podés ignorar este correo.",
      ], { label: "Verificar correo", url: input.verification_url });
    }
    case "auth-password-reset": {
      const input = resetSchema.parse(data);
      return render("Marketplace V2: restablecé tu contraseña", [
        "Usá el enlace para elegir una nueva contraseña para tu cuenta de Marketplace V2.",
        "Si no solicitaste este cambio, podés ignorar este correo. Tu contraseña seguirá siendo la misma.",
      ], { label: "Restablecer contraseña", url: input.reset_url });
    }
    case "vendor-application-submitted":
    case "vendor-application-changes_requested":
    case "vendor-application-approved":
    case "vendor-application-rejected": {
      const input = applicationSchema.parse(data);
      if (template !== `vendor-application-${input.status}`) throw new MedusaError(MedusaError.Types.INVALID_DATA, "Notification template does not match application status");
      const message = APPLICATION_MESSAGES[input.status];
      return render(message.subject, [message.message, `Solicitud: ${input.application_id}`, ...(input.reason ? [`Comentarios: ${input.reason}`] : [])]);
    }
    default:
      throw new MedusaError(MedusaError.Types.INVALID_DATA, "Unsupported email notification template");
  }
}
