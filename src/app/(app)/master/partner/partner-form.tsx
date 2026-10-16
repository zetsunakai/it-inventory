"use client"

import { useRouter } from "next/navigation"
import { useActionState, useEffect, useState } from "react"

import { CheckboxField } from "@/components/checkbox-field"
import { useSaveFeedback } from "@/components/layout/record-modes"
import { FormErrors } from "@/components/form-errors"
import { FormField, FormSection } from "@/components/form-field"
import { RefCodeSelect } from "@/components/ref-code-select"
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
import { headOfficeNitku } from "@/lib/npwp"
import {
  IDENTITY_MAX_LENGTH,
  IDENTITY_TYPE_LABELS,
  IDENTITY_TYPES,
  NPWP_IDENTITY_TYPES,
  type IdentityType,
} from "@/modules/inventory/lib/partner"
import type { RefCodeOption } from "@/lib/ref-codes"

import { createPartner, updatePartner } from "./actions"
import { FORM_CLASS, FormActions } from "@/components/layout/form-layout"

const IDENTITY_ITEMS = IDENTITY_TYPES.map((type) => ({
  value: type,
  label: IDENTITY_TYPE_LABELS[type],
}))

// Kebanyakan partner berada di Indonesia; tetap bisa diganti.
const INDONESIA: RefCodeOption = { code: "ID", name: "Indonesia", parentCode: null }

export type PartnerFormValues = {
  id: string
  name: string
  address: string
  country: RefCodeOption | null
  identityType: IdentityType
  identityNumber: string
  nitku: string | null
  active: boolean
}

// Form tambah (tanpa partner) dan ubah partner.
export function PartnerForm({ partner }: { partner?: PartnerFormValues }) {
  const router = useRouter()
  const [state, formAction, pending] = useActionState<FormState<{ id: string }>, FormData>(
    partner ? updatePartner : createPartner,
    null,
  )
  const fieldErrors = state?.ok === false ? state.fieldErrors : undefined
  // Setelah tersimpan: kembali ke mode baca (RecordModes) dan pesannya di bawah header.
  useSaveFeedback(state)
  const [identityType, setIdentityType] = useState<IdentityType | null>(
    partner?.identityType ?? null,
  )
  const [identityNumber, setIdentityNumber] = useState(partner?.identityNumber ?? "")
  const isNpwp = identityType !== null && NPWP_IDENTITY_TYPES.includes(identityType)
  const derivedNitku = isNpwp ? headOfficeNitku(identityNumber) : null
  const maxLength = identityType ? IDENTITY_MAX_LENGTH[identityType] : 50
  const checked = (name: string, saved: boolean) =>
    state?.ok === false ? state.values?.[name] === "on" : saved

  // Partner baru: lanjut ke halaman detailnya.
  useEffect(() => {
    if (partner || !state?.ok) return
    router.push(`/master/partner/${state.data.id}`)
  }, [partner, state, router])

  return (
    <form action={formAction} className={FORM_CLASS}>
      <FormActions>
        <Button type="submit" disabled={pending}>
          {pending ? "Menyimpan…" : "Simpan"}
        </Button>
      </FormActions>
      {state?.ok === false && <FormErrors errors={state.errors} />}
      {partner && <input type="hidden" name="id" value={partner.id} />}
      <FormSection title="Data partner">
        <FormField label="Nama partner" htmlFor="name" errors={fieldErrors?.name} span={12}>
          <Input
            id="name"
            name="name"
            defaultValue={fieldValue(state, "name", partner?.name)}
            maxLength={200}
          />
        </FormField>
        <FormField label="Alamat" htmlFor="address" errors={fieldErrors?.address} span={8}>
          <Input
            id="address"
            name="address"
            defaultValue={fieldValue(state, "address", partner?.address)}
            maxLength={500}
          />
        </FormField>
        <FormField label="Negara" htmlFor="countryCode" errors={fieldErrors?.countryCode} span={4}>
          <RefCodeSelect
            id="countryCode"
            type="country"
            name="countryCode"
            defaultValue={partner ? partner.country : INDONESIA}
          />
        </FormField>
        {partner && (
          <CheckboxField
            name="active"
            label="Aktif"
            description="Partner yang diarsipkan tidak bisa dipilih untuk transaksi dan dokumen baru."
            defaultChecked={checked("active", partner.active)}
          />
        )}
      </FormSection>

      <FormSection title="Identitas">
        <FormField
          label="Jenis identitas"
          htmlFor="identityType"
          errors={fieldErrors?.identityType}
          span={4}
        >
          <Select
            name="identityType"
            items={IDENTITY_ITEMS}
            value={identityType}
            onValueChange={(value) => setIdentityType(value as IdentityType | null)}
          >
            <SelectTrigger id="identityType" className="w-full">
              <SelectValue placeholder="Pilih jenis identitas" />
            </SelectTrigger>
            <SelectContent>
              {IDENTITY_ITEMS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        {/* Panjang isian mengikuti jenis identitas (RM-03). */}
        <FormField
          label="NPWP"
          htmlFor="identityNumber"
          errors={fieldErrors?.identityNumber}
          span={8}
        >
          <Input
            id="identityNumber"
            name="identityNumber"
            value={identityNumber}
            onChange={(event) => setIdentityNumber(event.target.value.slice(0, maxLength))}
            maxLength={maxLength}
            inputMode={isNpwp || identityType === "ktp" ? "numeric" : undefined}
            autoComplete="off"
            className="font-mono"
          />
        </FormField>
        {isNpwp && (
          <FormField label="NITKU" htmlFor="nitku" errors={fieldErrors?.nitku}>
            {/* Kosong = kantor pusat (NPWP 16 digit + 000000), terlihat di placeholder. */}
            <Input
              id="nitku"
              name="nitku"
              defaultValue={fieldValue(state, "nitku", partner?.nitku)}
              placeholder={derivedNitku ?? undefined}
              maxLength={22}
              inputMode="numeric"
              autoComplete="off"
              className="font-mono"
            />
          </FormField>
        )}
      </FormSection>
    </form>
  )
}
