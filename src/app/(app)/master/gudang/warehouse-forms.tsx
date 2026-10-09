"use client"

import { useRouter } from "next/navigation"
import { useActionState, useEffect } from "react"

import { FormErrors } from "@/components/form-errors"
import { CheckboxField } from "@/components/checkbox-field"
import { FormField, StaticField } from "@/components/form-field"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { fieldValue, type FormState } from "@/lib/action-result"
import {
  INVENTORY_CATEGORIES,
  INVENTORY_CATEGORY_LABELS,
  type InventoryCategory,
} from "@/lib/inventory"

import { createWarehouse, updateWarehouse } from "./actions"

const CATEGORY_ITEMS = INVENTORY_CATEGORIES.map((category) => ({
  value: category,
  label: INVENTORY_CATEGORY_LABELS[category],
}))

type Warehouse = {
  id: string
  code: string
  name: string
  address: string
  category: InventoryCategory
  isBonded: boolean
  active: boolean
}

// Form tambah (tanpa warehouse) dan ubah gudang.
export function WarehouseForm({ warehouse }: { warehouse?: Warehouse }) {
  const router = useRouter()
  const [state, formAction, pending] = useActionState<FormState<{ id: string }>, FormData>(
    warehouse ? updateWarehouse : createWarehouse,
    null,
  )
  const fieldErrors = state?.ok === false ? state.fieldErrors : undefined
  const checked = (name: string, saved: boolean) =>
    state?.ok === false ? state.values?.[name] === "on" : saved

  // Gudang baru: lanjut ke halaman detail untuk menambah lokasi.
  useEffect(() => {
    if (!warehouse && state?.ok) router.push(`/master/gudang/${state.data.id}`)
  }, [warehouse, state, router])

  return (
    <form action={formAction} className="max-w-2xl space-y-4">
      {state?.ok === false && <FormErrors errors={state.errors} />}
      {warehouse && <input type="hidden" name="id" value={warehouse.id} />}
      <div className="grid gap-4 sm:grid-cols-[12rem_1fr]">
        {warehouse ? (
          <StaticField
            label="Kode gudang"
            value={warehouse.code}
            mono
            reason="Tidak bisa diubah."
          />
        ) : (
          <FormField label="Kode gudang" htmlFor="code" errors={fieldErrors?.code}>
            <Input
              id="code"
              name="code"
              defaultValue={fieldValue(state, "code")}
              maxLength={30}
              autoComplete="off"
            />
          </FormField>
        )}
        <FormField label="Nama gudang" htmlFor="name" errors={fieldErrors?.name}>
          <Input
            id="name"
            name="name"
            defaultValue={fieldValue(state, "name", warehouse?.name)}
            maxLength={200}
          />
        </FormField>
      </div>
      <FormField label="Alamat" htmlFor="address" errors={fieldErrors?.address}>
        <Input
          id="address"
          name="address"
          defaultValue={fieldValue(state, "address", warehouse?.address)}
          maxLength={500}
        />
      </FormField>
      <FormField label="Kategori" htmlFor="category" errors={fieldErrors?.category}>
        <Select name="category" items={CATEGORY_ITEMS} defaultValue={warehouse?.category ?? null}>
          <SelectTrigger id="category" className="w-full sm:w-72">
            <SelectValue placeholder="Pilih kategori" />
          </SelectTrigger>
          <SelectContent>
            {CATEGORY_ITEMS.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>
      <CheckboxField
        name="isBonded"
        label="Gudang berikat"
        description="Pergerakan barang ke atau dari gudang ini wajib punya dokumen BC yang sudah terdaftar."
        defaultChecked={checked("isBonded", warehouse?.isBonded ?? false)}
      />
      {warehouse && (
        <CheckboxField
          name="active"
          label="Aktif"
          description="Gudang yang diarsipkan tidak bisa dipilih untuk transaksi baru."
          defaultChecked={checked("active", warehouse.active)}
        />
      )}
      {state?.ok && warehouse && state.message && (
        <p role="status" className="text-sm text-muted-foreground">
          {state.message}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Menyimpan…" : "Simpan"}
      </Button>
    </form>
  )
}
