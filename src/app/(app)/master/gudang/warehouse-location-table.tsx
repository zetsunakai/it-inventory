"use client"

import { relationColumns } from "@/components/relational/columns"
import { WAREHOUSE_LOCATION_FIELDS, warehouseLocationPath } from "./warehouse-location-columns"

import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { RelationalTable } from "@/components/relational/relational-table"
import { LOCATION_TYPE_LABELS, WAREHOUSE_LOCATION_TYPES } from "@/modules/inventory/lib/inventory"
import type { WarehouseLocationDraft } from "@/modules/inventory/lib/warehouse-locations"

const TYPES = WAREHOUSE_LOCATION_TYPES.map((value) => ({
  value,
  label: LOCATION_TYPE_LABELS[value],
}))

export function WarehouseLocationTable({
  rows,
  onChange,
  onRemove,
  canAdd,
  errors,
}: {
  rows: WarehouseLocationDraft[]
  onChange: (rows: WarehouseLocationDraft[]) => void
  onRemove: (ids: string[]) => void
  canAdd: boolean
  errors?: string[]
}) {
  const update = (id: string, patch: Partial<WarehouseLocationDraft>) =>
    onChange(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)))
  return (
    <RelationalTable<WarehouseLocationDraft>
      id="warehouse-locations"
      label="Lokasi"
      rows={rows}
      rowKey={(row) => row.id}
      errors={errors}
      addLabel="Tambah lokasi"
      onAdd={
        canAdd
          ? () => {
              const id = crypto.randomUUID()
              onChange([
                ...rows,
                {
                  id,
                  isNew: true,
                  code: "",
                  name: "",
                  type: "internal",
                  parentId: null,
                  active: true,
                },
              ])
              return id
            }
          : undefined
      }
      onRemove={onRemove}
      columns={relationColumns<WarehouseLocationDraft>(WAREHOUSE_LOCATION_FIELDS, [
        {
          id: "code",
          label: "Kode",
          width: 180,
          required: true,
          value: (row) => row.code,
          edit: (row, index) =>
            row.isNew ? (
              <Input
                aria-label={`Kode lokasi baris ${index + 1}`}
                required
                value={row.code}
                maxLength={30}
                onChange={(event) => update(row.id, { code: event.target.value })}
              />
            ) : (
              <span className="font-mono">{row.code}</span>
            ),
        },
        {
          id: "name",
          label: "Nama",
          width: 260,
          required: true,
          value: (row) => row.name,
          edit: (row, index) => (
            <Input
              aria-label={`Nama lokasi baris ${index + 1}`}
              required
              value={row.name}
              maxLength={200}
              onChange={(event) => update(row.id, { name: event.target.value })}
            />
          ),
        },
        {
          id: "type",
          label: "Tipe",
          width: 180,
          value: (row) => LOCATION_TYPE_LABELS[row.type],
          edit: (row, index) =>
            row.isNew ? (
              <Select
                items={TYPES}
                value={row.type}
                onValueChange={(type) => type && update(row.id, { type })}
              >
                <SelectTrigger aria-label={`Tipe lokasi baris ${index + 1}`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPES.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              LOCATION_TYPE_LABELS[row.type]
            ),
        },
        {
          id: "parent",
          label: "Lokasi induk",
          width: 240,
          value: (row) => rows.find((parent) => parent.id === row.parentId)?.code || "Tanpa induk",
          edit: (row, index) => {
            const descendants = new Set([row.id])
            let count = -1
            while (count !== descendants.size) {
              count = descendants.size
              for (const candidate of rows)
                if (candidate.parentId && descendants.has(candidate.parentId))
                  descendants.add(candidate.id)
            }
            const options = [
              { value: "", label: "Tanpa induk" },
              ...rows
                .filter(
                  (candidate) =>
                    !descendants.has(candidate.id) &&
                    (candidate.active || candidate.id === row.parentId),
                )
                .map((candidate) => ({
                  value: candidate.id,
                  label: `${candidate.code || "Lokasi baru"} · ${candidate.name}`,
                })),
            ]
            return (
              <Select
                items={options}
                value={row.parentId ?? ""}
                onValueChange={(parentId) => update(row.id, { parentId: parentId || null })}
              >
                <SelectTrigger aria-label={`Lokasi induk baris ${index + 1}`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {options.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )
          },
        },
        { id: "path", label: "Jalur", value: (row) => warehouseLocationPath(row, rows) },
        {
          id: "active",
          label: "Aktif",
          width: 100,
          value: (row) => (row.active ? "Ya" : "Tidak"),
          edit: (row, index) => (
            <Checkbox
              aria-label={`Lokasi aktif baris ${index + 1}`}
              checked={row.active}
              onCheckedChange={(active) => update(row.id, { active })}
            />
          ),
        },
      ])}
    />
  )
}
