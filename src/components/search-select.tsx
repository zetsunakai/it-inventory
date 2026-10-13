"use client"

import { useEffect, useRef, useState } from "react"

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
}) {
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

  function search(text: string, delay = DEBOUNCE_MS) {
    clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      request.current?.abort()
      const controller = new AbortController()
      request.current = controller
      setStatus("loading")
      try {
        const response = await fetch(`${endpoint}?${new URLSearchParams({ ...params, q: text })}`, {
          signal: controller.signal,
        })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const body: { items: T[] } = await response.json()
        setItems(body.items)
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
    <Combobox<T>
      items={items}
      value={value}
      onValueChange={onValueChange}
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
      onOpenChange={(open) => {
        if (open && status === "idle" && items.length <= 1) search(query.current, 0)
      }}
    >
      <ComboboxInput
        id={id}
        placeholder={placeholder}
        showClear={Boolean(value)}
        aria-invalid={invalid || undefined}
        className="w-full"
      />
      <ComboboxContent>
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
      </ComboboxContent>
    </Combobox>
  )
}
