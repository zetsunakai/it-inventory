"use client"

import { useState, useTransition } from "react"

import { DataTable, type DataTableColumn } from "@/components/data-table/data-table"
import { FormErrors } from "@/components/form-errors"
import { Section } from "@/components/layout/section"
import { ArchivedBadge } from "@/components/status-badge"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { UserWarehouse } from "@/server/queries/users"

import {
  grantWarehouseAccess,
  revokeWarehouseAccess,
} from "@/modules/inventory/actions/warehouse-access"

// Gudang yang boleh diakses satu user (PRD bagian 3). Hanya untuk user dengan izin user:manage.
// Tabel mengikuti standar daftar; aksi tambah dan cabut memakai konfirmasi karena langsung
// mengubah akses tersimpan, bukan draft.
export function WarehouseAccess({
  userId,
  granted,
  candidates,
}: {
  userId: string
  granted: UserWarehouse[]
  candidates: UserWarehouse[]
}) {
  const [selected, setSelected] = useState<string | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [pending, startTransition] = useTransition()

  function run(action: typeof grantWarehouseAccess, warehouseId: string) {
    startTransition(async () => {
      const result = await action({ userId, warehouseId })
      setErrors(result.ok ? [] : result.errors)
      if (result.ok) setSelected(null)
    })
  }

  const items = candidates.map((warehouse) => ({
    value: warehouse.id,
    label: `${warehouse.code} · ${warehouse.name}`,
  }))

  const columns: DataTableColumn<UserWarehouse>[] = [
    {
      header: "Kode",
      cell: (warehouse) => <span className="font-mono">{warehouse.code}</span>,
    },
    { header: "Gudang", cell: (warehouse) => warehouse.name, className: "w-full" },
    {
      header: "Status",
      cell: (warehouse) => (warehouse.active ? "Aktif" : <ArchivedBadge />),
    },
    {
      header: "Aksi",
      align: "right",
      cell: (warehouse) => (
        <RevokeButton
          warehouse={warehouse}
          pending={pending}
          onRevoke={() => run(revokeWarehouseAccess, warehouse.id)}
        />
      ),
    },
  ]

  return (
    <Section
      title="Akses gudang"
      actions={
        candidates.length > 0 ? (
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <Select
              items={items}
              value={selected}
              onValueChange={(value) => setSelected(value as string | null)}
            >
              <SelectTrigger
                aria-label="Beri akses ke gudang"
                className="w-full sm:w-72 pointer-coarse:h-11"
              >
                <SelectValue placeholder="Pilih gudang" />
              </SelectTrigger>
              <SelectContent>
                {items.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              className="pointer-coarse:h-11"
              disabled={pending || !selected}
              onClick={() => selected && run(grantWarehouseAccess, selected)}
            >
              Beri akses
            </Button>
          </div>
        ) : undefined
      }
    >
      <FormErrors errors={errors} />
      <DataTable
        columns={columns}
        rows={granted}
        rowKey={(warehouse) => warehouse.id}
        rowMuted={(warehouse) => !warehouse.active}
        empty={{ title: "Belum ada gudang yang diberikan." }}
      />
    </Section>
  )
}

// Cabut akses langsung tersimpan, jadi dikonfirmasi lebih dulu (standar aksi berbahaya).
function RevokeButton({
  warehouse,
  pending,
  onRevoke,
}: {
  warehouse: UserWarehouse
  pending: boolean
  onRevoke: () => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            className="pointer-coarse:h-11"
            disabled={pending}
            aria-label={`Cabut akses ${warehouse.code}`}
          />
        }
      >
        Cabut
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cabut akses {warehouse.code}?</AlertDialogTitle>
          <AlertDialogDescription>
            {warehouse.name} tidak lagi bisa dibuka pengguna ini. Akses bisa diberikan lagi kapan
            saja.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Kembali</AlertDialogCancel>
          <Button
            disabled={pending}
            onClick={() => {
              setOpen(false)
              onRevoke()
            }}
          >
            {pending ? "Memproses…" : "Cabut akses"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
