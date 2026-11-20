export default function Loading() {
  return (
    <main className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8" role="status" aria-live="polite" aria-label="กำลังโหลดข้อมูล">
      <span className="sr-only">กำลังโหลดข้อมูล กรุณารอสักครู่</span>
      {/* Header skeleton */}
      <div className="flex flex-col gap-6 border-b border-border pb-7 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-3">
          <div className="h-3 w-36 animate-pulse rounded bg-muted" />
          <div className="h-8 w-72 animate-pulse rounded bg-muted sm:w-96" />
          <div className="h-4 w-80 max-w-full animate-pulse rounded bg-muted" />
        </div>
        <div className="flex items-center gap-4">
          <div className="h-10 w-44 animate-pulse rounded bg-muted" />
          <div className="h-9 w-36 animate-pulse rounded-md bg-muted" />
        </div>
      </div>

      {/* Filter bar skeleton */}
      <div className="space-y-4 border-b border-border pb-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="h-7 w-64 animate-pulse rounded bg-muted" />
          <div className="h-9 w-full animate-pulse rounded-md bg-muted sm:w-80" />
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="h-7 w-20 animate-pulse rounded-md bg-muted" />
          <div className="h-7 w-24 animate-pulse rounded-md bg-muted" />
          <div className="h-7 w-28 animate-pulse rounded-md bg-muted" />
          <div className="h-7 w-24 animate-pulse rounded-md bg-muted" />
        </div>
      </div>

      {/* List rows skeleton */}
      <div className="divide-y divide-border">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className="grid gap-4 py-5 lg:grid-cols-12 lg:items-start"
          >
            <div className="space-y-2.5 lg:col-span-8">
              <div className="h-3 w-44 animate-pulse rounded bg-muted" />
              <div className="h-5 w-3/4 animate-pulse rounded bg-muted" />
              <div className="h-4 w-full max-w-xl animate-pulse rounded bg-muted" />
              <div className="flex gap-1.5 pt-1">
                <div className="h-5 w-20 animate-pulse rounded bg-muted" />
                <div className="h-5 w-16 animate-pulse rounded bg-muted" />
                <div className="h-5 w-14 animate-pulse rounded bg-muted" />
              </div>
            </div>
            <div className="flex flex-col gap-2 lg:col-span-4 lg:items-end">
              <div className="h-4 w-32 animate-pulse rounded bg-muted" />
              <div className="h-3 w-24 animate-pulse rounded bg-muted" />
              <div className="h-7 w-24 animate-pulse rounded-md bg-muted" />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
