import { StatusBadge } from "@/components/status-badge"

// Kesiapan produk untuk dokumen BC (PRD bagian 5.3), dari kolom customs_ready di database: cukup
// kode HS; satuan CEISA diisi per baris dokumen BC (RM-01).
export function CustomsReadiness({ product }: { product: { customsReady: boolean } }) {
  if (product.customsReady) return <StatusBadge tone="success">Siap</StatusBadge>
  return (
    <StatusBadge tone="warning" title="Belum ada kode HS">
      Belum siap
    </StatusBadge>
  )
}
