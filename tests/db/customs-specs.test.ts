import { eq } from "drizzle-orm"
import { afterAll, describe, expect, test } from "vitest"

import {
  customsDocumentFields,
  customsLineFields,
  customsListBlock,
  type CustomsField,
} from "@/modules/it-inventory/lib/customs-form"
import { CUSTOMS_SPECS } from "@/modules/it-inventory/lib/customs-specs"
import { db } from "@/server/db"
import { docValidationRules } from "@/server/db/schema"

// Form per jenis dokumen BC (sama dengan form hmx) harus bisa mengisi semua yang diwajibkan aturan
// validasi (M3-03); kalau tidak, dokumennya tidak pernah bisa Siap ajukan. Label pesan aturan sama
// dengan label field di form.

afterAll(async () => {
  await db.$client.end()
})

const snake = (key: string) => key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)

describe.each(Object.values(CUSTOMS_SPECS))("form $title", (spec) => {
  test("semua field wajib ada di form dengan label yang sama", async () => {
    const rules = await db
      .select()
      .from(docValidationRules)
      .where(eq(docValidationRules.docCode, spec.code))
    const fields = customsDocumentFields(spec)
    const transports = customsListBlock(spec, "transports")
    const find = (rule: (typeof rules)[number]): { label: string } | undefined => {
      const byKey = (list: CustomsField[], key: string) => list.find((field) => field.key === key)
      switch (rule.target) {
        case "header":
          return byKey(
            fields.filter((field) => field.store === "header"),
            rule.field.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()),
          )
        case "details":
          return byKey(
            fields.filter((field) => field.store === "details"),
            rule.field,
          )
        case "party":
          return spec.parties.find((party) => party.code === rule.field)
        case "line":
          // Jumlah dalam satuan stok bukan isian hmx, tapi selalu ada di form Barang.
          if (rule.field === "stock_qty") return { label: rule.label }
          return customsLineFields(spec).find(
            (field) => field.store === "line" && snake(field.key) === rule.field,
          )
        case "transport": {
          const column = rule.field.replace(/_([a-z])/g, (_, letter: string) =>
            letter.toUpperCase(),
          )
          return (
            byKey(
              fields.filter((field) => field.store === "transport"),
              column,
            ) ?? (transports ? byKey(transports.columns, column) : undefined)
          )
        }
        case "package":
          return customsListBlock(spec, "packages") && { label: rule.label }
        case "container":
          return customsListBlock(spec, "containers") && { label: rule.label }
        default:
          // Lampiran selalu ada di form.
          return { label: rule.label }
      }
    }

    const problems = rules.flatMap((rule) => {
      const found = find(rule)
      if (!found) return [`${rule.target}:${rule.field} tidak ada di form`]
      if (found.label !== rule.label) {
        return [`${rule.target}:${rule.field} label "${rule.label}" ≠ form "${found.label}"`]
      }
      return []
    })
    expect(problems).toEqual([])
  })

  test("kantor pabean dokumen ada di form", () => {
    expect(customsDocumentFields(spec).some((field) => field.key === "customsOfficeCode")).toBe(
      true,
    )
  })
})
