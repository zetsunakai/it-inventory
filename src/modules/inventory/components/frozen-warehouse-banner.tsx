import { Snowflake } from "lucide-react"
import Link from "next/link"

import { STOCK_COUNT_STATUS_LABELS } from "@/modules/inventory/lib/inventory"
import { freezingCounts } from "@/modules/inventory/server/queries/stock-counts"

// Banner gudang beku (backlog I-04): di layar gudang dan transfer yang menyentuh gudang itu, supaya
// alasan transfer belum bisa divalidasi terlihat sebelum menekan Validasi.
export async function FrozenWarehouseBanner({
  warehouseIds,
  context,
}: {
  warehouseIds: (string | null)[]
  // "transfer": kalimat untuk transfer yang belum Selesai; "warehouse": layar gudang.
  context: "transfer" | "warehouse"
}) {
  const counts = await freezingCounts(warehouseIds)
  if (!counts.length) return null
  return (
    <div className="space-y-1">
      {counts.map((count) => (
        <p key={count.id} className="flex gap-2 rounded-lg bg-warning-soft px-3 py-2.5 text-sm">
          <Snowflake className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <span>
            Gudang {count.warehouseCode} dibekukan untuk stock opname{" "}
            <Link
              href={`/inventory/opname/${count.id}`}
              className="font-mono font-medium text-primary underline-offset-4 hover:underline"
            >
              {count.number}
            </Link>{" "}
            ({STOCK_COUNT_STATUS_LABELS[count.status].toLowerCase()}).{" "}
            {context === "transfer"
              ? "Transfer ini baru bisa divalidasi setelah opnamenya disetujui atau dibatalkan."
              : "Transfer di gudang ini tidak bisa divalidasi sampai opnamenya disetujui atau dibatalkan."}
          </span>
        </p>
      ))}
    </div>
  )
}
