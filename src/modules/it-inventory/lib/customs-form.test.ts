import { describe, expect, test } from "vitest"

import { customsDraftChanges, emptyDraft, emptyLine, emptyParty } from "./customs-form"
import { BC23 } from "./customs-specs"

describe("customsDraftChanges", () => {
  test("versi sama: tidak ada perubahan", () => {
    expect(customsDraftChanges(BC23, emptyDraft(), emptyDraft())).toEqual([])
  })

  test("menyebut isian (label hmx), entitas, barang per seri, dan daftar lain, urut sesuai form", () => {
    const before = emptyDraft()
    const after = emptyDraft()
    after.header.ndpbm = "15000"
    after.details.bc11Number = "000123"
    after.parties = [{ ...emptyParty("5"), name: "Pemasok baru" }]
    after.lines = [after.lines[0], { ...emptyLine(), qty: "5" }]
    after.packages = [{ qty: "1", packageTypeCode: "RO", marks: "" }]
    expect(customsDraftChanges(BC23, before, after)).toEqual([
      "Nomor BC 1.1",
      "NDPBM",
      "Pemasok",
      "Barang seri 2",
      "Kemasan",
    ])
  })
})
