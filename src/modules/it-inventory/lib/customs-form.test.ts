import { describe, expect, test } from "vitest"

import { customsDraftChanges, emptyDraft, emptyLine } from "./customs-form"
import { BC23 } from "./customs-specs"

describe("customsDraftChanges", () => {
  test("versi sama: tidak ada perubahan", () => {
    expect(customsDraftChanges(BC23, emptyDraft(BC23), emptyDraft(BC23))).toEqual([])
  })

  test("menyebut isian header, details, entitas, barang per seri, dan bagian lain", () => {
    const before = emptyDraft(BC23)
    const after = emptyDraft(BC23)
    after.header.ndpbm = "15000"
    after.details.bc11Number = "000123"
    after.parties = [{ ...emptyParty(), entityTypeCode: "5", name: "Pemasok baru" }]
    after.lines = [after.lines[0], { ...emptyLine(BC23.taxes), qty: "5" }]
    after.packages = [{ qty: "1", packageTypeCode: "RO", marks: "" }]
    expect(customsDraftChanges(BC23, before, after)).toEqual([
      "Nomor BC 1.1",
      "NDPBM (kurs)",
      "Entitas Pemasok",
      "Barang seri 2",
      "Kemasan",
    ])
  })
})

function emptyParty() {
  return {
    entityTypeCode: "",
    partnerId: null,
    name: "",
    address: "",
    countryCode: "",
    identityTypeCode: "",
    identityNumber: "",
    nib: "",
    permitNumber: "",
    permitDate: "",
  }
}
