import { Skeleton } from "@/components/ui/skeleton"

// Fallback <Suspense> untuk halaman daftar: bentuknya sama dengan toolbar dan tabel,
// supaya halaman tidak melompat saat data tampil.
export function DataTableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Memuat data">
      <div className="flex gap-2">
        <Skeleton className="h-8 w-full sm:max-w-xs" />
        <Skeleton className="hidden h-8 w-48 sm:block" />
      </div>
      <div className="overflow-hidden rounded-lg border">
        <div className="h-9 border-b bg-muted/60" />
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="flex h-9 items-center gap-4 border-b px-3 last:border-0">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-3.5 flex-1" />
            <Skeleton className="h-3.5 w-20" />
          </div>
        ))}
      </div>
    </div>
  )
}
