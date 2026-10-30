import { describe, expect, test } from "vitest"
import { operatorsFor, parseCustomFilter, type ListField } from "./list-controls"

const fields: ListField[] = [
  { key: "name", label: "Nama", type: "text" },
  { key: "qty", label: "Qty", type: "number" },
  { key: "date", label: "Tanggal", type: "date" },
  { key: "active", label: "Aktif", type: "boolean" },
  {
    key: "status",
    label: "Status",
    type: "selection",
    options: [{ value: "draft", label: "Draft" }],
  },
]
const parse = (field: string, operator: string, value = "", end?: string) =>
  parseCustomFilter(
    JSON.stringify({ match: "all", conditions: [{ field, operator, value, end }] }),
    fields,
  )

describe("filter daftar bersama", () => {
  test("tidak ada filter dan operator sesuai tipe", () => {
    expect(parseCustomFilter(null, fields)).toEqual({ filter: null })
    expect(operatorsFor(fields[0])).toContain("contains")
    expect(operatorsFor(fields[1])).toContain("between")
    expect(operatorsFor(fields[3])).not.toContain("contains")
  })
  test("teks, angka negatif/desimal, tanggal, pilihan dan boolean", () => {
    for (const result of [
      parse("name", "contains", "Baja_%'"),
      parse("qty", "between", "-2.5", "100"),
      parse("date", "eq", "2026-10-30"),
      parse("active", "eq", "false"),
      parse("status", "eq", "draft"),
      parse("name", "empty"),
    ])
      expect(result.error).toBeUndefined()
  })
  test("menolak field/operator/nilai yang tidak diizinkan", () => {
    for (const result of [
      parse("password", "eq", "secret"),
      parse("qty", "contains", "1"),
      parse("qty", "eq", "NaN"),
      parse("qty", "eq", "1;drop table users"),
      parse("date", "eq", "2026-02-30"),
      parse("active", "eq", "yes"),
      parse("status", "eq", "approved"),
      parse("name", "contains", ""),
      parse("qty", "between", "10", "2"),
      parse("date", "between", "2026-10-30", "2026-10-01"),
    ])
      expect(result.error).toBeTruthy()
  })
  test("payload rusak, berlebihan dan kondisi kosong ditolak", () => {
    for (const raw of [
      "{",
      "x".repeat(8001),
      JSON.stringify({ match: "all", conditions: [] }),
      JSON.stringify({
        match: "any",
        conditions: Array.from({ length: 13 }, () => ({
          field: "name",
          operator: "eq",
          value: "a",
        })),
      }),
    ])
      expect(parseCustomFilter(raw, fields).error).toBeTruthy()
  })
  test("OR dipertahankan, bukan diubah diam-diam menjadi AND", () => {
    const result = parseCustomFilter(
      JSON.stringify({
        match: "any",
        conditions: [
          { field: "name", operator: "empty", value: "" },
          { field: "qty", operator: "gt", value: "0" },
        ],
      }),
      fields,
    )
    expect(result.filter?.match).toBe("any")
    expect(result.filter?.conditions).toHaveLength(2)
  })
})
