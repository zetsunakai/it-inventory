import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { z } from "zod"

import { CountActions } from "@/components/inventory/count-actions"
import { CountReview } from "@/components/inventory/count-review"
import { CountSheet } from "@/components/inventory/count-sheet"
import { CountStatusBadge } from "@/components/inventory/count-status"
import { PageHeader } from "@/components/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { formatDateTime, formatNumber } from "@/lib/format"
import { hasPermission } from "@/lib/permissions"
import { requirePermission } from "@/server/auth/session"
import { getStockCount } from "@/server/queries/stock-counts"
import { listInternalLocations } from "@/server/queries/transfers"

export const metadata: Metadata = { title: "Sesi opname · IT Inventory" }

export default function StockCountPage({ params }: PageProps<"/inventory/opname/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-[28rem] w-full max-w-3xl" />}>
      <StockCountDetail params={params} />
    </Suspense>
  )
}

async function StockCountDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("inventory:read")
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  const count = await getStockCount(user.id, id)
  if (!count) notFound()

  const canCount = hasPermission(user.roles, "inventory:write") && count.status === "counting"
  const canApprove = hasPermission(user.roles, "inventory:approve")
  const counted = count.lines.filter((line) => line.countedQty !== null).length
  const differing = count.lines.filter(
    (line) =>
      line.systemQty !== null &&
      line.countedQty !== null &&
      Number(line.systemQty) !== Number(line.countedQty),
  ).length
  // Lokasi dalam lingkup sesi untuk barang temuan.
  const scope = canCount
    ? (await listInternalLocations(user.id)).filter(
        (location) =>
          location.warehouseId === count.warehouseId &&
          (!count.locationPath ||
            location.path === count.locationPath ||
            location.path.startsWith(`${count.locationPath}/`)),
      )
    : []

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Stock opname ${count.number}`}
        description={
          <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
            <CountStatusBadge status={count.status} />
            <span>
              {count.warehouseCode} · {count.locationPath ?? "seluruh gudang"}
            </span>
            <span>Cut-off {formatDateTime(count.cutOffAt)}</span>
          </span>
        }
      />
      {canApprove && (
        <CountActions
          id={count.id}
          number={count.number}
          status={count.status}
          differing={differing}
          cutOff={formatDateTime(count.cutOffAt)}
        />
      )}
      {count.status === "counting" ? (
        canCount ? (
          <CountSheet
            countId={count.id}
            lines={count.lines}
            locations={scope.map((location) => ({ id: location.id, path: location.path }))}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            Sedang dihitung: {formatNumber(counted)} dari {formatNumber(count.lines.length)} baris.
          </p>
        )
      ) : (
        <>
          {count.status === "review" && !canApprove && (
            <p className="text-sm text-muted-foreground">Menunggu persetujuan Manajer.</p>
          )}
          {count.status === "approved" && (
            <p className="text-sm">
              Disetujui {count.approvedAt && formatDateTime(count.approvedAt)} oleh{" "}
              {count.approvedByName ?? "—"}.{" "}
              {count.adjustments.length ? (
                <>
                  Penyesuaian:{" "}
                  {count.adjustments.map((adjustment, index) => (
                    <span key={adjustment.id}>
                      {index > 0 && ", "}
                      <Link
                        href={`/inventory/penyesuaian/${adjustment.id}`}
                        className="font-mono text-primary underline-offset-4 hover:underline"
                      >
                        {adjustment.number}
                      </Link>{" "}
                      ({adjustment.increase ? "tambah" : "kurangi"})
                    </span>
                  ))}
                  .
                </>
              ) : (
                "Tidak ada selisih."
              )}
            </p>
          )}
          <CountReview lines={count.lines} />
        </>
      )}
    </div>
  )
}
