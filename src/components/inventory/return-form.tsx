"use client"

import { CircleAlert, CircleCheck } from "lucide-react"
import { useState, useTransition } from "react"

import { saveReturnQuantities } from "@/app/(app)/inventory/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { ActionResult } from "@/lib/action-result"
import { formatDecimal, toDecimalInput } from "@/lib/decimal"

export type ReturnLine = {
  id: string
  sku: string
  productName: string
  lotName: string | null
  qty: string
  uomCode: string
  // Sisa yang masih bisa diretur dari transfer asal (satuan stok).
  max: string
}

// Retur Draft (M2-07): hanya qty per baris yang bisa diubah; produk dan lot mengikuti transfer
// asal. Batasnya dicek lagi di database saat simpan, Siap, dan validasi.
export function ReturnForm({ id, lines }: { id: string; lines: ReturnLine[] }) {
  const [quantities, setQuantities] = useState<Record<string, string>>(() =>
    Object.fromEntries(lines.map((line) => [line.id, toDecimalInput(line.qty)])),
  )
  const [result, setResult] = useState<ActionResult<unknown> | null>(null)
  const [pending, startTransition] = useTransition()

  return (
    <div className="max-w-3xl space-y-4">
      <section className="space-y-3" aria-labelledby="return-lines">
        <div>
          <h2 id="return-lines" className="text-base font-semibold">
            Barang yang diretur
          </h2>
          <p className="text-sm text-muted-foreground">
            Isi 0 untuk baris yang tidak diretur. Qty dalam satuan stok produk.
          </p>
        </div>
        <div className="divide-y rounded-lg border">
          {lines.map((line) => (
            <div key={line.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-3">
              <div className="min-w-0 flex-1">
                <p className="font-mono text-sm text-foreground">{line.sku}</p>
                <p className="text-sm text-muted-foreground">
                  {line.productName}
                  {line.lotName && <span className="font-mono"> · lot {line.lotName}</span>}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  aria-label={`Qty retur ${line.sku}`}
                  inputMode="decimal"
                  value={quantities[line.id] ?? ""}
                  onChange={(event) =>
                    setQuantities((current) => ({ ...current, [line.id]: event.target.value }))
                  }
                  className="w-28 text-right tabular-nums pointer-coarse:h-11"
                />
                <span className="w-24 text-sm text-muted-foreground">
                  {line.uomCode} · maks. {formatDecimal(line.max)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </section>
      {result && (
        <div
          role={result.ok ? "status" : "alert"}
          className={
            result.ok
              ? "flex gap-2 rounded-lg bg-success-soft px-3 py-2.5 text-sm"
              : "flex gap-2 rounded-lg bg-destructive-soft px-3 py-2.5 text-sm text-destructive"
          }
        >
          {result.ok ? (
            <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
          ) : (
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          )}
          <div className="space-y-0.5">
            {result.ok ? (
              <p>{result.message}</p>
            ) : (
              result.errors.map((message) => <p key={message}>{message}</p>)
            )}
          </div>
        </div>
      )}
      <Button
        disabled={pending}
        onClick={() =>
          startTransition(async () => setResult(await saveReturnQuantities({ id, quantities })))
        }
        className="pointer-coarse:h-11"
      >
        {pending ? "Menyimpan…" : "Simpan qty retur"}
      </Button>
    </div>
  )
}
