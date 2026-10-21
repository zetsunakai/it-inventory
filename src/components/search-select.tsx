"use client"

import { useEffect, useRef, useState } from "react"
import { ExternalLink, Search } from "lucide-react"

import { Button } from "@/components/ui/button"
import { RecordSelector, recordHref } from "@/components/relational/record-selector"

import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox"

const DEBOUNCE_MS = 250

// Pilihan dengan pencarian di server untuk data yang bisa ribuan baris (produk, partner).
// endpoint membalas { items: T[] } untuk ?q=<kata kunci> ditambah params. Nilainya dikontrol
// pemanggil; form membaca id dari nilai itu.
export function SearchSelect<T>({
  endpoint,
  params,
  value,
  onValueChange,
  getKey,
  getLabel,
  id,
  placeholder = "Cari kode atau nama",
  invalid,
  required,
  name,
  ariaLabel,
}: {
  endpoint: string
  params?: Record<string, string>
  value: T | null
  onValueChange: (value: T | null) => void
  getKey: (item: T) => string
  getLabel: (item: T) => string
  id?: string
  placeholder?: string
  invalid?: boolean
  required?: boolean
  name?: string
  ariaLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const [selector, setSelector] = useState<string | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const currentPage = useRef(1)
  const [items, setItems] = useState<T[]>(value ? [value] : [])
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle")
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const request = useRef<AbortController>(undefined)
  const query = useRef("")

  useEffect(
    () => () => {
      clearTimeout(timer.current)
      request.current?.abort()
    },
    [],
  )

  function search(text: string, delay = DEBOUNCE_MS, page = 1) {
    clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      request.current?.abort()
      const controller = new AbortController()
      request.current = controller
      setStatus("loading")
      try {
        const response = await fetch(
          `${endpoint}?${new URLSearchParams({ ...params, q: text, page: String(page) })}`,
          {
            signal: controller.signal,
          },
        )
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const body: { items: T[]; hasMore?: boolean } = await response.json()
        if (controller.signal.aborted) return
        currentPage.current = page
        setHasMore(Boolean(body.hasMore))
        setItems((current) =>
          page === 1
            ? body.items
            : [
                ...current,
                ...body.items.filter(
                  (item) => !current.some((entry) => getKey(entry) === getKey(item)),
                ),
              ],
        )
        setStatus("idle")
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error("[SearchSelect]", error)
          setStatus("error")
        }
      }
    }, delay)
  }

  return (
    <div className="flex min-w-0 items-center gap-1">
      <Combobox<T>
        open={open}
        name={name}
        items={items}
        required={required}
        value={value}
        onValueChange={(next) => {
          query.current = ""
          onValueChange(next)
        }}
        // Penyaringan sudah dilakukan server.
        filter={null}
        itemToStringLabel={getLabel}
        itemToStringValue={getKey}
        isItemEqualToValue={(item, selected) => getKey(item) === getKey(selected)}
        onInputValueChange={(input, details) => {
          if (details.reason === "input-change" || details.reason === "input-clear") {
            query.current = input
            search(input)
          }
        }}
        onOpenChange={(next) => {
          setOpen(next)
          if (next) search(query.current, 0)
        }}
      >
        <ComboboxInput
          id={id}
          aria-label={ariaLabel}
          placeholder={placeholder}
          showClear={Boolean(value)}
          aria-invalid={invalid || undefined}
          className="w-full"
        />
        <ComboboxContent>
          {status === "loading" && items.length > 0 && (
            <p role="status" className="px-3 py-2 text-caption text-muted-foreground">
              Mencari…
            </p>
          )}
          <ComboboxEmpty>
            {status === "loading"
              ? "Mencari…"
              : status === "error"
                ? "Gagal memuat data. Coba lagi."
                : "Tidak ditemukan."}
          </ComboboxEmpty>
          <ComboboxList>
            {(item: T) => (
              <ComboboxItem key={getKey(item)} value={item}>
                {getLabel(item)}
              </ComboboxItem>
            )}
          </ComboboxList>
          <div className="border-t p-1">
            {status === "error" && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={() => search(query.current, 0)}
              >
                Coba lagi
              </Button>
            )}
            {hasMore && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full"
                disabled={status === "loading"}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => search(query.current, 0, currentPage.current + 1)}
              >
                Muat lebih banyak
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full justify-start"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setOpen(false)
                setSelector(query.current)
              }}
            >
              <Search />
              Cari lebih lanjut
            </Button>
          </div>
        </ComboboxContent>
      </Combobox>
      {value && recordHref(endpoint, value, params) && (
        <a
          href={recordHref(endpoint, value, params)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Buka detail ${getLabel(value)}`}
          className="shrink-0 rounded-md p-2 text-primary outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ExternalLink className="size-4" />
        </a>
      )}
      {selector !== null && (
        <RecordSelector
          endpoint={endpoint}
          params={params}
          initialQuery={selector}
          getKey={getKey}
          getLabel={getLabel}
          value={value}
          onClose={() => setSelector(null)}
          onSelect={(item) => {
            setItems((current) =>
              current.some((entry) => getKey(entry) === getKey(item))
                ? current
                : [item, ...current],
            )
            query.current = ""
            onValueChange(item)
            setSelector(null)
            requestAnimationFrame(() => {
              if (id) document.getElementById(id)?.focus()
            })
          }}
        />
      )}
    </div>
  )
}
