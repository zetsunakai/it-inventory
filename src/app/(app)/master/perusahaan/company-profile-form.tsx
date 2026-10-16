"use client"

import { useActionState } from "react"

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
import {
  FACILITY_TYPE_LABELS,
  FACILITY_TYPES,
  type CompanyProfileInput,
} from "@/modules/it-inventory/lib/company"
import type { RefCodeOption } from "@/lib/ref-codes"

import { saveCompanyProfile } from "./actions"
import { FORM_CLASS, FormActions } from "@/components/layout/form-layout"

const FACILITY_ITEMS = FACILITY_TYPES.map((type) => ({
  value: type,
  label: FACILITY_TYPE_LABELS[type],
}))

export function CompanyProfileForm({
  profile,
  office,
}: {
  profile: CompanyProfileInput | null
  office: RefCodeOption | null
}) {
  const [state, formAction, pending] = useActionState<FormState<void>, FormData>(
    saveCompanyProfile,
    null,
  )
  const fieldErrors = state?.ok === false ? state.fieldErrors : undefined
  // Setelah tersimpan: kembali ke mode baca (RecordModes) dan pesannya di bawah header.
  useSaveFeedback(state)

  return (
    <form action={formAction} className={FORM_CLASS}>
      <FormActions>
        <Button type="submit" disabled={pending}>
          {pending ? "Menyimpan…" : "Simpan"}
        </Button>
      </FormActions>
      {state?.ok === false && <FormErrors errors={state.errors} />}
      <FormSection title="Identitas perusahaan">
        <FormField label="Nama perusahaan" htmlFor="name" errors={fieldErrors?.name} span={12}>
          <Input
            id="name"
            name="name"
            defaultValue={fieldValue(state, "name", profile?.name)}
            maxLength={200}
          />
        </FormField>
        <FormField label="Alamat" htmlFor="address" errors={fieldErrors?.address} span={12}>
          <Input
            id="address"
            name="address"
            defaultValue={fieldValue(state, "address", profile?.address)}
            maxLength={500}
          />
        </FormField>
        <FormField
          label="NPWP"
          htmlFor="npwp"
          errors={fieldErrors?.npwp}
          span={4}
          hint="15 atau 16 digit, boleh dengan titik dan strip."
        >
          <Input
            id="npwp"
            name="npwp"
            defaultValue={fieldValue(state, "npwp", profile?.npwp)}
            inputMode="numeric"
          />
        </FormField>
        <FormField label="NIB" htmlFor="nib" errors={fieldErrors?.nib} hint="13 digit." span={4}>
          <Input
            id="nib"
            name="nib"
            defaultValue={fieldValue(state, "nib", profile?.nib)}
            inputMode="numeric"
          />
        </FormField>
        <FormField
          label="NITKU"
          htmlFor="nitku"
          errors={fieldErrors?.nitku}
          span={4}
          hint="22 digit. Kosongkan untuk kantor pusat: otomatis NPWP 16 digit + 000000."
        >
          <Input
            id="nitku"
            name="nitku"
            defaultValue={fieldValue(state, "nitku", profile?.nitku)}
            inputMode="numeric"
          />
        </FormField>
      </FormSection>
      <FormSection title="Fasilitas kawasan berikat">
        <FormField
          label="Jenis fasilitas"
          htmlFor="facilityType"
          errors={fieldErrors?.facilityType}
        >
          <Select
            name="facilityType"
            items={FACILITY_ITEMS}
            defaultValue={profile?.facilityType ?? null}
          >
            <SelectTrigger id="facilityType" className="w-full">
              <SelectValue placeholder="Pilih jenis fasilitas" />
            </SelectTrigger>
            <SelectContent>
              {FACILITY_ITEMS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField
          label="Kantor pabean pengawas"
          htmlFor="supervisingOfficeCode"
          errors={fieldErrors?.supervisingOfficeCode}
        >
          <RefCodeSelect
            id="supervisingOfficeCode"
            type="customs_office"
            name="supervisingOfficeCode"
            defaultValue={office}
          />
        </FormField>
        <FormField
          label="Nomor izin fasilitas"
          htmlFor="permitNumber"
          errors={fieldErrors?.permitNumber}
        >
          <Input
            id="permitNumber"
            name="permitNumber"
            defaultValue={fieldValue(state, "permitNumber", profile?.permitNumber)}
            maxLength={100}
          />
        </FormField>
        <FormField
          label="Tanggal izin fasilitas"
          htmlFor="permitDate"
          errors={fieldErrors?.permitDate}
        >
          <Input
            id="permitDate"
            name="permitDate"
            type="date"
            defaultValue={fieldValue(state, "permitDate", profile?.permitDate)}
          />
        </FormField>
      </FormSection>
    </form>
  )
}
