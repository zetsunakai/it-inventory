"use client"

import { useActionState } from "react"

import { FormErrors } from "@/components/form-errors"
import { FormField } from "@/components/form-field"
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
import { FACILITY_TYPE_LABELS, FACILITY_TYPES, type CompanyProfileInput } from "@/lib/company"
import type { RefCodeOption } from "@/lib/ref-codes"

import { saveCompanyProfile } from "./actions"

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

  return (
    <form action={formAction} className="max-w-2xl space-y-4">
      <FormField label="Nama perusahaan" htmlFor="name" errors={fieldErrors?.name}>
        <Input
          id="name"
          name="name"
          defaultValue={fieldValue(state, "name", profile?.name)}
          maxLength={200}
        />
      </FormField>
      <FormField label="Alamat" htmlFor="address" errors={fieldErrors?.address}>
        <Input
          id="address"
          name="address"
          defaultValue={fieldValue(state, "address", profile?.address)}
          maxLength={500}
        />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          label="NPWP"
          htmlFor="npwp"
          errors={fieldErrors?.npwp}
          hint="15 atau 16 digit, boleh dengan titik dan strip."
        >
          <Input
            id="npwp"
            name="npwp"
            defaultValue={fieldValue(state, "npwp", profile?.npwp)}
            inputMode="numeric"
          />
        </FormField>
        <FormField label="NIB" htmlFor="nib" errors={fieldErrors?.nib} hint="13 digit.">
          <Input
            id="nib"
            name="nib"
            defaultValue={fieldValue(state, "nib", profile?.nib)}
            inputMode="numeric"
          />
        </FormField>
      </div>
      <FormField
        label="NITKU"
        htmlFor="nitku"
        errors={fieldErrors?.nitku}
        hint="22 digit. Kosongkan untuk kantor pusat: otomatis NPWP 16 digit + 000000."
      >
        <Input
          id="nitku"
          name="nitku"
          defaultValue={fieldValue(state, "nitku", profile?.nitku)}
          inputMode="numeric"
        />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
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
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
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
      </div>
      {state?.ok === false && <FormErrors errors={state.errors} />}
      {state?.ok && state.message && (
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
