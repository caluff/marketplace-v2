import { FetchError } from "@medusajs/js-sdk"
import { redirect } from "next/navigation"
import { cache } from "react"

import { createCustomerSdk, getCustomerSessionToken } from "@/lib/auth-sdk"

export const getAccount = cache(async () => {
  const token = await getCustomerSessionToken()
  if (!token) redirect("/login?next=%2Faccount")
  const sdk = createCustomerSdk(token)
  if (!sdk) throw new Error("El servicio de cuenta no está disponible.")
  try {
    const { customer } = await sdk.store.customer.retrieve()
    return { customer, sdk }
  } catch (error) {
    if (error instanceof FetchError && error.status === 401) {
      redirect("/login?reason=expired&next=%2Faccount")
    }
    throw new Error("No pudimos cargar tu cuenta. Vuelve a intentarlo.")
  }
})

export function getPageNumber(value: string | string[] | undefined): number {
  const page = Number(Array.isArray(value) ? value[0] : value)
  return Number.isSafeInteger(page) && page > 0 ? Math.min(page, 10000) : 1
}

export const ACCOUNT_PAGE_SIZE = 12
