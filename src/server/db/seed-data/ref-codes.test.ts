import { readFileSync } from "node:fs"
import path from "node:path"

import { parse } from "csv-parse/sync"
import { describe, expect, test } from "vitest"

import { REF_CODE_PARENT_TYPES, REF_CODE_TYPES, type RefCodeType } from "@/lib/ref-codes"

// Integritas CSV seed referensi kepabeanan. Kesalahan di sini membuat seed gagal saat
// instalasi, jadi dicek lebih dulu tanpa database.

type Row = { code: string; name: string; parent_code?: string }

function rows(type: RefCodeType): Row[] {
  return parse(readFileSync(path.join(import.meta.dirname, "ref-codes", `${type}.csv`)), {
    columns: true,
    skip_empty_lines: true,
  })
}

describe.each(REF_CODE_TYPES)("%s.csv", (type) => {
  const data = rows(type)
  const parentType = REF_CODE_PARENT_TYPES[type]

  test("tidak kosong, kode dan nama terisi tanpa spasi berlebih", () => {
    expect(data.length).toBeGreaterThan(0)
    for (const row of data) {
      expect(row.code).toBe(row.code.trim())
      expect(row.code).not.toBe("")
      expect(row.name.trim()).not.toBe("")
    }
  })

  test("kode unik (per induk untuk jenis yang punya induk)", () => {
    const keys = data.map((row) => `${row.parent_code ?? ""}|${row.code}`)
    expect(new Set(keys).size).toBe(keys.length)
  })

  test("parent_code terisi tepat untuk jenis yang punya induk, dan induknya ada", () => {
    if (!parentType) {
      expect(data.every((row) => !row.parent_code)).toBe(true)
      return
    }
    const parents = new Set(rows(parentType).map((row) => row.code))
    const missing = [...new Set(data.map((row) => row.parent_code ?? ""))].filter(
      (code) => !parents.has(code),
    )
    expect(missing).toEqual([])
  })
})
