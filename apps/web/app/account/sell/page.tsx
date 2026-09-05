import type { Metadata } from "next"
import { Suspense } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { FeedbackToast } from "@/components/feedback-toast"
import { AccountHeading } from "@/features/account/components/account-heading"
import { ApplicationHistory } from "@/features/vendor-onboarding/components/application-history"
import { ApplicationStatus } from "@/features/vendor-onboarding/components/application-status"
import { ApplicationWizard } from "@/features/vendor-onboarding/components/application-wizard"
import {
  getApplication,
  getApplicationFormData,
  getApplicationNotifications,
} from "@/features/vendor-onboarding/data"
import { vendorLoginUrl } from "@/features/vendor-onboarding/presentation"
import { getVerificationCode } from "@/lib/auth-sdk"

export const metadata: Metadata = {
  title: "Vender en Marketplace V2",
  robots: { index: false, follow: false },
}

export default async function SellPage({
  searchParams,
}: {
  searchParams: Promise<{ offset?: string }>
}) {
  const params = await searchParams
  const requestedOffset = Number(params.offset)
  const offset =
    Number.isSafeInteger(requestedOffset) && requestedOffset > 0
      ? Math.min(requestedOffset, 100000)
      : 0
  const response = await getApplication()
  const editable =
    !response.applicant.existing_vendor_access &&
    (!response.application || response.application.can_edit)
  const [form, verificationCode] = await Promise.all([
    editable ? getApplicationFormData() : null,
    editable ? getVerificationCode() : null,
  ])
  return (
    <div className="max-w-4xl">
      <AccountHeading
        title="Vender en Marketplace V2"
        description="Un nuevo espacio para tu negocio, con la cuenta que ya tienes."
      />
      {form ? (
        <ApplicationWizard
          key={response.application?.id ?? "new"}
          response={response}
          customer={form.customer}
          addresses={form.addresses}
          options={form.options}
          categories={form.categories}
          hasCode={Boolean(verificationCode)}
        />
      ) : (
        <ApplicationStatus
          response={response}
          vendorUrl={vendorLoginUrl(process.env.NEXT_PUBLIC_VENDOR_URL)}
        />
      )}
      <Suspense
        key={offset}
        fallback={
          <div
            role="status"
            className="mt-10 space-y-4 border-t border-border pt-8"
          >
            <p className="text-sm text-muted-foreground">Cargando novedades…</p>
            <Skeleton className="h-20 w-full" />
          </div>
        }
      >
        <ApplicationHistorySection offset={offset} />
      </Suspense>
    </div>
  )
}

async function ApplicationHistorySection({ offset }: { offset: number }) {
  const history = await getApplicationNotifications(offset).catch(() => null)
  if (history) return <ApplicationHistory data={history} />
  return (
    <>
      <FeedbackToast
        feedback={{
          status: "error",
          message:
            "No pudimos cargar las novedades de tu solicitud. Recarga la página para volver a intentarlo.",
        }}
      />
      <p role="status" className="mt-8 border border-border p-4 text-sm">
        No pudimos cargar las novedades de tu solicitud. Recarga la página para
        volver a intentarlo.
      </p>
    </>
  )
}
