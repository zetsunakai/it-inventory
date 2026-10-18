"use client"

import { FormField } from "@/components/form-field"
import { RefCodeSelect } from "@/components/ref-code-select"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  CUSTOMS_OPTION_LISTS,
  type CustomsField,
  type CustomsFieldGroup,
  type CustomsFieldKind,
} from "@/modules/it-inventory/lib/customs-form"
import { cn } from "@/lib/utils"

// Nama kode referensi yang sudah diketahui, kunci "<jenis>|<kode>" (dari server, ditambah pilihan
// user), supaya kode tersimpan tampil sebagai [kode] nama.
export type RefLabels = Record<string, string>

export type FieldChange = (value: string, label?: { key: string; name: string }) => void

// Kontrol untuk satu jenis isian dokumen BC, dikontrol pemanggil. Kode referensi dipilih lewat
// RefCodeSelect; komponennya dipasang ulang saat kodenya berubah dari luar (mis. Kode HS terisi
// dari produk) supaya tampilannya ikut.
export function CustomsControl({
  field,
  id,
  value,
  onChange,
  refLabels,
  ariaLabel,
}: {
  field: CustomsFieldKind & { label: string }
  id: string
  value: string
  onChange: FieldChange
  refLabels: RefLabels
  ariaLabel?: string
}) {
  switch (field.kind) {
    case "ref": {
      const labelKey = `${field.refType}|${value}`
      return (
        <RefCodeSelect
          key={labelKey}
          id={id}
          type={field.refType}
          defaultValue={
            value ? { code: value, name: refLabels[labelKey] ?? "", parentCode: null } : null
          }
          onValueChange={(option) =>
            onChange(
              option?.code ?? "",
              option ? { key: `${field.refType}|${option.code}`, name: option.name } : undefined,
            )
          }
        />
      )
    }
    case "option": {
      const list: readonly (readonly [string, string])[] = CUSTOMS_OPTION_LISTS[field.list]
      const items = list.map(([code, name]) => ({
        value: code,
        label: `[${code}] ${name}`,
      }))
      return (
        <Select items={items} value={value || null} onValueChange={(next) => onChange(next ?? "")}>
          <SelectTrigger id={id} aria-label={ariaLabel} className="w-full">
            <SelectValue placeholder="Pilih" />
          </SelectTrigger>
          <SelectContent>
            {items.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )
    }
    case "date":
      return (
        <Input
          id={id}
          type="date"
          aria-label={ariaLabel}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      )
    case "boolean":
      return (
        <div className="flex min-h-9 items-center">
          <Checkbox
            id={id}
            aria-label={ariaLabel ?? field.label}
            checked={value === "Y"}
            onCheckedChange={(checked) => onChange(checked ? "Y" : "")}
          />
        </div>
      )
    case "money":
    case "qty":
      return (
        <Input
          id={id}
          inputMode="decimal"
          aria-label={ariaLabel}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="tabular-nums"
        />
      )
    case "product":
    case "file":
      // Dirender khusus oleh pemanggil (pilihan produk, unggah file).
      return null
    case "text":
      return field.long ? (
        <Textarea
          id={id}
          rows={2}
          aria-label={ariaLabel}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <Input
          id={id}
          aria-label={ariaLabel}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={cn(field.mono && "font-mono")}
        />
      )
  }
}

// CustomsControl dengan label, untuk grid FormSection.
export function CustomsFormField({
  field,
  id,
  value,
  onChange,
  refLabels,
}: {
  field: CustomsField
  id: string
  value: string
  onChange: FieldChange
  refLabels: RefLabels
}) {
  return (
    <FormField label={field.label} htmlFor={id} span={field.span}>
      <CustomsControl
        field={field}
        id={id}
        value={value}
        onChange={onChange}
        refLabels={refLabels}
      />
    </FormField>
  )
}

// Beberapa isian sebaris di bawah satu label (grup side_by_side hmx, mis. Jenis Identitas: jenis
// dan nomor). Setiap kontrol tetap punya label aksesibel sendiri.
export function CustomsGroupField({
  group,
  id,
  value,
  onChange,
  refLabels,
}: {
  group: CustomsFieldGroup
  id: string
  value: (field: CustomsField) => string
  onChange: (field: CustomsField) => FieldChange
  refLabels: RefLabels
}) {
  return (
    <FormField label={group.group} htmlFor={`${id}-${group.fields[0]?.key}`} span={6}>
      <div className="flex flex-col gap-2 sm:flex-row">
        {group.fields.map((field) => (
          <div key={field.key} className="min-w-0 flex-1">
            <CustomsControl
              field={field}
              id={`${id}-${field.key}`}
              value={value(field)}
              onChange={onChange(field)}
              refLabels={refLabels}
              ariaLabel={field.label}
            />
          </div>
        ))}
      </div>
    </FormField>
  )
}
