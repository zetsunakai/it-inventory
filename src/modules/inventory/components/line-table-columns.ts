export { relationColumns as lineTableColumns } from "@/components/relational/columns"

// Satu acuan urutan dan label untuk mode baca maupun edit.
export const TRANSFER_LINE_FIELDS = [
  { id: "product", label: "Produk", required: true },
  { id: "qty", label: "Qty", required: true, numeric: true },
  { id: "uom", label: "Satuan", required: true },
  { id: "lot", label: "Nomor lot", optional: true },
] as const
export const INTERWAREHOUSE_LINE_FIELDS = TRANSFER_LINE_FIELDS.slice(0, 3)
export const RETURN_LINE_FIELDS = [
  { id: "product", label: "Produk" },
  { id: "qty", label: "Qty retur", numeric: true },
  { id: "max", label: "Maksimum", numeric: true },
  { id: "action", label: "Tindakan" },
] as const
