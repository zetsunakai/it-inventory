"use client"

import { useEffect, useState } from "react"
import { ArrowLeft, ArrowRight, Search } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatDate } from "@/lib/format"
import { cn } from "@/lib/utils"
import { TransferStatusBadge } from "@/modules/inventory/components/transfer-status"
import type { TransferStatus } from "@/modules/inventory/lib/inventory"
import {
  CUSTOMS_SOURCE_TYPES,
  customsSourceTypes,
  type CustomsDocCode,
  type CustomsSourceType,
} from "@/modules/it-inventory/lib/customs"
import type { CustomsTransferChoice } from "@/modules/it-inventory/lib/customs-form"
import type { CustomsTransferCandidate } from "@/modules/it-inventory/server/queries/customs-transfers"

const sourceOf = (movementCode: string) =>
  (Object.keys(CUSTOMS_SOURCE_TYPES) as CustomsSourceType[]).find((source) =>
    (CUSTOMS_SOURCE_TYPES[source].codes as readonly string[]).includes(movementCode),
  )

// Pemilih Inventory Transfer Documents (hx-it-inventory-transfer-selector hmx, H-04): pilih jenis
// sumber di kiri, lalu centang transfer Siap/Selesai di kanan. Pilihan lintas jenis dan halaman
// disimpan sampai Terapkan; Batal membuang perubahan.
export function TransferSelector({
  docCode,
  selected,
  onApply,
  onClose,
}: {
  docCode: CustomsDocCode
  selected: CustomsTransferChoice[]
  onApply: (transfers: CustomsTransferChoice[]) => void
  onClose: () => void
}) {
  const sources = customsSourceTypes(docCode)
  const [source, setSource] = useState<CustomsSourceType>(sources[0])
  const [picked, setPicked] = useState(() => new Map(selected.map((row) => [row.id, row])))
  const [input, setInput] = useState("")
  const [query, setQuery] = useState("")
  const [page, setPage] = useState(1)
  const [retry, setRetry] = useState(0)
  const [result, setResult] = useState<{
    key: string
    items: CustomsTransferCandidate[]
    hasMore: boolean
    error?: string
  } | null>(null)
  const url = `/api/customs-documents/transfers?${new URLSearchParams({
    docCode,
    source,
    q: query,
    page: String(page),
  })}`
  const key = `${url}|${retry}`
  const loading = result?.key !== key

  useEffect(() => {
    const controller = new AbortController()
    fetch(url, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Transfer gagal dimuat. Coba lagi.")
        const body: { items: CustomsTransferCandidate[]; hasMore?: boolean } = await response.json()
        if (!controller.signal.aborted) {
          setResult({ key, items: body.items, hasMore: Boolean(body.hasMore) })
        }
      })
      .catch((error: Error) => {
        if (!controller.signal.aborted) {
          setResult({ key, items: [], hasMore: false, error: error.message })
        }
      })
    return () => controller.abort()
  }, [url, key])

  const items = loading ? [] : result.items
  const toggle = (row: CustomsTransferCandidate) =>
    setPicked((current) => {
      const next = new Map(current)
      if (next.has(row.id)) next.delete(row.id)
      else {
        next.set(row.id, {
          id: row.id,
          number: row.number,
          type: row.type,
          movementCode: row.movementCode,
          status: row.status,
        })
      }
      return next
    })
  const allPicked = items.length > 0 && items.every((row) => picked.has(row.id))
  const somePicked = items.some((row) => picked.has(row.id))
  const pickedIn = (type: CustomsSourceType) =>
    [...picked.values()].filter((row) => sourceOf(row.movementCode) === type).length
  const search = () => {
    setQuery(input)
    setPage(1)
  }

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <SheetContent className="w-full! gap-0 sm:max-w-5xl!">
        <SheetHeader className="border-b pr-14">
          <SheetTitle>Pilih transfer</SheetTitle>
          <SheetDescription>
            Hanya transfer Siap atau Selesai yang boleh dipilih dokumen jenis ini. Barang dokumen
            diisi dari permintaan transfer yang dipilih.
          </SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 md:flex-row">
          {sources.length > 1 && (
            <nav aria-label="Jenis transfer" className="flex shrink-0 flex-col gap-2 md:w-56">
              {sources.map((type) => (
                <button
                  key={type}
                  type="button"
                  aria-pressed={type === source}
                  onClick={() => {
                    setSource(type)
                    setPage(1)
                  }}
                  className={cn(
                    "flex flex-col gap-1 rounded-lg border px-3 py-2 text-left text-control transition-colors hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                    type === source && "border-primary bg-accent",
                  )}
                >
                  <span className="flex items-center justify-between gap-2 font-medium">
                    {CUSTOMS_SOURCE_TYPES[type].label}
                    {pickedIn(type) > 0 && (
                      <span className="text-caption text-muted-foreground tabular-nums">
                        {pickedIn(type)} dipilih
                      </span>
                    )}
                  </span>
                  <span className="text-caption text-muted-foreground">
                    {CUSTOMS_SOURCE_TYPES[type].description}
                  </span>
                </button>
              ))}
            </nav>
          )}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-4">
            <div className="flex items-center gap-2">
              <Input
                autoFocus
                aria-label="Cari transfer"
                placeholder="Cari nomor, partner, atau referensi"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault()
                    search()
                  }
                }}
              />
              <Button type="button" onClick={search}>
                <Search />
                Cari
              </Button>
            </div>
            {loading ? (
              <p role="status">Memuat transfer…</p>
            ) : result.error ? (
              <div role="alert" className="flex items-center gap-2 text-destructive">
                {result.error}
                <Button type="button" variant="outline" onClick={() => setRetry(retry + 1)}>
                  Coba lagi
                </Button>
              </div>
            ) : null}
            <div className="min-h-0 overflow-hidden rounded-lg border">
              <Table containerClassName="max-h-[55dvh] overflow-auto" aria-label="Pilihan transfer">
                <TableHeader className="sticky top-0 z-10 bg-muted">
                  <TableRow>
                    <TableHead className="w-10 px-4">
                      <Checkbox
                        aria-label="Pilih semua transfer di halaman ini"
                        checked={allPicked}
                        indeterminate={somePicked && !allPicked}
                        disabled={!items.length}
                        onCheckedChange={(checked) =>
                          setPicked((current) => {
                            const next = new Map(current)
                            for (const row of items) {
                              if (!checked) next.delete(row.id)
                              else if (!next.has(row.id)) {
                                next.set(row.id, {
                                  id: row.id,
                                  number: row.number,
                                  type: row.type,
                                  movementCode: row.movementCode,
                                  status: row.status,
                                })
                              }
                            }
                            return next
                          })
                        }
                      />
                    </TableHead>
                    <TableHead className="px-4">Nomor</TableHead>
                    <TableHead className="px-4">Tanggal</TableHead>
                    <TableHead className="px-4">Asal / tujuan</TableHead>
                    <TableHead className="px-4">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!loading && !items.length && !result?.error && (
                    <TableRow>
                      <TableCell colSpan={5} className="p-8 text-center text-muted-foreground">
                        Tidak ada transfer Siap atau Selesai yang cocok.
                      </TableCell>
                    </TableRow>
                  )}
                  {items.map((row) => (
                    <TableRow
                      key={row.id}
                      data-state={picked.has(row.id) ? "selected" : undefined}
                      className="cursor-pointer"
                      onClick={() => toggle(row)}
                    >
                      <TableCell className="px-4" onClick={(event) => event.stopPropagation()}>
                        <Checkbox
                          aria-label={`Pilih ${row.number}`}
                          checked={picked.has(row.id)}
                          onCheckedChange={() => toggle(row)}
                        />
                      </TableCell>
                      <TableCell className="px-4 font-mono">{row.number}</TableCell>
                      <TableCell className="px-4">
                        {row.date ? formatDate(new Date(`${row.date}T00:00:00+07:00`)) : "—"}
                      </TableCell>
                      <TableCell className="max-w-md px-4 whitespace-normal">
                        {row.partnerName ? (
                          <span className="flex flex-col">
                            <span>{row.partnerName}</span>
                            <span className="text-caption text-muted-foreground">
                              {row.sourcePath} → {row.destinationPath}
                            </span>
                          </span>
                        ) : (
                          `${row.sourcePath} → ${row.destinationPath}`
                        )}
                      </TableCell>
                      <TableCell className="px-4">
                        <TransferStatusBadge status={row.status as TransferStatus} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-control text-muted-foreground">
                Halaman {page} · {items.length} hasil
              </span>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={loading || page === 1}
                  onClick={() => setPage(page - 1)}
                  aria-label="Hasil sebelumnya"
                >
                  <ArrowLeft />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={loading || !result?.hasMore}
                  onClick={() => setPage(page + 1)}
                  aria-label="Hasil berikutnya"
                >
                  <ArrowRight />
                </Button>
              </div>
            </div>
          </div>
        </div>
        <SheetFooter className="flex-row items-center justify-end gap-2 border-t">
          <span role="status" className="mr-auto text-control text-muted-foreground tabular-nums">
            {picked.size} transfer dipilih
          </span>
          <Button type="button" variant="outline" onClick={onClose}>
            Batal
          </Button>
          <Button type="button" onClick={() => onApply([...picked.values()])}>
            Terapkan
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
