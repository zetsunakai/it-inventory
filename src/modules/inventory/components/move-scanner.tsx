"use client"

import { ArrowDown, CircleAlert, CircleCheck, MapPin, Minus, Plus, ScanLine, X } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState, useTransition } from "react"

import { FormErrors } from "@/components/form-errors"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { formatDecimal } from "@/lib/decimal"
import { cn } from "@/lib/utils"
import { moveByScan } from "@/modules/inventory/actions/transfers"
import type { ProductChoice } from "@/modules/inventory/server/queries/transfers"

type Feedback = { ok: boolean; message: string }
type Place = { id: string; code: string; path: string; warehouseId: string }
type Line = { product: ProductChoice; lot: string | null; qty: number }

// Layar scan pindah lokasi untuk HP/tablet (backlog I-05, pola layar scan RU-03): pindai lokasi
// asal, lokasi tujuan, lalu barangnya (produk berpelacakan: lot/nomor seri sesudahnya). Tanpa
// mengetik nama lokasi. Simpan membuat transfer pindah lokasi dan langsung memvalidasinya.
export function MoveScanner({ locations, listHref }: { locations: Place[]; listHref: string }) {
  const router = useRouter()
  const [code, setCode] = useState("")
  const [source, setSource] = useState<Place | null>(null)
  const [destination, setDestination] = useState<Place | null>(null)
  const [lines, setLines] = useState<Line[]>([])
  // Produk berpelacakan yang menunggu pindaian lot/nomor seri.
  const [awaitingLot, setAwaitingLot] = useState<ProductChoice | null>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [pending, startTransition] = useTransition()
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    input.current?.focus()
  }, [feedback, source, destination, awaitingLot])

  const step = !source ? "source" : !destination ? "destination" : "items"
  const prompt = awaitingLot
    ? `Pindai ${awaitingLot.tracking === "serial" ? "nomor seri" : "lot"} ${awaitingLot.sku}`
    : step === "source"
      ? "Pindai kode lokasi asal"
      : step === "destination"
        ? "Pindai kode lokasi tujuan"
        : "Pindai product code"

  function findLocation(value: string) {
    const text = value.toLowerCase()
    return locations.find(
      (item) => item.code.toLowerCase() === text || item.path.toLowerCase() === text,
    )
  }

  function addLine(product: ProductChoice, lot: string | null) {
    const index = lines.findIndex(
      (line) => line.product.id === product.id && (line.lot ?? "") === (lot ?? ""),
    )
    if (product.tracking === "serial" && index >= 0) {
      setFeedback({ ok: false, message: `Nomor seri ${lot} sudah dipindai.` })
      return
    }
    const next =
      index >= 0
        ? lines.map((line, i) => (i === index ? { ...line, qty: line.qty + 1 } : line))
        : [...lines, { product, lot, qty: 1 }]
    setLines(next)
    const qty = index >= 0 ? lines[index].qty + 1 : 1
    setFeedback({
      ok: true,
      message: `${product.sku}${lot ? ` ${lot}` : ""}: ${qty} ${product.uomCode}.`,
    })
  }

  function scan(raw: string) {
    const value = raw.trim()
    if (!value) return
    if (awaitingLot) {
      addLine(awaitingLot, value)
      setAwaitingLot(null)
      return
    }
    const location = findLocation(value)
    if (step === "source" || step === "destination") {
      if (!location) {
        setFeedback({ ok: false, message: `Kode ${value} bukan lokasi gudang yang bisa diakses.` })
        return
      }
      if (step === "source") {
        setSource(location)
        setFeedback({ ok: true, message: `Asal ${location.path}. Pindai lokasi tujuan.` })
        return
      }
      if (location.id === source!.id) {
        setFeedback({ ok: false, message: "Lokasi tujuan harus berbeda dengan lokasi asal." })
        return
      }
      if (location.warehouseId !== source!.warehouseId) {
        setFeedback({
          ok: false,
          message: `${location.path} di gudang lain. Pindah antar gudang lewat Transfer antar gudang.`,
        })
        return
      }
      setDestination(location)
      setFeedback({ ok: true, message: `Tujuan ${location.path}. Pindai barangnya.` })
      return
    }
    if (location) {
      setFeedback({
        ok: false,
        message: "Lokasi sudah dipilih. Lepas lokasi dulu untuk menggantinya.",
      })
      return
    }
    startTransition(async () => {
      const response = await fetch(`/api/products?q=${encodeURIComponent(value)}`)
      const items: ProductChoice[] = response.ok ? (await response.json()).items : []
      const product = items.find((item) => item.sku.toLowerCase() === value.toLowerCase())
      if (!product) {
        setFeedback({ ok: false, message: `Kode ${value} bukan product code yang dikenal.` })
        return
      }
      if (product.tracking !== "none") {
        setAwaitingLot(product)
        setFeedback({
          ok: true,
          message: `${product.sku} ${product.name}. Pindai ${product.tracking === "serial" ? "nomor seri" : "lot"}-nya.`,
        })
        return
      }
      addLine(product, null)
    })
  }

  function changeQty(index: number, delta: number) {
    setLines((current) =>
      current
        .map((line, i) => (i === index ? { ...line, qty: Math.max(0, line.qty + delta) } : line))
        .filter((line) => line.qty > 0),
    )
    input.current?.focus()
  }

  function save() {
    if (!source || !destination) return
    startTransition(async () => {
      const result = await moveByScan({
        sourceLocationId: source.id,
        destinationLocationId: destination.id,
        lines: lines.map((line) => ({
          productId: line.product.id,
          lotName: line.lot,
          qty: String(line.qty),
        })),
      })
      if (result.ok) router.push(`${listHref}/${result.data.id}`)
      else setErrors(result.errors)
    })
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 pb-24">
      <FormErrors errors={errors} />
      <div className="rounded-lg border bg-card">
        {(
          [
            ["Asal", source, () => (setSource(null), setDestination(null))],
            ["Tujuan", destination, () => setDestination(null)],
          ] as const
        ).map(([label, place, clear], index) => (
          <div key={label}>
            {index > 0 && <ArrowDown className="mx-4 size-4 text-muted-foreground" aria-hidden />}
            <div className="flex min-h-12 items-center gap-2 px-3 text-sm">
              <MapPin className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="w-14 text-muted-foreground">{label}</span>
              <span className="min-w-0 flex-1 truncate font-mono">{place?.path ?? "—"}</span>
              {place && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-11"
                  aria-label={`Lepas lokasi ${label.toLowerCase()}`}
                  disabled={pending}
                  onClick={clear}
                >
                  <X />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault()
          scan(code)
          setCode("")
        }}
        className="space-y-2"
      >
        <Label htmlFor="move-scan-code">{prompt}</Label>
        <div className="flex gap-2">
          <Input
            id="move-scan-code"
            ref={input}
            value={code}
            onChange={(event) => setCode(event.target.value)}
            autoComplete="off"
            autoCapitalize="characters"
            className="h-12 font-mono text-base"
          />
          <Button type="submit" variant="outline" className="h-12" aria-label="Catat kode">
            <ScanLine />
          </Button>
          {awaitingLot && (
            <Button
              type="button"
              variant="ghost"
              className="h-12"
              onClick={() => setAwaitingLot(null)}
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
          {feedback?.message}
        </p>
      </form>

      {lines.length > 0 && (
        <ul className="divide-y rounded-lg border bg-card">
          {lines.map((line, index) => (
            <li
              key={`${line.product.id}|${line.lot ?? ""}`}
              className="flex min-h-14 items-center gap-2 px-4 py-2"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate font-mono text-sm">
                  {line.product.sku}
                  {line.lot && ` · ${line.lot}`}
                </span>
                <span className="block truncate text-caption text-muted-foreground">
                  {line.product.name}
                </span>
              </span>
              {line.product.tracking !== "serial" && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-11"
                  aria-label={`Kurangi ${line.product.sku}`}
                  onClick={() => changeQty(index, -1)}
                >
                  <Minus />
                </Button>
              )}
              <span className="w-16 text-right text-base font-medium tabular-nums">
                {formatDecimal(String(line.qty))} {line.product.uomCode}
              </span>
              {line.product.tracking !== "serial" ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-11"
                  aria-label={`Tambah ${line.product.sku}`}
                  onClick={() => changeQty(index, 1)}
                >
                  <Plus />
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  className="h-11 text-destructive"
                  onClick={() => changeQty(index, -1)}
                >
                  Hapus
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="fixed inset-x-0 bottom-0 z-10 border-t bg-background/95 p-3 backdrop-blur md:static md:border-0 md:bg-transparent md:p-0">
        <div className="mx-auto flex max-w-2xl gap-2">
          <Button
            className="h-12 flex-1 md:flex-none"
            disabled={pending || !source || !destination || lines.length === 0}
            onClick={save}
          >
            {pending ? "Memproses…" : "Pindahkan"}
          </Button>
          <Link
            href={listHref}
            className={buttonVariants({ variant: "outline", className: "h-12" })}
          >
            Buang
          </Link>
        </div>
      </div>
    </div>
  )
}
