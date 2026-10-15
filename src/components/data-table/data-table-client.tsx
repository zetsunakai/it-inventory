"use client"

import { ChevronDown, Columns3 } from "lucide-react"
import { useState } from "react"

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useStoredValue } from "@/lib/use-stored-value"
import { cn } from "@/lib/utils"

export type OptionalColumn = { id: string; label: string; hidden: boolean }

// Kolom opsional (RU-22, seperti hmx): pilihan tampil/sembunyi per tabel disimpan di browser.
// Kolom disembunyikan lewat CSS supaya tabel tetap dirender server.
export function ColumnMenu({ tableId, columns }: { tableId: string; columns: OptionalColumn[] }) {
  const defaults = Object.fromEntries(columns.map((column) => [column.id, column.hidden]))
  const [saved, setSaved] = useStoredValue<Record<string, boolean>>(`kolom:${tableId}`, {})
  const hidden = { ...defaults, ...saved }

  function toggle(id: string, show: boolean) {
    setSaved({ ...saved, [id]: !show })
  }

  const css = columns
    .map(
      (column) =>
        `#${tableId} [data-col="${column.id}"]{display:${hidden[column.id] ? "none" : "table-cell"}!important}`,
    )
    .join("")

  return (
    <>
      <style>{css}</style>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Pilih kolom"
          className="flex size-8 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Columns3 className="size-4" aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="text-caption">Kolom opsional</DropdownMenuLabel>
            {columns.map((column) => (
              <DropdownMenuCheckboxItem
                key={column.id}
                checked={!hidden[column.id]}
                onCheckedChange={(checked) => toggle(column.id, checked)}
              >
                {column.label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}

// Judul kelompok baris (RU-22): klik untuk melipat baris kelompok itu.
export function GroupToggle({ label, count }: { label: React.ReactNode; count: number }) {
  const [collapsed, setCollapsed] = useState(false)
  return (
    <button
      type="button"
      aria-expanded={!collapsed}
      onClick={(event) => {
        const body = event.currentTarget.closest("tbody")
        body?.toggleAttribute("data-collapsed", !collapsed)
        setCollapsed(!collapsed)
      }}
      className="flex w-full items-center gap-2 text-left font-semibold outline-none focus-visible:underline"
    >
      <ChevronDown
        className={cn(
          "size-4 text-muted-foreground transition-transform",
          collapsed && "-rotate-90",
        )}
        aria-hidden
      />
      <span>{label}</span>
      <span className="font-normal text-muted-foreground">({count})</span>
    </button>
  )
}
