"use client"

import { useState } from "react"

import { SearchSelect } from "@/components/search-select"
import { formatRefCode, type RefCodeOption, type RefCodeType } from "@/lib/ref-codes"

// Berbagi pencarian dan selector lanjut dengan foreign key produk/partner.
export function RefCodeSelect({
  type,
  name,
  defaultValue = null,
  parentCode,
  codes,
  id,
  placeholder = "Cari kode atau nama",
  required,
  onValueChange,
}: {
  type: RefCodeType
  name?: string
  defaultValue?: RefCodeOption | null
  parentCode?: string
  codes?: readonly string[]
  id?: string
  placeholder?: string
  required?: boolean
  onValueChange?: (value: RefCodeOption | null) => void
}) {
  const [value, setValue] = useState<RefCodeOption | null>(defaultValue)
  return (
    <>
      {name && <input type="hidden" name={name} value={value?.code ?? ""} />}
      <SearchSelect<RefCodeOption>
        endpoint="/api/ref-codes"
        params={{
          type,
          ...(parentCode ? { parent: parentCode } : {}),
          ...(codes?.length ? { codes: codes.join(",") } : {}),
        }}
        id={id}
        placeholder={placeholder}
        required={required}
        value={value}
        getKey={(item) => `${item.parentCode ?? ""}|${item.code}`}
        getLabel={formatRefCode}
        onValueChange={(next) => {
          setValue(next)
          onValueChange?.(next)
        }}
      />
    </>
  )
}
