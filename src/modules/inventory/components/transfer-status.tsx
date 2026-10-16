import { StatusBadge } from "@/components/status-badge"
import { TRANSFER_STATUS_LABELS, type TransferStatus } from "@/modules/inventory/lib/inventory"
import { TRANSFER_STATUS_TONES } from "@/modules/inventory/lib/transfer"

export function TransferStatusBadge({ status }: { status: TransferStatus }) {
  return (
    <StatusBadge tone={TRANSFER_STATUS_TONES[status]}>{TRANSFER_STATUS_LABELS[status]}</StatusBadge>
  )
}
