"use client"

import { Trash2, X } from "lucide-react"
import { createContext, useContext, useState, useTransition, type ReactNode } from "react"

import { usePageMessage } from "@/components/layout/page-message"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import type { ActionResult } from "@/lib/action-result"

export type SelectableRow = { id: string; label: string }

export type BulkDeleteAction = (input: { id: string }) => Promise<ActionResult<unknown>>

type Selection = {
  rows: SelectableRow[]
  selected: Set<string>
  toggle: (id: string, on: boolean) => void
  toggleAll: (on: boolean) => void
}

const SelectionContext = createContext<Selection | null>(null)

// Pilih baris lalu Hapus di halaman daftar data master (backlog M1-08, pola hmx): baris aksi
// muncul di atas tabel selama ada yang dipilih. Hapus dijalankan per data; data yang sudah
// dipakai ditolak server dan alasannya tampil di slot pesan halaman bersama penandanya.
export function RowSelection({
  rows,
  action,
  noun,
  children,
}: {
  rows: SelectableRow[]
  action: BulkDeleteAction
  // Kata benda huruf kecil, mis. "produk".
  noun: string
  children: ReactNode
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const { show } = usePageMessage()

  // Baris yang sudah tidak ada di halaman (terhapus, pindah halaman) tidak ikut terpilih.
  const chosen = rows.filter((row) => selected.has(row.id))

  function toggle(id: string, on: boolean) {
    setSelected((current) => {
      const next = new Set(current)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }

  function confirm() {
    startTransition(async () => {
      const errors: string[] = []
      let deleted = 0
      for (const row of chosen) {
        const result = await action({ id: row.id })
        if (result.ok) deleted++
        else errors.push(...result.errors.map((error) => `${row.label}: ${error}`))
      }
      setOpen(false)
      setSelected(new Set())
      if (errors.length) show({ ok: false, errors })
      else show({ ok: true, data: undefined, message: `${deleted} ${noun} dihapus.` })
    })
  }

  return (
    <SelectionContext
      value={{
        rows,
        selected,
        toggle,
        toggleAll: (on) => setSelected(on ? new Set(rows.map((row) => row.id)) : new Set()),
      }}
    >
      {chosen.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-3 rounded-lg border bg-info-soft px-3 py-2">
          <p className="text-control font-medium" aria-live="polite">
            {chosen.length} dipilih
          </p>
          <Button type="button" variant="destructive" onClick={() => setOpen(true)}>
            <Trash2 />
            Hapus
          </Button>
          <Button type="button" variant="ghost" onClick={() => setSelected(new Set())}>
            <X />
            Batal pilih
          </Button>
        </div>
      )}
      {children}
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Hapus{" "}
              {chosen.length === 1 ? `${noun} ${chosen[0].label}` : `${chosen.length} ${noun}`}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Hanya untuk {noun} yang belum pernah dipakai, misalnya salah input; yang sudah dipakai
              ditolak dan cukup diarsipkan dengan mengosongkan centang Aktif. Data dihapus permanen
              dan tidak bisa dikembalikan. Catatannya tetap ada di audit log.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Batal</AlertDialogCancel>
            <Button type="button" variant="destructive" onClick={confirm} disabled={pending}>
              {pending ? "Menghapus…" : "Hapus"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SelectionContext>
  )
}

export function SelectAllCheckbox() {
  const selection = useContext(SelectionContext)
  if (!selection) return null
  const count = selection.rows.filter((row) => selection.selected.has(row.id)).length
  return (
    <Checkbox
      aria-label="Pilih semua baris"
      checked={count > 0 && count === selection.rows.length}
      indeterminate={count > 0 && count < selection.rows.length}
      onCheckedChange={(checked) => selection.toggleAll(checked)}
    />
  )
}

export function RowCheckbox({ id, label }: { id: string; label: string }) {
  const selection = useContext(SelectionContext)
  if (!selection) return null
  return (
    <Checkbox
      aria-label={`Pilih ${label}`}
      checked={selection.selected.has(id)}
      onCheckedChange={(checked) => selection.toggle(id, checked)}
    />
  )
}
