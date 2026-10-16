import { DataTable, type DataTableColumn } from "@/components/data-table/data-table"
import { StatusBadge } from "@/components/status-badge"
import { formatDecimal } from "@/lib/decimal"
import { formatNumber } from "@/lib/format"
import type { StockCountLine } from "@/modules/inventory/server/queries/stock-counts"

// Selisih qty fisik − qty sistem saat mulai hitung, dalam satuan stok.
function difference(line: StockCountLine) {
  if (line.systemQty === null || line.countedQty === null) return null
  return Number(line.countedQty) - Number(line.systemQty)
}

function signed(value: number, uomCode: string) {
  const text = formatDecimal(Math.abs(value).toFixed(4))
  return `${value > 0 ? "+" : "−"}${text} ${uomCode}`
}

const COLUMNS: DataTableColumn<StockCountLine>[] = [
  {
    header: "Produk",
    className: "w-full whitespace-normal",
    cell: (line) => (
      <span className="flex flex-col">
        <span className="font-mono text-foreground">{line.sku}</span>
        <span className="text-muted-foreground">{line.productName}</span>
      </span>
    ),
  },
  {
    header: "Lokasi",
    cell: (line) => (
      <span className="font-mono text-caption">
        {line.locationPath}
        {line.lotName && <span className="block">lot {line.lotName}</span>}
      </span>
    ),
  },
  {
    header: "Qty sistem",
    align: "right",
    cell: (line) => (line.systemQty === null ? "—" : formatDecimal(line.systemQty)),
  },
  {
    header: "Qty fisik",
    align: "right",
    cell: (line) => (line.countedQty === null ? "—" : formatDecimal(line.countedQty)),
  },
  {
    header: "Selisih",
    align: "right",
    cell: (line) => {
      const value = difference(line)
      if (value === null) return "—"
      if (value === 0) return <span className="text-muted-foreground">0</span>
      return <StatusBadge tone="warning">{signed(value, line.uomCode)}</StatusBadge>
    },
  },
]

// Hasil hitung dibandingkan qty sistem per cut-off (setelah diajukan). Selisih ditandai karena
// itulah yang diputuskan Manajer.
export function CountReview({ lines }: { lines: StockCountLine[] }) {
  const differing = lines.filter((line) => (difference(line) ?? 0) !== 0)
  return (
    <section className="space-y-3" aria-labelledby="count-result">
      <div>
        <h2 id="count-result" className="text-lg font-semibold tracking-tight">
          Hasil hitung
        </h2>
        <p className="text-sm text-muted-foreground">
          {differing.length
            ? `${formatNumber(differing.length)} dari ${formatNumber(lines.length)} baris berselisih.`
            : `Semua ${formatNumber(lines.length)} baris sesuai qty sistem.`}
        </p>
      </div>
      <DataTable
        columns={COLUMNS}
        rows={[...differing, ...lines.filter((line) => !differing.includes(line))]}
        rowKey={(line) => line.id}
      />
    </section>
  )
}
