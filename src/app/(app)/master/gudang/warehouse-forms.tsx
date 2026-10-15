"use client"

import { useRouter } from "next/navigation"
import { useActionState, useEffect } from "react"

import { useSaveFeedback } from "@/components/layout/record-modes"
import { FormErrors } from "@/components/form-errors"
import { CheckboxField } from "@/components/checkbox-field"
import { FormField, FormSection, StaticField } from "@/components/form-field"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { fieldValue, type FormState } from "@/lib/action-result"

import { createWarehouse, updateWarehouse } from "./actions"
import { FORM_CLASS, FormActions } from "@/components/layout/form-layout"

type Warehouse = {
  id: string
  code: string
  name: string
  address: string
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
  // Setelah tersimpan: kembali ke mode baca (RecordModes) dan pesannya di bawah header.
  useSaveFeedback(state)
  const checked = (name: string, saved: boolean) =>
    state?.ok === false ? state.values?.[name] === "on" : saved

  // Gudang baru: lanjut ke halaman detail untuk menambah lokasi.
  useEffect(() => {
    if (!warehouse && state?.ok) router.push(`/master/gudang/${state.data.id}`)
  }, [warehouse, state, router])

  return (
    <form action={formAction} className={FORM_CLASS}>
      <FormActions>
        <Button type="submit" disabled={pending}>
          {pending ? "Menyimpan…" : "Simpan"}
        </Button>
      </FormActions>
      {state?.ok === false && <FormErrors errors={state.errors} />}
      {warehouse && <input type="hidden" name="id" value={warehouse.id} />}
      <FormSection title="Data gudang">
        {warehouse ? (
          <StaticField
            span={4}
            label="Kode gudang"
            value={warehouse.code}
            mono
            reason="Tidak bisa diubah."
          />
        ) : (
          <FormField label="Kode gudang" htmlFor="code" errors={fieldErrors?.code} span={4}>
            <Input
              id="code"
              name="code"
              defaultValue={fieldValue(state, "code")}
              maxLength={30}
              autoComplete="off"
            />
          </FormField>
        )}
        <FormField label="Nama gudang" htmlFor="name" errors={fieldErrors?.name} span={8}>
          <Input
            id="name"
            name="name"
            defaultValue={fieldValue(state, "name", warehouse?.name)}
            maxLength={200}
          />
        </FormField>
        <FormField label="Alamat" htmlFor="address" errors={fieldErrors?.address} span={12}>
          <Input
            id="address"
            name="address"
            defaultValue={fieldValue(state, "address", warehouse?.address)}
            maxLength={500}
          />
        </FormField>
        {warehouse && (
          <CheckboxField
            name="active"
            label="Aktif"
            description="Gudang yang diarsipkan tidak bisa dipilih untuk transaksi baru."
            defaultChecked={checked("active", warehouse.active)}
          />
        )}
      </FormSection>
    </form>
  )
}
