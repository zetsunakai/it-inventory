"use client"

import { Check, CircleAlert, ScanLine } from "lucide-react"
import { useRef, useState, useTransition } from "react"

import { addCountLine, completeStockCount, recordCount } from "@/app/(app)/inventory/opname/actions"
import { SearchSelect } from "@/components/search-select"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toDecimalInput } from "@/lib/decimal"
import { formatNumber } from "@/lib/format"
import type { StockCountLine } from "@/server/queries/stock-counts"
import type { ProductChoice } from "@/server/queries/transfers"

type SaveState = "idle" | "saving" | "saved" | "error"

// Lembar hitung stock opname (backlog M2-09, PRD bagian 6.5), dipakai admin gudang di HP:
// tanpa qty sistem (hitungan tidak bias), kolom scan selalu siap (scanner barcode bekerja seperti
// keyboard + Enter), dan qty disimpan per baris begitu diisi.
export function CountSheet({
  countId,
  lines,
  locations,
}: {
  countId: string
  lines: StockCountLine[]
  // Lokasi dalam lingkup sesi, untuk barang temuan.
  locations: { id: string; path: string }[]
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      lines.map((line) => [line.id, line.countedQty ? toDecimalInput(line.countedQty) : ""]),
    ),
  )
  const [saved, setSaved] = useState<Record<string, string>>(values)
  const [states, setStates] = useState<Record<string, SaveState>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [onlyUncounted, setOnlyUncounted] = useState(false)
  const [feedback, setFeedback] = useState<{ tone: "ok" | "error"; text: string } | null>(null)
  const scanRef = useRef<HTMLInputElement>(null)
  const qtyRefs = useRef(new Map<string, HTMLInputElement>())

  const valueOf = (id: string) => values[id] ?? ""
  const counted = lines.filter((line) => (saved[line.id] ?? line.countedQty ?? "") !== "").length
  const visible = onlyUncounted ? lines.filter((line) => (saved[line.id] ?? "") === "") : lines

  async function save(line: StockCountLine) {
    const value = valueOf(line.id).trim()
    if (value === (saved[line.id] ?? "")) return
    setStates((current) => ({ ...current, [line.id]: "saving" }))
    const result = await recordCount({ lineId: line.id, qty: value })
    if (result.ok) {
      setSaved((current) => ({ ...current, [line.id]: value }))
      setStates((current) => ({ ...current, [line.id]: "saved" }))
      setErrors((current) => {
        const next = { ...current }
        delete next[line.id]
        return next
      })
    } else {
      setStates((current) => ({ ...current, [line.id]: "error" }))
      setErrors((current) => ({ ...current, [line.id]: result.errors.join(" ") }))
    }
  }

  function scan(code: string) {
    const sku = code.trim().toLowerCase()
    if (!sku) return
    const matches = lines.filter((line) => line.sku.toLowerCase() === sku)
    if (!matches.length) {
      setFeedback({
        tone: "error",
        text: `SKU ${code.trim()} tidak ada di daftar hitung. Tambahkan lewat "Barang tidak ada di daftar".`,
      })
      return
    }
    const target = matches.find((line) => (saved[line.id] ?? "") === "") ?? matches[0]
    setOnlyUncounted(false)
    setFeedback({
      tone: "ok",
      text: `${target.sku} di ${target.locationPath}${target.lotName ? ` lot ${target.lotName}` : ""}: isi qty fisik.`,
    })
    requestAnimationFrame(() => {
      const input = qtyRefs.current.get(target.id)
      input?.scrollIntoView({ block: "center" })
      input?.focus()
      input?.select()
    })
  }

  return (
    <div className="max-w-3xl space-y-5">
      <div className="space-y-2">
        <Label htmlFor="count-scan">Scan atau ketik SKU</Label>
        <div className="relative">
          <ScanLine
            className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            id="count-scan"
            ref={scanRef}
            autoFocus
            autoComplete="off"
            enterKeyHint="search"
            placeholder="SKU lalu Enter"
            className="h-12 pl-10 font-mono text-base"
            onKeyDown={(event) => {
              if (event.key !== "Enter") return
              event.preventDefault()
              scan(event.currentTarget.value)
              event.currentTarget.value = ""
            }}
          />
        </div>
        {feedback && (
          <p
            role="status"
            className={feedback.tone === "ok" ? "text-sm" : "text-sm font-medium text-destructive"}
          >
            {feedback.text}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm">
          <span className="font-medium tabular-nums">
            {formatNumber(counted)} dari {formatNumber(lines.length)}
          </span>{" "}
          baris sudah dihitung
        </p>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={onlyUncounted}
            onCheckedChange={(checked) => setOnlyUncounted(Boolean(checked))}
          />
          Belum dihitung saja
        </label>
      </div>

      <ul className="divide-y rounded-lg border bg-card">
        {visible.map((line) => {
          const state = states[line.id] ?? "idle"
          const done = (saved[line.id] ?? "") !== ""
          return (
            <li key={line.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-3">
              <div className="min-w-0 flex-1">
                <p className="font-mono font-medium text-foreground">{line.sku}</p>
                <p className="text-sm text-muted-foreground">{line.productName}</p>
                <p className="font-mono text-xs text-muted-foreground">
                  {line.locationPath}
                  {line.lotName && ` · lot ${line.lotName}`}
                </p>
                {errors[line.id] && (
                  <p role="alert" className="mt-1 text-xs font-medium text-destructive">
                    {errors[line.id]}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Input
                  ref={(element) => {
                    if (element) qtyRefs.current.set(line.id, element)
                    else qtyRefs.current.delete(line.id)
                  }}
                  aria-label={`Qty fisik ${line.sku} di ${line.locationPath}${line.lotName ? ` lot ${line.lotName}` : ""}`}
                  inputMode="decimal"
                  enterKeyHint="done"
                  placeholder="Qty"
                  value={valueOf(line.id)}
                  onChange={(event) =>
                    setValues((current) => ({ ...current, [line.id]: event.target.value }))
                  }
                  onBlur={() => save(line)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return
                    event.preventDefault()
                    void save(line)
                    scanRef.current?.focus()
                  }}
                  className="h-11 w-28 text-right text-base tabular-nums"
                />
                <span className="w-10 text-sm text-muted-foreground">{line.uomCode}</span>
                <span className="flex w-5 justify-center" aria-live="polite">
                  {state === "saving" ? (
                    <span className="text-xs text-muted-foreground">…</span>
                  ) : state === "error" ? (
                    <CircleAlert className="size-4 text-destructive" aria-label="Gagal disimpan" />
                  ) : done ? (
                    <Check className="size-4 text-success" aria-label="Tersimpan" />
                  ) : null}
                </span>
              </div>
            </li>
          )
        })}
        {!visible.length && (
          <li className="p-6 text-center text-sm text-muted-foreground">
            {lines.length ? "Semua baris sudah dihitung." : "Daftar hitung masih kosong."}
          </li>
        )}
      </ul>

      <AddFoundItem countId={countId} locations={locations} />
      <CompleteCount countId={countId} uncounted={lines.length - counted} />
    </div>
  )
}

// Barang yang ditemukan di rak tapi tidak ada di daftar hitung.
function AddFoundItem({
  countId,
  locations,
}: {
  countId: string
  locations: { id: string; path: string }[]
}) {
  const [product, setProduct] = useState<ProductChoice | null>(null)
  const [locationId, setLocationId] = useState<string | null>(locations[0]?.id ?? null)
  const [lotName, setLotName] = useState("")
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, startTransition] = useTransition()
  const items = locations.map((location) => ({ value: location.id, label: location.path }))

  return (
    <details className="rounded-lg border p-3">
      <summary className="cursor-pointer text-sm font-medium">Barang tidak ada di daftar</summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem_9rem_auto] sm:items-end">
        <div className="space-y-1.5">
          <Label htmlFor="found-product">Produk</Label>
          <SearchSelect<ProductChoice>
            id="found-product"
            endpoint="/api/products"
            value={product}
            onValueChange={setProduct}
            getKey={(item) => item.id}
            getLabel={(item) => `[${item.sku}] ${item.name}`}
            placeholder="Cari SKU atau nama produk"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="found-location">Lokasi</Label>
          <Select items={items} value={locationId} onValueChange={setLocationId}>
            <SelectTrigger id="found-location" className="w-full pointer-coarse:h-11">
              <SelectValue placeholder="Pilih lokasi" />
            </SelectTrigger>
            <SelectContent>
              {items.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="found-lot">Nomor lot</Label>
          <Input
            id="found-lot"
            value={lotName}
            onChange={(event) => setLotName(event.target.value)}
            className="font-mono pointer-coarse:h-11"
          />
        </div>
        <Button
          variant="outline"
          disabled={pending || !product || !locationId}
          className="pointer-coarse:h-11"
          onClick={() =>
            startTransition(async () => {
              const result = await addCountLine({
                countId,
                productId: product!.id,
                locationId: locationId!,
                lotName,
              })
              setMessage(
                result.ok
                  ? { ok: true, text: `${product!.sku} ditambahkan. Isi qty-nya di daftar.` }
                  : { ok: false, text: result.errors.join(" ") },
              )
              if (result.ok) {
                setProduct(null)
                setLotName("")
              }
            })
          }
        >
          Tambahkan
        </Button>
      </div>
      {message && (
        <p
          role={message.ok ? "status" : "alert"}
          className={message.ok ? "mt-2 text-sm" : "mt-2 text-sm font-medium text-destructive"}
        >
          {message.text}
        </p>
      )}
    </details>
  )
}

function CompleteCount({ countId, uncounted }: { countId: string; uncounted: number }) {
  const [open, setOpen] = useState(false)
  const [errors, setErrors] = useState<string[]>()
  const [pending, startTransition] = useTransition()

  return (
    <div className="space-y-2">
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger render={<Button className="h-11 w-full sm:w-auto" />}>
          Selesai hitung
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Selesaikan penghitungan?</AlertDialogTitle>
            <AlertDialogDescription>
              {uncounted > 0
                ? `Masih ada ${formatNumber(uncounted)} baris yang belum dihitung; isi 0 bila barangnya memang tidak ada.`
                : "Qty fisik dibandingkan dengan qty sistem saat mulai hitung. Daftar hitung terkunci; bila ada yang salah, pilih Hitung ulang."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Kembali</AlertDialogCancel>
            <Button
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await completeStockCount({ id: countId })
                  setOpen(false)
                  setErrors(result.ok ? undefined : result.errors)
                })
              }
            >
              {pending ? "Menyimpan…" : "Selesai hitung"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {errors?.length ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {errors.join(" ")}
        </p>
      ) : null}
    </div>
  )
}
