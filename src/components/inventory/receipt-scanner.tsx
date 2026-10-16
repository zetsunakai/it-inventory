"use client"

import { CircleAlert, CircleCheck, Minus, Plus, ScanLine } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState, useTransition } from "react"

import { saveReceiptLots } from "@/app/(app)/inventory/actions"
import { FormErrors } from "@/components/form-errors"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { formatDecimal } from "@/lib/decimal"
import { addLotScan, type LotRow, lotRowsPayload, lotRowsTotal } from "@/lib/receipt-lots"
import { cn } from "@/lib/utils"

import type { ReceiptLotLine } from "./receipt-lot-editor"

type Feedback = { ok: boolean; message: string }

// Layar scan penerimaan untuk tablet/HP (backlog RU-03, skill UI "Layar tablet/HP"): satu input scan
// yang selalu fokus. Kode produk memilih baris; kode lain dicatat sebagai lot/nomor seri baris itu.
// Produk tanpa pelacakan: setiap scan kode produknya menambah qty 1.
export function ReceiptScanner({
  transferId,
  detailHref,
  lines,
}: {
  transferId: string
  detailHref: string
  lines: ReceiptLotLine[]
}) {
  const router = useRouter()
  const [rows, setRows] = useState<Record<string, LotRow[]>>(() =>
    Object.fromEntries(lines.map((line) => [line.id, line.rows])),
  )
  const [activeId, setActiveId] = useState<string | null>(lines.length === 1 ? lines[0].id : null)
  const [code, setCode] = useState("")
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [pending, startTransition] = useTransition()
  const scanInput = useRef<HTMLInputElement>(null)
  const active = lines.find((line) => line.id === activeId) ?? null

  useEffect(() => {
    scanInput.current?.focus()
  }, [activeId, feedback])

  function scan(raw: string) {
    const value = raw.trim()
    if (!value) return
    const product = lines.find((line) => line.sku.toLowerCase() === value.toLowerCase())
    // Produk tanpa pelacakan: setiap scan kode produknya = qty 1.
    if (product?.tracking === "none") {
      setActiveId(product.id)
      const total = lotRowsTotal(rows[product.id] ?? []) + 1
      if (total > Number(product.requested)) {
        setFeedback({ ok: false, message: `${product.sku}: qty sudah sama dengan qty diminta.` })
        return
      }
      setRows({ ...rows, [product.id]: [{ lot: "", qty: String(total) }] })
      setFeedback({ ok: true, message: `${product.sku}: ${total}.` })
      return
    }
    if (product) {
      setActiveId(product.id)
      setFeedback({
        ok: true,
        message: `${product.sku} dipilih. Pindai ${
          product.tracking === "serial" ? "nomor seri" : "lot"
        }.`,
      })
      return
    }
    if (!active || active.tracking === "none") {
      setFeedback({
        ok: false,
        message: `Kode ${value} bukan produk penerimaan ini. Pindai kode produk dulu.`,
      })
      return
    }
    const result = addLotScan(rows[active.id] ?? [], value, {
      tracking: active.tracking,
      requested: Number(active.requested),
    })
    if (result.ok) setRows({ ...rows, [active.id]: result.rows })
    setFeedback({ ok: result.ok, message: result.message })
  }

  function changeQty(lineId: string, index: number, delta: number) {
    setRows((current) => ({
      ...current,
      [lineId]: (current[lineId] ?? [])
        .map((row, i) =>
          i === index ? { ...row, qty: String(Math.max(0, Number(row.qty) + delta)) } : row,
        )
        .filter((row) => Number(row.qty) > 0),
    }))
    scanInput.current?.focus()
  }

  function save() {
    startTransition(async () => {
      const result = await saveReceiptLots({
        id: transferId,
        lines: Object.fromEntries(
          lines.map((line) => [line.id, lotRowsPayload(rows[line.id] ?? [])]),
        ),
      })
      if (result.ok) router.push(detailHref)
      else setErrors(result.errors)
    })
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 pb-24">
      <FormErrors errors={errors} />
      <form
        onSubmit={(event) => {
          event.preventDefault()
          scan(code)
          setCode("")
        }}
        className="space-y-2"
      >
        <Label htmlFor="scan-code">
          {active
            ? `Pindai ${
                active.tracking === "none"
                  ? "kode produk"
                  : active.tracking === "serial"
                    ? "nomor seri"
                    : "lot"
              } untuk ${active.sku}`
            : "Pindai kode produk"}
        </Label>
        <div className="flex gap-2">
          <Input
            id="scan-code"
            ref={scanInput}
            value={code}
            onChange={(event) => setCode(event.target.value)}
            autoComplete="off"
            autoCapitalize="characters"
            className="h-12 font-mono text-base"
          />
          <Button type="submit" variant="outline" className="h-12" aria-label="Catat kode">
            <ScanLine />
          </Button>
        </div>
        <p
          role="status"
          className={cn(
            "flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm",
            feedback && (feedback.ok ? "bg-success-soft" : "bg-destructive/10 text-destructive"),
          )}
        >
          {feedback &&
            (feedback.ok ? (
              <CircleCheck className="size-4 shrink-0 text-success" aria-hidden />
            ) : (
              <CircleAlert className="size-4 shrink-0" aria-hidden />
            ))}
          {feedback?.message}
        </p>
      </form>

      <ul className="flex flex-col gap-2">
        {lines.map((line) => {
          const lineRows = rows[line.id] ?? []
          const total = lotRowsTotal(lineRows)
          const done = total >= Number(line.requested)
          return (
            <li
              key={line.id}
              className={cn(
                "rounded-lg border bg-card",
                line.id === activeId && "border-primary ring-1 ring-primary",
              )}
            >
              <button
                type="button"
                onClick={() => setActiveId(line.id)}
                aria-pressed={line.id === activeId}
                className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-sm">{line.sku}</span>
                  <span className="block truncate text-sm text-muted-foreground">
                    {line.productName}
                  </span>
                </span>
                <span
                  className={cn(
                    "text-right text-base font-medium tabular-nums",
                    done ? "text-success" : total > 0 && "text-warning",
                  )}
                >
                  {formatDecimal(String(total))} / {formatDecimal(line.requested)} {line.uomCode}
                </span>
              </button>
              {line.tracking !== "none" && lineRows.length > 0 && (
                <ul className="border-t px-4 py-1">
                  {lineRows.map((row, index) => (
                    <li key={`${row.lot}-${index}`} className="flex min-h-11 items-center gap-2">
                      <span className="min-w-0 flex-1 truncate font-mono text-sm">
                        {row.lot || "Otomatis"}
                      </span>
                      {line.tracking === "lot" && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-11"
                          aria-label={`Kurangi ${row.lot}`}
                          onClick={() => changeQty(line.id, index, -1)}
                        >
                          <Minus />
                        </Button>
                      )}
                      <span className="w-14 text-right tabular-nums">{formatDecimal(row.qty)}</span>
                      {line.tracking === "lot" ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-11"
                          aria-label={`Tambah ${row.lot}`}
                          disabled={done}
                          onClick={() => changeQty(line.id, index, 1)}
                        >
                          <Plus />
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-11 text-destructive"
                          onClick={() => changeQty(line.id, index, -1)}
                        >
                          Hapus
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ul>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t bg-background/95 p-3 backdrop-blur md:static md:border-0 md:bg-transparent md:p-0">
        <div className="mx-auto flex max-w-2xl gap-2">
          <Button className="h-12 flex-1 md:flex-none" disabled={pending} onClick={save}>
            {pending ? "Menyimpan…" : "Simpan"}
          </Button>
          <Button
            variant="outline"
            className="h-12"
            disabled={pending}
            onClick={() => router.push(detailHref)}
          >
            Buang
          </Button>
        </div>
      </div>
    </div>
  )
}
