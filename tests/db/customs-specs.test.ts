import { eq } from "drizzle-orm"
import { afterAll, describe, expect, test } from "vitest"

import { CUSTOMS_STATEMENT_FIELDS } from "@/modules/it-inventory/lib/customs-form"
import { CUSTOMS_SPECS } from "@/modules/it-inventory/lib/customs-specs"
import { db } from "@/server/db"
import { docValidationRules } from "@/server/db/schema"

// Form per jenis dokumen BC (M3-05–M3-09) harus bisa mengisi semua yang diwajibkan aturan
// validasi (M3-03); kalau tidak, dokumennya tidak pernah bisa Siap ajukan.

afterAll(async () => {
  await db.$client.end()
})

const snake = (key: string) => key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)

describe.each(Object.values(CUSTOMS_SPECS))("form $title", (spec) => {
  test("semua field wajib ada di form", async () => {
    const rules = await db
      .select()
      .from(docValidationRules)
      .where(eq(docValidationRules.docCode, spec.code))
    const headerFields = [...spec.header, ...spec.transaction, ...(spec.transport?.fields ?? [])]
    const columns = new Set([
      "customs_office_code",
      "notes",
      ...[...headerFields, ...CUSTOMS_STATEMENT_FIELDS]
        .filter((field) => !field.detail)
        .map((field) => snake(field.key)),
    ])
    const details = new Set(headerFields.filter((field) => field.detail).map((field) => field.key))
    const lineColumns = new Set(spec.line.filter((field) => !field.detail).map((f) => snake(f.key)))
    const parties = new Set(spec.parties.map((party) => party.code))

    const missing = rules.filter((rule) => {
      switch (rule.target) {
        case "header":
          return !columns.has(rule.field)
        case "details":
          return !details.has(rule.field)
        case "party":
          return !parties.has(rule.field)
        case "line":
          return !lineColumns.has(rule.field)
        case "transport":
          return !spec.transport
        case "container":
          return !spec.containers
        default:
          // Lampiran dan kemasan selalu ada di form.
          return false
      }
    })
    expect(missing.map((rule) => `${rule.target}:${rule.field}`)).toEqual([])
  })
})
