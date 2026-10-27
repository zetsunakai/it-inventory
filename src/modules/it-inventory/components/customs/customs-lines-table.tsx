"use client"

import { Dialog } from "@base-ui/react/dialog"
import { X } from "lucide-react"
import { useRef, useState, type ReactNode } from "react"

import { RelationalTable } from "@/components/relational/relational-table"
import { Button } from "@/components/ui/button"
import { formatDecimal } from "@/lib/decimal"
import { lineTableColumns } from "@/modules/inventory/components/line-table-columns"
import { CUSTOMS_LINE_FIELDS } from "./customs-line-columns"

export type CustomsLineSummary = {
  key: string
  product: string
  hsCode: string
  description: string
  stockQty: string
  details?: ReactNode
}

// Daftar Barang BC hanya menampilkan nilai. Form barang dibuka lewat popup terpisah.
export function CustomsLinesTable({
  id,
  title,
  rows,
  onOpen,
}: {
  id: string
  title: string
  rows: CustomsLineSummary[]
  onOpen?: (key: string) => void
}) {
  const [opened, setOpened] = useState<string | null>(null)
  const open = (key: string) => (onOpen ? onOpen(key) : setOpened(key))
  const selected = rows.find((row) => row.key === opened)
  return (
    <>
      <div
        data-span={12}
        className="[&_[data-relation-row]]:cursor-pointer"
        onClick={(event) => {
          const target = event.target as HTMLElement
          if (target.closest('button, a, input, [role="checkbox"]')) return
          const row = target.closest<HTMLElement>("[data-relation-row]")
          if (row?.dataset.relationRow) open(row.dataset.relationRow)
        }}
      >
        <RelationalTable<CustomsLineSummary>
          id={id}
          label={title}
          readOnly
          rows={rows}
          rowKey={(row) => row.key}
          columns={lineTableColumns<CustomsLineSummary>(CUSTOMS_LINE_FIELDS, [
            {
              id: "product",
              label: "Produk",
              value: (row) => row.product,
              render: (row) => (
                <button
                  type="button"
                  className="block w-full truncate text-left text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => open(row.key)}
                >
                  {row.product || "Barang"}
                </button>
              ),
            },
            { id: "hsCode", label: "Kode HS", value: (row) => row.hsCode },
            { id: "description", label: "Uraian", value: (row) => row.description },
            {
              id: "stockQty",
              label: "Jumlah dalam Satuan Stok",
              value: (row) => row.stockQty,
              render: (row) => (row.stockQty ? formatDecimal(row.stockQty) : "—"),
            },
          ])}
        />
      </div>
      {!onOpen && selected && (
        <CustomsLineDialog title="Detail barang" onClose={() => setOpened(null)}>
          {selected.details}
        </CustomsLineDialog>
      )}
    </>
  )
}

export function CustomsLineDialog({
  title,
  children,
  onClose,
  onApply,
  onRemove,
}: {
  title: string
  children: ReactNode
  onClose: () => void
  onApply?: () => void
  onRemove?: () => void
}) {
  const popup = useRef<HTMLDivElement>(null)
  const content = (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6">
        <div className="form-grid">{children}</div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t p-4">
        {onRemove && (
          <Button
            type="button"
            variant="ghost"
            className="mr-auto text-destructive"
            onClick={onRemove}
          >
            Hapus barang
          </Button>
        )}
        <Button type="button" variant="outline" onClick={onClose}>
          {onApply ? "Batal" : "Tutup"}
        </Button>
        {onApply && (
          <Button
            type="button"
            onClick={() => {
              const controls = popup.current?.querySelectorAll<
                HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
              >("input, select, textarea")
              for (const control of controls ?? []) {
                if (!control.checkValidity()) {
                  requestAnimationFrame(() => control.reportValidity())
                  return
                }
              }
              onApply()
            }}
          >
            Terapkan
          </Button>
        )}
      </div>
    </>
  )
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/20 transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:transition-none" />
        <Dialog.Popup
          ref={popup}
          initialFocus={
            onApply
              ? () =>
                  popup.current?.querySelector<HTMLElement>(
                    'input:not([type="hidden"]), textarea, select, button[role="combobox"]',
                  )
              : undefined
          }
          className="fixed top-1/2 left-1/2 z-50 flex h-[calc(100dvh-2rem)] max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-[1600px] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border bg-card text-card-foreground shadow-lg transition-[opacity,scale] duration-200 outline-none data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0 motion-reduce:transition-none"
        >
          <div className="relative shrink-0 border-b px-6 py-4 pr-16">
            <Dialog.Title className="text-lg font-semibold">{title}</Dialog.Title>
            <Dialog.Description className="mt-1 text-control text-muted-foreground">
              {onApply
                ? "Terapkan perubahan barang, lalu Simpan dokumen untuk menyimpan seluruh perubahan."
                : "Rincian barang dokumen BC."}
            </Dialog.Description>
            <Dialog.Close
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="absolute top-4 right-4"
                />
              }
              aria-label="Tutup popup barang"
            >
              <X />
            </Dialog.Close>
          </div>
          <div className="flex min-h-0 flex-1 flex-col">{content}</div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
