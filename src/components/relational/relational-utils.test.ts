import { describe, expect, it } from "vitest"
import { identifyRelations, newRelation, relationKey, sumDecimals } from "./relational-utils"

describe("identitas baris relasi", () => {
  it("tetap melekat setelah edit, hapus baris sebelumnya, dan pindah urutan tanpa masuk payload", () => {
    const original = {
      lines: [
        { name: "A", children: [{ name: "anak" }] },
        { name: "B", children: [] },
      ],
    }
    const draft = identifyRelations(original)
    const second = relationKey(draft.lines[1])
    const edited = { ...draft.lines[1], name: "B diedit" }
    const reordered = [edited, draft.lines[0]].filter((row) => row.name !== "A")
    expect(relationKey(reordered[0])).toBe(second)
    expect(relationKey(draft.lines[0].children[0])).not.toBe(relationKey(draft.lines[0]))
    expect(JSON.parse(JSON.stringify(draft))).toEqual(original)
    expect(Object.getOwnPropertySymbols(original.lines[0])).toHaveLength(0)
  })
  it("membedakan baris baru dan mempertahankan identitas saat dinormalisasi ulang", () => {
    const a = newRelation({ name: "A" }),
      b = newRelation({ name: "A" })
    expect(relationKey(a)).not.toBe(relationKey(b))
    expect(relationKey(identifyRelations(a))).toBe(relationKey(a))
  })
})

describe("total desimal tampilan", () => {
  it("menjumlahkan pecahan dan angka besar secara eksak", () => {
    expect(sumDecimals(["0,1", "0.2"])).toBe("0.3")
    expect(sumDecimals(["9007199254740993.01", "0.02"])).toBe("9007199254740993.03")
    expect(sumDecimals(["-2.125", "1.1", "", "abc"])).toBe("-1.025")
    expect(sumDecimals([])).toBe("0")
  })
})
