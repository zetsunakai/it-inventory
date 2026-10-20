"use client"

import { CircleAlert, CircleCheck, MapPin, ScanLine, Undo2, X } from "lucide-react"
import Link from "next/link"
import { useEffect, useRef, useState, useTransition } from "react"

import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { formatDecimal } from "@/lib/decimal"
import { cn } from "@/lib/utils"
import {
  type CountScanResult,
  recordCount,
  scanCountItem,
} from "@/modules/inventory/actions/stock-counts"

type Feedback = { ok: boolean; message: string }
type Counted = Extract<CountScanResult, { status: "counted" }>

// Layar hitung opname untuk tablet/HP (backlog I-04, pola layar scan penerimaan RU-03): satu input
// scan yang selalu fokus. Kode lokasi memilih lokasi; product code menambah qty hitung 1 (produk
// berpelacakan: pindai lot/nomor serinya sesudahnya). Setiap pindaian langsung tersimpan.
export function CountScanner({
  countId,
  detailHref,
  locations,
  prefilled,
}: {
  countId: string
  detailHref: string
  // Lokasi di lingkup sesi, dicocokkan lewat kode atau jalur.
  locations: { id: string; code: string; path: string }[]
  // Qty hitung awal sudah terisi (0 atau qty sistem): pindaian menambah ke qty itu.
  prefilled: boolean
}) {
  const [code, setCode] = useState("")
  const [location, setLocation] = useState<{ id: string; path: string } | null>(
    locations.length === 1 ? locations[0] : null,
  )
  // Produk berpelacakan yang menunggu pindaian lot/nomor seri.
  const [awaitingLot, setAwaitingLot] = useState<{ sku: string; label: string } | null>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [recent, setRecent] = useState<Counted[]>([])
  const [pending, startTransition] = useTransition()
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    input.current?.focus()
  }, [feedback, location, awaitingLot])

  function scan(raw: string) {
    const value = raw.trim()
    if (!value) return
    const matched = locations.find(
      (item) =>
        item.code.toLowerCase() === value.toLowerCase() ||
        item.path.toLowerCase() === value.toLowerCase(),
    )
    if (matched && !awaitingLot) {
      setLocation(matched)
      setFeedback({ ok: true, message: `Lokasi ${matched.path}. Pindai barangnya.` })
      return
    }
    const request = awaitingLot
      ? { code: awaitingLot.sku, lot: value }
      : { code: value, lot: null as string | null }
    startTransition(async () => {
      const result = await scanCountItem({
        countId,
        code: request.code,
        lot: request.lot,
        locationId: location?.id ?? null,
      })
      if (!result.ok) {
        setFeedback({ ok: false, message: result.errors.join(" ") })
        return
      }
      const data = result.data
      if (data.status === "needs_lot") {
        setAwaitingLot({
          sku: data.sku,
          label: data.tracking === "serial" ? "nomor seri" : "lot",
        })
        setFeedback({
          ok: true,
          message: `${data.sku} ${data.productName}. Pindai ${data.tracking === "serial" ? "nomor seri" : "lot"}-nya.`,
        })
        return
      }
      setAwaitingLot(null)
      setRecent((current) => [data, ...current.filter((item) => item.lineId !== data.lineId)])
      setFeedback({
        ok: true,
        message: `${data.sku}${data.lot ? ` ${data.lot}` : ""} di ${data.locationPath}: ${formatDecimal(data.qty)}${data.found ? " (barang temuan)" : ""}.`,
      })
    })
  }

  function undo(item: Counted) {
    const next = Math.max(0, Number(item.qty) - 1)
    startTransition(async () => {
      const result = await recordCount({ lineId: item.lineId, qty: String(next) })
      if (!result.ok) {
        setFeedback({ ok: false, message: result.errors.join(" ") })
        return
      }
      setRecent((current) =>
        current.map((row) => (row.lineId === item.lineId ? { ...row, qty: String(next) } : row)),
      )
      setFeedback({
        ok: true,
        message: `${item.sku}: qty hitung jadi ${formatDecimal(String(next))}.`,
      })
    })
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 pb-24">
      {prefilled && (
        <p className="rounded-lg bg-info-soft px-3 py-2.5 text-sm">
          Qty hitung awal sesi ini sudah terisi. Setiap pindaian menambah 1 ke qty itu; untuk
          mengganti angkanya, isi langsung di daftar hitung.
        </p>
      )}
      <div className="flex min-h-11 items-center gap-2 rounded-lg border bg-card px-3 text-sm">
        <MapPin className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <span className="min-w-0 flex-1 truncate">
          {location ? (
            <>
              Lokasi <span className="font-mono">{location.path}</span>
            </>
          ) : (
            "Lokasi belum dipilih: pindai kode lokasi bila produknya ada di beberapa rak."
          )}
        </span>
        {location && locations.length > 1 && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-11"
            aria-label="Lepas lokasi"
            onClick={() => setLocation(null)}
          >
            <X />
          </Button>
        )}
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault()
          scan(code)
          setCode("")
        }}
        className="space-y-2"
      >
        <Label htmlFor="count-scan-code">
          {awaitingLot
            ? `Pindai ${awaitingLot.label} untuk ${awaitingLot.sku}`
            : "Pindai kode lokasi atau product code"}
        </Label>
        <div className="flex gap-2">
          <Input
            id="count-scan-code"
            ref={input}
            value={code}
            onChange={(event) => setCode(event.target.value)}
            autoComplete="off"
            autoCapitalize="characters"
            className="h-12 font-mono text-base"
          />
          <Button
            type="submit"
            variant="outline"
            className="h-12"
            disabled={pending}
            aria-label="Catat kode"
          >
            <ScanLine />
          </Button>
          {awaitingLot && (
            <Button
              type="button"
              variant="ghost"
              className="h-12"
              onClick={() => {
                setAwaitingLot(null)
                setFeedback(null)
              }}
            >
              Batal
            </Button>
          )}
        </div>
        <p
          role="status"
          className={cn(
            "flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm",
            feedback && (feedback.ok ? "bg-success-soft" : "bg-destructive-soft text-destructive"),
          )}
        >
          {feedback &&
            (feedback.ok ? (
              <CircleCheck className="size-4 shrink-0 text-success" aria-hidden />
            ) : (
              <CircleAlert className="size-4 shrink-0" aria-hidden />
            ))}
          {pending ? "Menyimpan…" : feedback?.message}
        </p>
      </form>

      {recent.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-medium">Dipindai di layar ini</h2>
          <ul className="divide-y rounded-lg border bg-card">
            {recent.map((item) => (
              <li key={item.lineId} className="flex min-h-14 items-center gap-3 px-4 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-sm">
                    {item.sku}
                    {item.lot && ` · ${item.lot}`}
                  </span>
                  <span className="block truncate text-caption text-muted-foreground">
                    {item.productName} · {item.locationPath}
                  </span>
                </span>
                <span className="text-base font-medium tabular-nums">
                  {formatDecimal(item.qty)}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-11"
                  aria-label={`Kurangi 1 ${item.sku}`}
                  disabled={pending || Number(item.qty) <= 0}
                  onClick={() => undo(item)}
                >
                  <Undo2 />
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="fixed inset-x-0 bottom-0 z-10 border-t bg-background/95 p-3 backdrop-blur md:static md:border-0 md:bg-transparent md:p-0">
        <div className="mx-auto flex max-w-2xl gap-2">
          <Link
            href={detailHref}
            className={buttonVariants({ className: "h-12 flex-1 md:flex-none" })}
          >
            Selesai scan
          </Link>
        </div>
      </div>
    </div>
  )
}
