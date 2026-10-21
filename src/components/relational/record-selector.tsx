"use client"

import { useEffect, useState } from "react"
import { ArrowLeft, ArrowRight, ExternalLink, Search } from "lucide-react"

import { REF_CODE_TYPES, refCodeListHref } from "@/lib/ref-codes"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetDescription,
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

export function recordField<T>(item: T, key: string): string {
  const value = (item as Record<string, unknown>)[key]
  return typeof value === "string" ? value : ""
}

export function recordHref<T>(
  endpoint: string,
  item: T,
  params?: Record<string, string>,
): string | undefined {
  const base =
    endpoint === "/api/partners"
      ? "/master/partner"
      : endpoint === "/api/products" || endpoint === "/api/customs-products"
        ? "/master/produk"
        : endpoint === "/api/ref-codes" && REF_CODE_TYPES.some((type) => type === params?.type)
          ? refCodeListHref(params!.type as (typeof REF_CODE_TYPES)[number])
          : undefined
  const id = recordField(item, "id")
  return base && id ? `${base}/${encodeURIComponent(id)}` : undefined
}

export function RecordSelector<T>({
  endpoint,
  params,
  initialQuery,
  getKey,
  getLabel,
  value,
  onSelect,
  onClose,
}: {
  endpoint: string
  params?: Record<string, string>
  initialQuery: string
  getKey: (item: T) => string
  getLabel: (item: T) => string
  value: T | null
  onSelect: (item: T) => void
  onClose: () => void
}) {
  const [input, setInput] = useState(initialQuery)
  const [query, setQuery] = useState(initialQuery)
  const [page, setPage] = useState(1)
  const [retry, setRetry] = useState(0)
  const [result, setResult] = useState<{
    key: string
    items: T[]
    hasMore: boolean
    error?: string
  } | null>(null)
  const url = `${endpoint}?${new URLSearchParams({ ...params, q: query, page: String(page) })}`
  const key = `${url}|${retry}`
  const loading = result?.key !== key
  useEffect(() => {
    const controller = new AbortController()
    fetch(url, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Gagal memuat data. Coba lagi.")
        const body: { items: T[]; hasMore?: boolean } = await response.json()
        if (!controller.signal.aborted)
          setResult({ key, items: body.items, hasMore: Boolean(body.hasMore) })
      })
      .catch((error: Error) => {
        if (!controller.signal.aborted)
          setResult({ key, items: [], hasMore: false, error: error.message })
      })
    return () => controller.abort()
  }, [url, key])
  const items = loading ? [] : result.items
  const code = endpoint.includes("partners")
    ? "identityNumber"
    : endpoint.includes("ref-codes")
      ? "code"
      : "sku"
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <SheetContent className="w-full! gap-0 sm:max-w-3xl!">
        <SheetHeader className="border-b pr-14">
          <SheetTitle>Cari lebih lanjut</SheetTitle>
          <SheetDescription>
            Cari dan pilih satu record. Pilihan baru diterapkan setelah Anda menekan Pilih.
          </SheetDescription>
        </SheetHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-4 p-4">
          <div className="flex items-center gap-2">
            <Input
              autoFocus
              aria-label="Pencarian record"
              placeholder="Cari kode atau nama"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault()
                  setQuery(input)
                  setPage(1)
                }
              }}
            />
            <Button
              type="button"
              onClick={() => {
                setQuery(input)
                setPage(1)
              }}
            >
              <Search />
              Cari
            </Button>
          </div>
          {loading ? (
            <p role="status">Memuat data…</p>
          ) : result.error ? (
            <div role="alert" className="flex items-center gap-2 text-destructive">
              {result.error}
              <Button type="button" variant="outline" onClick={() => setRetry(retry + 1)}>
                Coba lagi
              </Button>
            </div>
          ) : null}
          <div className="min-h-0 overflow-hidden rounded-lg border">
            <Table containerClassName="max-h-[60dvh] overflow-auto" aria-label="Pilihan record">
              <TableHeader className="sticky top-0 z-10 bg-muted">
                <TableRow>
                  <TableHead className="px-4">Kode / identitas</TableHead>
                  <TableHead className="px-4">Nama</TableHead>
                  <TableHead className="px-4 text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!loading && !items.length && !result?.error && (
                  <TableRow>
                    <TableCell colSpan={3} className="p-8 text-center text-muted-foreground">
                      Tidak ditemukan.
                    </TableCell>
                  </TableRow>
                )}
                {items.map((item) => {
                  const href = recordHref(endpoint, item, params)
                  return (
                    <TableRow
                      key={getKey(item)}
                      data-state={value && getKey(item) === getKey(value) ? "selected" : undefined}
                    >
                      <TableCell className="px-4 font-mono">
                        {recordField(item, code) || "—"}
                      </TableCell>
                      <TableCell className="max-w-sm px-4 whitespace-normal">
                        {recordField(item, "name") || getLabel(item)}
                      </TableCell>
                      <TableCell className="px-4">
                        <div className="flex items-center justify-end gap-2">
                          {href && (
                            <a
                              href={href}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label={`Buka detail ${getLabel(item)}`}
                              className="rounded p-2 text-primary hover:bg-accent"
                            >
                              <ExternalLink className="size-4" />
                            </a>
                          )}
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            aria-label={`Pilih ${getLabel(item)}`}
                            onClick={() => onSelect(item)}
                          >
                            Pilih
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
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
      </SheetContent>
    </Sheet>
  )
}
