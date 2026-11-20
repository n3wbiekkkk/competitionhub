export default function Loading() {
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6" role="status" aria-label="กำลังโหลดโปรไฟล์">
      <div className="h-16 w-16 animate-pulse rounded-2xl bg-muted" />
      <div className="h-7 w-56 animate-pulse rounded bg-muted" />
      <div className="h-4 w-32 animate-pulse rounded bg-muted" />
      <div className="flex gap-2 border-t border-border pt-6">
        <div className="h-6 w-20 animate-pulse rounded bg-muted" />
        <div className="h-6 w-24 animate-pulse rounded bg-muted" />
      </div>
    </main>
  );
}
