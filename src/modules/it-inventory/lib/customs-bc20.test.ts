import { describe, expect, test } from "vitest"

import {
  CUSTOMS_OPTION_LISTS,
  CUSTOMS_TAX_PAYMENT_FIELDS,
  customsDocumentFields,
  customsListBlock,
  customsDocumentInputSchema,
  emptyDraft,
} from "./customs-form"
import { BC20, BC25 } from "./customs-specs"

describe("kelengkapan field BC 2.0 Equip3", () => {
  const fields = customsDocumentFields(BC20)
  test("PPJK bisa dipilih dari partner tanpa menambah field wajib", () => {
    expect(BC20.parties.find((party) => party.code === "4")).toEqual({
      code: "4",
      label: "PPJK",
      source: "partner",
    })
    const ppjk = fields.filter((field) => field.role === "4")
    expect(ppjk.map((field) => field.key)).toEqual([
      "identityTypeCode",
      "identityNumber",
      "name",
      "address",
      "countryCode",
    ])
    expect(ppjk.every((field) => !field.required)).toBe(true)
  })
  test("NIB importir dan negara perusahaan tersedia tanpa duplikasi binding", () => {
    expect(fields.find((field) => field.role === "1" && field.key === "nib")).toMatchObject({
      store: "party",
      kind: "text",
    })
    for (const role of ["1", "7", "11"])
      expect(
        fields.find((field) => field.role === role && field.key === "countryCode"),
      ).toMatchObject({ store: "party", kind: "ref", refType: "country" })
    const bindings = fields.map((field) => `${field.store}:${field.role ?? ""}:${field.key}`)
    // Pelabuhan tujuan memang dipakai dua kali pada form sumber (Header dan Pengangkut).
    for (const key of [
      "party:1:nib",
      "party:1:countryCode",
      "party:7:countryCode",
      "party:11:countryCode",
      "details::disclaimer",
      "details::voluntaryDeclarationFlag",
    ])
      expect(bindings.filter((binding) => binding === key)).toHaveLength(1)
  })
  test("flag terpisah dari nominal VD, kode Ya/Tidak sesuai payload Equip3", () => {
    expect(fields.find((field) => field.key === "disclaimer")).toMatchObject({
      kind: "option",
      list: "submissionConsent",
      store: "details",
    })
    expect(fields.find((field) => field.key === "voluntaryDeclarationFlag")).toMatchObject({
      kind: "option",
      list: "voluntaryDeclaration",
      store: "details",
    })
    expect(fields.filter((field) => field.key === "voluntaryDeclarationValue")).toHaveLength(1)
    expect(CUSTOMS_OPTION_LISTS.submissionConsent).toEqual([
      ["1", "Ya"],
      ["0", "Tidak"],
    ])
    expect(CUSTOMS_OPTION_LISTS.voluntaryDeclaration).toEqual([
      ["Y", "Ya"],
      ["T", "Tidak"],
    ])
  })
  test("bank devisa dan enam nominal pungutan memakai renderer daftar bersama", () => {
    expect(customsListBlock(BC20, "bankAccounts")?.columns).toEqual([
      { key: "bankCode", label: "Bank devisa", kind: "option", list: "bankDevisa" },
    ])
    const bankCodes = CUSTOMS_OPTION_LISTS.bankDevisa.map(([code]) => code)
    expect(new Set(bankCodes).size).toBe(bankCodes.length)
    const columns = customsListBlock(BC20, "taxes")!.columns
    expect(columns).toHaveLength(7)
    expect(columns[0]).toEqual({ key: "taxValue", label: "Nilai Pungutan", kind: "text" })
    expect(columns.map((column) => column.key)).not.toContain("levyTypeCode")
    expect(columns.map((column) => column.key)).not.toContain("rate")
    expect(columns.map((column) => column.key)).not.toContain("status")
    expect(columns.slice(-6)).toEqual(
      CUSTOMS_TAX_PAYMENT_FIELDS.map((field) => ({ ...field, kind: "money" })),
    )
    expect(customsListBlock(BC25, "taxes")!.columns.map((field) => field.key)).not.toContain(
      "governmentBorneAmount",
    )
  })
  test("payload pungutan lama tetap diterima; nilai baru opsional dan tervalidasi", () => {
    const draft = {
      ...emptyDraft(),
      lines: [],
      attachments: [],
      taxes: [{ levyTypeCode: "BM", rate: "", amount: "", status: "" }],
    }
    const parsed = customsDocumentInputSchema.parse(draft)
    expect(parsed.taxes[0].paidAmount).toBeNull()
    for (const field of CUSTOMS_TAX_PAYMENT_FIELDS) {
      const valid = customsDocumentInputSchema.parse({
        ...draft,
        taxes: [{ ...draft.taxes[0], [field.key]: "100,25" }],
      })
      expect(valid.taxes[0][field.key]).toBe("100.25")
      expect(
        customsDocumentInputSchema.safeParse({
          ...draft,
          taxes: [{ ...draft.taxes[0], [field.key]: "-1" }],
        }).success,
      ).toBe(false)
    }
  })
})
