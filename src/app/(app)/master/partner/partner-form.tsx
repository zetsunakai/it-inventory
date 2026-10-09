"use client"

import { useRouter } from "next/navigation"
import { useActionState, useEffect, useState } from "react"

import { CheckboxField } from "@/components/checkbox-field"
import { FormErrors } from "@/components/form-errors"
import { FormField, StaticField } from "@/components/form-field"
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
  IDENTITY_TYPE_LABELS,
  IDENTITY_TYPES,
  NPWP_IDENTITY_TYPES,
  type IdentityType,
} from "@/lib/partner"
import type { RefCodeOption } from "@/lib/ref-codes"

import { createPartner, updatePartner } from "./actions"

const IDENTITY_ITEMS = IDENTITY_TYPES.map((type) => ({
  value: type,
  label: IDENTITY_TYPE_LABELS[type],
}))

// Kebanyakan partner berada di Indonesia; tetap bisa diganti.
const INDONESIA: RefCodeOption = { code: "ID", name: "Indonesia", parentCode: null }

export type PartnerFormValues = {
  id: string
  code: string
  name: string
  address: string
  country: RefCodeOption | null
  isVendor: boolean
  isCustomer: boolean
  identityType: IdentityType
  identityNumber: string
  nitku: string | null
  active: boolean
}

// Form tambah (tanpa partner) dan ubah partner.
export function PartnerForm({ partner }: { partner?: PartnerFormValues }) {
  const router = useRouter()
  const [state, formAction, pending] = useActionState<
    FormState<{ id: string; code: string }>,
    FormData
  >(partner ? updatePartner : createPartner, null)
  const fieldErrors = state?.ok === false ? state.fieldErrors : undefined
  const [identityType, setIdentityType] = useState<IdentityType | null>(
    partner?.identityType ?? null,
  )
  const [identityNumber, setIdentityNumber] = useState(partner?.identityNumber ?? "")
  const isNpwp = identityType !== null && NPWP_IDENTITY_TYPES.includes(identityType)
  const derivedNitku = isNpwp ? headOfficeNitku(identityNumber) : null
  const checked = (name: string, saved: boolean) =>
    state?.ok === false ? state.values?.[name] === "on" : saved

  // Partner baru: kembali ke daftar, tersaring ke kode yang baru dibuat.
  useEffect(() => {
    if (partner || !state?.ok) return
    router.push(`/master/partner?${new URLSearchParams({ q: state.data.code })}`)
  }, [partner, state, router])

  return (
    <form action={formAction} className="max-w-3xl space-y-6">
      {state?.ok === false && <FormErrors errors={state.errors} />}
      {partner && <input type="hidden" name="id" value={partner.id} />}
      <div className="grid gap-4 sm:grid-cols-[12rem_1fr]">
        {partner ? (
          <StaticField label="Kode partner" value={partner.code} mono reason="Tidak bisa diubah." />
        ) : (
          <FormField label="Kode partner" htmlFor="code" errors={fieldErrors?.code}>
            <Input
              id="code"
              name="code"
              defaultValue={fieldValue(state, "code")}
              maxLength={30}
              autoComplete="off"
            />
          </FormField>
        )}
        <FormField label="Nama partner" htmlFor="name" errors={fieldErrors?.name}>
          <Input
            id="name"
            name="name"
            defaultValue={fieldValue(state, "name", partner?.name)}
            maxLength={200}
          />
        </FormField>
      </div>
      <div className="grid gap-4 sm:grid-cols-[1fr_16rem]">
        <FormField label="Alamat" htmlFor="address" errors={fieldErrors?.address}>
          <Input
            id="address"
            name="address"
            defaultValue={fieldValue(state, "address", partner?.address)}
            maxLength={500}
          />
        </FormField>
        <FormField label="Negara" htmlFor="countryCode" errors={fieldErrors?.countryCode}>
          <RefCodeSelect
            id="countryCode"
            type="country"
            name="countryCode"
            defaultValue={partner ? partner.country : INDONESIA}
          />
        </FormField>
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">Peran</legend>
        <CheckboxField
          name="isVendor"
          label="Vendor"
          description="Pemasok atau penjual: muncul di penerimaan dan dokumen masuk."
          defaultChecked={checked("isVendor", partner?.isVendor ?? false)}
        />
        <CheckboxField
          name="isCustomer"
          label="Customer"
          description="Pembeli atau penerima: muncul di pengiriman dan dokumen keluar."
          defaultChecked={checked("isCustomer", partner?.isCustomer ?? false)}
        />
        {fieldErrors?.isVendor?.map((message) => (
          <p key={message} className="text-sm text-destructive">
            {message}
          </p>
        ))}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-[14rem_1fr]">
        <FormField
          label="Jenis identitas"
          htmlFor="identityType"
          errors={fieldErrors?.identityType}
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
        <FormField
          label="Nomor identitas"
          htmlFor="identityNumber"
          errors={fieldErrors?.identityNumber}
          hint={isNpwp ? "Boleh ditulis dengan titik dan strip." : undefined}
        >
          <Input
            id="identityNumber"
            name="identityNumber"
            defaultValue={fieldValue(state, "identityNumber", partner?.identityNumber)}
            onChange={(event) => setIdentityNumber(event.target.value)}
            maxLength={50}
            autoComplete="off"
          />
        </FormField>
      </div>
      {isNpwp && (
        <FormField
          label="NITKU"
          htmlFor="nitku"
          errors={fieldErrors?.nitku}
          hint={
            derivedNitku
              ? `Kosongkan untuk kantor pusat: ${derivedNitku}. Isi bila partner adalah cabang.`
              : "Kosongkan untuk kantor pusat (NPWP 16 digit + 000000). Isi bila partner adalah cabang."
          }
        >
          <Input
            id="nitku"
            name="nitku"
            defaultValue={fieldValue(state, "nitku", partner?.nitku)}
            inputMode="numeric"
            autoComplete="off"
          />
        </FormField>
      )}

      {partner && (
        <CheckboxField
          name="active"
          label="Aktif"
          description="Partner yang diarsipkan tidak bisa dipilih untuk transaksi dan dokumen baru."
          defaultChecked={checked("active", partner.active)}
        />
      )}
      {state?.ok && partner && (
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
