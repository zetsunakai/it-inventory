"use client"

import { Plus, Trash2 } from "lucide-react"
import { useRef, useState, useTransition } from "react"

import { saveReceiptLots } from "@/app/(app)/inventory/actions"
import { FormErrors } from "@/components/form-errors"
import { usePageMessage } from "@/components/layout/page-message"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { formatDecimal } from "@/lib/decimal"
import type { ProductTracking } from "@/lib/inventory"
import { type LotRow, lotRowsPayload, lotRowsTotal } from "@/lib/receipt-lots"

export type ReceiptLotLine = {
  id: string
  sku: string
  productName: string
  tracking: ProductTracking
  lotAuto: boolean
  // Qty diminta, satuan stok.
  requested: string
  uomCode: string
  rows: LotRow[]
}

// Rincian lot/nomor seri satu baris penerimaan lewat keyboard (backlog RU-03): Enter di qty
// menambah baris baru dan memindahkan fokus ke kolom lotnya. Qty selesai = jumlah rincian.
export function ReceiptLotEditor({
  transferId,
  line,
}: {
  transferId: string
  line: ReceiptLotLine
}) {
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<LotRow[]>(line.rows)
  const [errors, setErrors] = useState<string[]>([])
  const [pending, startTransition] = useTransition()
  const { show } = usePageMessage()
  const lotInputs = useRef<(HTMLInputElement | null)[]>([])
  const tracked = line.tracking !== "none"
  const serial = line.tracking === "serial"
  const lotLabel = serial ? "Nomor seri" : "Lot"
  const total = lotRowsTotal(rows)
  const requested = Number(line.requested)

  function update(index: number, patch: Partial<LotRow>) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  function addRow() {
    setRows((current) => [...current, { lot: "", qty: serial ? "1" : "" }])
    // Fokus ke baris baru setelah dirender.
    requestAnimationFrame(() => lotInputs.current.at(-1)?.focus())
  }

  function save() {
    startTransition(async () => {
      const result = await saveReceiptLots({
        id: transferId,
        lines: { [line.id]: lotRowsPayload(rows) },
      })
      if (result.ok) {
        setErrors([])
        setOpen(false)
        show(result)
      } else {
        setErrors(result.errors)
      }
    })
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) {
          setRows(line.rows.length ? line.rows : [{ lot: "", qty: serial ? "1" : "" }])
          setErrors([])
        }
      }}
    >
      <SheetTrigger render={<Button variant="outline" className="pointer-coarse:h-11" />}>
        {tracked ? `Isi ${lotLabel.toLowerCase()}` : "Isi qty"}
      </SheetTrigger>
      <SheetContent className="data-[side=right]:w-full data-[side=right]:sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>
            <span className="font-mono">{line.sku}</span> {line.productName}
          </SheetTitle>
          <SheetDescription>
            Diminta {formatDecimal(line.requested)} {line.uomCode}.
            {tracked && line.lotAuto && ` ${lotLabel} kosong diberi nomor otomatis saat validasi.`}
          </SheetDescription>
        </SheetHeader>
        <form
          className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4"
          onSubmit={(event) => {
            event.preventDefault()
            save()
          }}
        >
          <FormErrors errors={errors} />
          <div className="grid grid-cols-[1fr_6rem_2.5rem] items-center gap-2">
            {tracked && <span className="text-caption text-muted-foreground">{lotLabel}</span>}
            <span
              className={
                tracked
                  ? "text-right text-caption text-muted-foreground"
                  : "col-span-2 text-right text-caption text-muted-foreground"
              }
            >
              Qty ({line.uomCode})
            </span>
            <span />
            {rows.map((row, index) => (
              <div key={index} className="contents">
                {tracked && (
                  <Input
                    ref={(element) => {
                      lotInputs.current[index] = element
                    }}
                    aria-label={`${lotLabel} baris ${index + 1}`}
                    value={row.lot}
                    placeholder={line.lotAuto ? "Otomatis" : undefined}
                    onChange={(event) => update(index, { lot: event.target.value })}
                    className="font-mono pointer-coarse:h-11"
                  />
                )}
                <Input
                  aria-label={`Qty baris ${index + 1}`}
                  inputMode="decimal"
                  value={row.qty}
                  readOnly={serial}
                  onChange={(event) => update(index, { qty: event.target.value })}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && tracked) {
                      event.preventDefault()
                      addRow()
                    }
                  }}
                  className={
                    tracked
                      ? "text-right tabular-nums pointer-coarse:h-11"
                      : "col-span-2 text-right tabular-nums pointer-coarse:h-11"
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Hapus baris ${index + 1}`}
                  onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
          </div>
          {tracked && (
            <Button type="button" variant="outline" className="self-start" onClick={addRow}>
              <Plus />
              Tambah {lotLabel.toLowerCase()}
            </Button>
          )}
          <p
            className={
              total > requested
                ? "text-sm font-medium text-destructive tabular-nums"
                : "text-sm tabular-nums"
            }
          >
            Diterima {formatDecimal(String(total))} dari {formatDecimal(line.requested)}{" "}
            {line.uomCode}
            {total < requested && total > 0 && (
              <span className="text-muted-foreground">
                {" "}
                · sisa {formatDecimal(String(requested - total))} jadi backorder atau dibuang saat
                validasi
              </span>
            )}
          </p>
          <SheetFooter className="mt-auto px-0">
            <Button type="submit" disabled={pending}>
              {pending ? "Menyimpan…" : "Simpan"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
