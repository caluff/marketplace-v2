import { Card } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Cargando catálogo">
      <div className="border-b border-border">
        <div className="mx-auto flex min-h-16 w-full max-w-[90rem] items-center justify-between px-4 sm:px-6 lg:px-10">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-11 w-24" />
        </div>
      </div>

      <div className="border-b border-border">
        <div className="mx-auto grid min-h-[34rem] w-full max-w-[90rem] items-end gap-10 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[minmax(0,1fr)_19rem] lg:px-10 lg:py-24">
          <div className="space-y-5">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-20 w-full max-w-4xl sm:h-40" />
          </div>
          <div className="space-y-4">
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-4/5" />
            <Skeleton className="h-12 w-44" />
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[90rem] px-4 py-14 sm:px-6 sm:py-20 lg:px-10 lg:py-24">
        <div className="mb-10 flex items-end justify-between border-b border-foreground pb-6">
          <div className="space-y-3">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-12 w-64" />
          </div>
          <Skeleton className="hidden h-4 w-28 sm:block" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, index) => (
            <Card key={index} className="gap-0 overflow-hidden">
              <Skeleton className="aspect-[4/5] w-full" />
              <div className="space-y-3 p-4 sm:p-5">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-7 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
