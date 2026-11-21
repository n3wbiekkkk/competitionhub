import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <main
      className="mx-auto w-full max-w-[1680px] space-y-8 px-4 py-6 sm:px-6 lg:px-8 lg:py-8 xl:px-10"
      role="status"
      aria-live="polite"
      aria-label="กำลังโหลดข้อมูล"
    >
      <span className="sr-only">กำลังโหลดข้อมูล กรุณารอสักครู่</span>
      <div className="flex flex-col gap-6 border-b border-border/60 pb-7 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3">
          <Skeleton className="h-3 w-36" />
          <Skeleton className="h-9 w-72 sm:w-96" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-44 rounded-xl" />
          <Skeleton className="h-10 w-36 rounded-xl" />
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[18rem_minmax(0,1fr)]">
        <div className="surface-subtle hidden h-96 rounded-2xl p-5 xl:block">
          <div className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-4 w-24" />
            {Array.from({ length: 8 }, (_, index) => (
              <Skeleton key={index} className="h-8 w-full rounded-lg" />
            ))}
          </div>
        </div>
        <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <div
              key={index}
              className="surface-elevated flex min-h-64 flex-col justify-between gap-5 rounded-2xl p-6"
            >
              <div className="space-y-3">
                <div className="flex gap-2">
                  <Skeleton className="h-6 w-24 rounded-full" />
                  <Skeleton className="h-6 w-20 rounded-full" />
                </div>
                <Skeleton className="h-6 w-5/6" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-4/5" />
              </div>
              <div className="space-y-3 border-t border-border/60 pt-4">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-9 w-full rounded-xl" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
