import { PaymentReturn } from "@/features/checkout/components/payment-return"

export default function CheckoutReturnPage() {
  return (
    <>
      <h1 className="text-3xl font-medium tracking-tight sm:text-5xl">
        Estado de tu compra
      </h1>
      <PaymentReturn />
    </>
  )
}
