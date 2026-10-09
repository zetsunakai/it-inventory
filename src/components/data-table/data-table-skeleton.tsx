import { Skeleton } from "@/components/ui/skeleton"

// Fallback <Suspense> untuk halaman daftar selama data dimuat.
export function DataTableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Memuat data">
      <Skeleton className="h-8 w-full sm:max-w-xs" />
      <div className="space-y-2 rounded-lg border p-4">
        {Array.from({ length: rows }, (_, index) => (
          <Skeleton key={index} className="h-6 w-full" />
        ))}
      </div>
    </div>
  )
}
