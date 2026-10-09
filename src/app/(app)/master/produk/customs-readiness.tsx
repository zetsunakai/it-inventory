import { Badge } from "@/components/ui/badge"

// Kesiapan produk untuk dokumen BC (PRD bagian 5.3), dari kolom customs_ready di database.
export function missingCustomsData(product: {
  hsCode: string | null
  ceisaUnitCode: string | null
}) {
  const missing: string[] = []
  if (!product.hsCode) missing.push("kode HS")
  if (!product.ceisaUnitCode) missing.push("satuan CEISA")
  return missing
}

export function CustomsReadiness({
  product,
}: {
  product: { customsReady: boolean; hsCode: string | null; ceisaUnitCode: string | null }
}) {
  if (product.customsReady) return <Badge variant="secondary">Siap</Badge>
  return (
    <Badge variant="outline" title={`Belum ada ${missingCustomsData(product).join(" dan ")}`}>
      Belum siap
    </Badge>
  )
}
