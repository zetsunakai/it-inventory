import { StatusBadge, type StatusTone } from "@/components/status-badge"
import { STOCK_COUNT_STATUS_LABELS, type StockCountStatus } from "@/lib/inventory"

// Menunggu persetujuan = perlu tindakan Manajer, jadi ditonjolkan.
const TONES: Record<StockCountStatus, StatusTone> = {
  counting: "info",
  review: "warning",
  approved: "success",
  cancelled: "neutral",
}

export function CountStatusBadge({ status }: { status: StockCountStatus }) {
  return <StatusBadge tone={TONES[status]}>{STOCK_COUNT_STATUS_LABELS[status]}</StatusBadge>
}
