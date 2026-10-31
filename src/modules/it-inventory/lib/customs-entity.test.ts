import { describe, expect, test } from "vitest"

import { CUSTOMS_DOC_CODES } from "./customs"
import { CUSTOMS_ENTITY_CHOICES, CUSTOMS_ENTITY_DOCUMENTS } from "./customs-entity"
import { CUSTOMS_SPECS } from "./customs-specs"

describe("pemilihan jenis dokumen berdasar entitas", () => {
  test("mengikuti daftar pada devtask Velt-inc", () => {
    expect(CUSTOMS_ENTITY_DOCUMENTS).toEqual({
      Importir: ["20"],
      Eksportir: ["30"],
      PPJK: ["16", "20", "23", "28", "30", "33"],
      PLB: ["16", "261", "262", "27", "331", "40", "41"],
      "Importir PLB": ["28"],
      "Eksportir PLB": ["33"],
    })
  })

  test("semua pilihan punya jenis valid dan membuka form spesifik yang ada", () => {
    for (const entity of CUSTOMS_ENTITY_CHOICES) {
      for (const doc of entity.documents) {
        expect(CUSTOMS_DOC_CODES).toContain(doc.code)
        expect(CUSTOMS_SPECS[doc.code].path).toBe(doc.path)
      }
    }
  })
})
