"use client"

import { useState, useTransition } from "react"

import { FormErrors } from "@/components/form-errors"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ArchivedBadge } from "@/components/status-badge"
import type { UserWarehouse } from "@/server/queries/users"

import {
  grantWarehouseAccess,
  revokeWarehouseAccess,
} from "@/modules/inventory/actions/warehouse-access"

// Gudang yang boleh diakses satu user (PRD bagian 3). Hanya untuk user dengan izin user:manage.
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
    label: `[${warehouse.code}] ${warehouse.name}`,
  }))

  return (
    <div className="space-y-4">
      {granted.length === 0 ? (
        <p className="text-control text-muted-foreground">Belum ada gudang yang diberikan.</p>
      ) : (
        <ul className="divide-y rounded-lg border bg-card">
          {granted.map((warehouse) => (
            <li key={warehouse.id} className="flex items-center justify-between gap-4 px-4 py-2">
              <p className="flex min-w-0 items-center gap-2 text-control">
                <span className="font-mono">{warehouse.code}</span>
                <span className="truncate">{warehouse.name}</span>
                {!warehouse.active && <ArchivedBadge />}
              </p>
              <Button
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => run(revokeWarehouseAccess, warehouse.id)}
                aria-label={`Cabut akses ${warehouse.code}`}
              >
                Cabut
              </Button>
            </li>
          ))}
        </ul>
      )}
      {candidates.length > 0 && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="space-y-2">
            <Label htmlFor="grant-warehouse">Beri akses ke gudang</Label>
            <Select items={items} value={selected} onValueChange={(value) => setSelected(value)}>
              <SelectTrigger id="grant-warehouse" className="w-full sm:w-80">
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
          </div>
          <Button
            disabled={pending || !selected}
            onClick={() => selected && run(grantWarehouseAccess, selected)}
          >
            Beri akses
          </Button>
        </div>
      )}
      <FormErrors errors={errors} />
    </div>
  )
}
