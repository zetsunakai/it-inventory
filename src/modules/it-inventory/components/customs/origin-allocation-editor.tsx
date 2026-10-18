"use client"

import { Sparkles, Trash2 } from "lucide-react"
import { useState, useTransition } from "react"

import { usePageMessage } from "@/components/layout/page-message"
import { SearchSelect } from "@/components/search-select"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { formatDecimal, toDecimalInput } from "@/lib/decimal"
import {
  allocateOrigins,
  suggestOriginAllocations,
} from "@/modules/it-inventory/actions/customs-transfers"
import { CUSTOMS_DOC_CODE_LABELS } from "@/modules/it-inventory/lib/customs"
import type {
  OriginOption,
  OutLineAllocation,
} from "@/modules/it-inventory/server/queries/customs-transfers"

type Row = OriginOption & { qty: string }

const originLabel = (option: OriginOption) =>
  `${CUSTOMS_DOC_CODE_LABELS[option.docCode]} ${option.ajuNumber}${
    option.registrationNumber ? ` · daftar ${option.registrationNumber}` : ""
  } · seri ${option.seq}`

// Alokasi dokumen asal satu baris barang dokumen keluar (backlog M4-05, PRD 8.5): pilih saldo asal,
// isi qty, atau pakai saran FIFO lalu ubah. Disimpan per baris; aturan diperiksa database.
export function OriginAllocationEditor({
  line,
  editable,
}: {
  line: OutLineAllocation
  editable: boolean
}) {
  const { show } = usePageMessage()
  const [pending, startTransition] = useTransition()
  const [rows, setRows] = useState<Row[]>(() =>
    line.allocations.map((row) => ({ ...row, qty: toDecimalInput(row.qty) })),
  )
  const [picker, setPicker] = useState<OriginOption | null>(null)
  const total = rows.reduce((sum, row) => sum + Number(row.qty.replace(",", ".") || 0), 0)
  const needed = Number(line.stockQty)

  function suggest() {
    startTransition(async () => {
      const result = await suggestOriginAllocations({ lineId: line.lineId })
      if (!result.ok) {
        show(result)
        return
      }
      setRows(result.data.map((row) => ({ ...row, qty: toDecimalInput(row.qty) })))
    })
  }

  function save() {
    startTransition(async () => {
      show(
        await allocateOrigins({
          lineId: line.lineId,
          allocations: rows.map((row) => ({ originLineId: row.lineId, qty: row.qty })),
        }),
      )
    })
  }

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-control">
          <span className="font-medium">Seri {line.seq}</span>{" "}
          <span className="font-mono">{line.sku}</span> {line.productName}
        </p>
        <p
          className={
            total === needed ? "text-control text-success" : "text-control text-muted-foreground"
          }
        >
          Teralokasi {formatDecimal(total.toFixed(4))} dari {formatDecimal(line.stockQty)}{" "}
          {line.uomCode}
        </p>
      </div>

      {rows.length === 0 && (
        <p className="text-control text-muted-foreground">Belum ada dokumen asal.</p>
      )}
      <ul className="space-y-2">
        {rows.map((row, index) => (
          <li key={row.lineId} className="flex flex-wrap items-center gap-3">
            <span className="min-w-0 flex-1 text-control">
              {originLabel(row)}{" "}
              <span className="text-caption text-muted-foreground">
                (tersedia {formatDecimal(row.available)})
              </span>
            </span>
            {editable ? (
              <>
                <Input
                  aria-label={`Qty dari ${row.ajuNumber} seri ${row.seq}`}
                  inputMode="decimal"
                  value={row.qty}
                  onChange={(event) =>
                    setRows(
                      rows.map((entry, position) =>
                        position === index ? { ...entry, qty: event.target.value } : entry,
                      ),
                    )
                  }
                  className="w-32 text-right tabular-nums"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Hapus asal ${row.ajuNumber} seri ${row.seq}`}
                  onClick={() => setRows(rows.filter((_, position) => position !== index))}
                >
                  <Trash2 />
                </Button>
              </>
            ) : (
              <span className="text-control tabular-nums">
                {formatDecimal(row.qty.replace(",", "."))} {line.uomCode}
              </span>
            )}
          </li>
        ))}
      </ul>

      {editable && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-72 flex-1">
            <SearchSelect<OriginOption>
              id={`origin-${line.lineId}`}
              endpoint="/api/customs-origins"
              params={{ line: line.lineId }}
              value={picker}
              onValueChange={(option) => {
                setPicker(null)
                if (option && !rows.some((row) => row.lineId === option.lineId)) {
                  const rest = Math.max(needed - total, 0)
                  const qty = Math.min(rest, Number(option.available))
                  setRows([...rows, { ...option, qty: toDecimalInput(qty.toFixed(4)) }])
                }
              }}
              getKey={(option) => option.lineId}
              getLabel={(option) =>
                `${originLabel(option)} · tersedia ${formatDecimal(option.available)}`
              }
              placeholder="Tambah dokumen asal: cari nomor aju atau daftar"
            />
          </div>
          <Button type="button" variant="outline" disabled={pending} onClick={suggest}>
            <Sparkles />
            Saran FIFO
          </Button>
          <Button type="button" disabled={pending} onClick={save}>
            {pending ? "Menyimpan…" : "Simpan alokasi"}
          </Button>
        </div>
      )}
    </div>
  )
}
