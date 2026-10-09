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
import { formatRefCode, type RefCodeOption, type RefCodeType } from "@/lib/ref-codes"

const DEBOUNCE_MS = 250

// Komponen pilihan referensi kepabeanan, tampil sebagai [kode] nama (PRD bagian 5.2).
// Data dicari di server (/api/ref-codes), karena sebagian jenis berisi puluhan ribu baris.
// Nilai yang dikirim lewat form adalah kodenya.
export function RefCodeSelect({
  type,
  name,
  defaultValue = null,
  parentCode,
  id,
  placeholder = "Cari kode atau nama",
  required,
  onValueChange,
}: {
  type: RefCodeType
  name?: string
  defaultValue?: RefCodeOption | null
  // Batasi pilihan ke satu induk, misalnya TPS di satu kantor pabean.
  parentCode?: string
  id?: string
  placeholder?: string
  required?: boolean
  onValueChange?: (value: RefCodeOption | null) => void
}) {
  const [value, setValue] = useState<RefCodeOption | null>(defaultValue)
  const [items, setItems] = useState<RefCodeOption[]>(defaultValue ? [defaultValue] : [])
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle")
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const request = useRef<AbortController>(undefined)
  // Kata kunci terakhir yang diketik, supaya pemuatan awal saat popup dibuka
  // tidak menimpa pencarian yang sedang berjalan.
  const query = useRef("")

  useEffect(
    () => () => {
      clearTimeout(timer.current)
      request.current?.abort()
    },
    [],
  )

  function search(query: string, delay = DEBOUNCE_MS) {
    clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      request.current?.abort()
      const controller = new AbortController()
      request.current = controller
      setStatus("loading")
      const params = new URLSearchParams({ type, q: query })
      if (parentCode) params.set("parent", parentCode)
      try {
        const response = await fetch(`/api/ref-codes?${params}`, { signal: controller.signal })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const body: { items: RefCodeOption[] } = await response.json()
        setItems(body.items)
        setStatus("idle")
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error("[RefCodeSelect]", error)
          setStatus("error")
        }
      }
    }, delay)
  }

  return (
    <Combobox<RefCodeOption>
      items={items}
      value={value}
      onValueChange={(next) => {
        setValue(next)
        onValueChange?.(next)
      }}
      // Penyaringan sudah dilakukan server.
      filter={null}
      itemToStringLabel={formatRefCode}
      itemToStringValue={(item) => item.code}
      isItemEqualToValue={(item, selected) =>
        item.code === selected.code && item.parentCode === selected.parentCode
      }
      onInputValueChange={(input, details) => {
        // Hanya saat user mengetik, bukan saat input diisi label item yang dipilih.
        if (details.reason === "input-change" || details.reason === "input-clear") {
          query.current = input
          search(input)
        }
      }}
      onOpenChange={(open) => {
        if (open && status === "idle" && items.length <= 1) search(query.current, 0)
      }}
      name={name}
      required={required}
    >
      <ComboboxInput id={id} placeholder={placeholder} showClear={Boolean(value)} />
      <ComboboxContent>
        <ComboboxEmpty>
          {status === "loading"
            ? "Mencari…"
            : status === "error"
              ? "Gagal memuat data. Coba lagi."
              : "Tidak ditemukan."}
        </ComboboxEmpty>
        <ComboboxList>
          {(item: RefCodeOption) => (
            <ComboboxItem key={`${item.parentCode ?? ""}|${item.code}`} value={item}>
              {formatRefCode(item)}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
