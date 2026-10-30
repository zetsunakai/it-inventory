import { eq, like, sql } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest"

import type { Role } from "@/lib/permissions"
import {
  saveCustomsDocument,
  duplicateCustomsDocument,
} from "@/modules/it-inventory/actions/customs-documents"
import {
  customsDocumentFields,
  customsLineFields,
  customsListBlock,
  emptyAttachment,
  emptyDraft,
  emptyParty,
  emptyRow,
  CUSTOMS_ROW_KEYS,
  customsFieldValue,
  setCustomsFieldValue,
  type CustomsDocumentDraft,
} from "@/modules/it-inventory/lib/customs-form"
import { BC20, BC23, BC261, BC30 } from "@/modules/it-inventory/lib/customs-specs"
import {
  getCustomsDocument,
  newCustomsDraft,
  requiredCustomsSpec,
} from "@/modules/it-inventory/server/queries/customs-documents"
import type { CurrentUser } from "@/server/auth/session"
import { statusDates } from "@/server/queries/activity"
import { db } from "@/server/db"
import {
  company,
  customsDocumentLines,
  customsDocumentTaxes,
  products,
  uomCategories,
  uoms,
} from "@/server/db/schema"
import { customsExportSections } from "@/modules/it-inventory/server/customs-export"

import {
  CUSTOMS_TEST_OFFICE,
  forceCustomsStatus,
  insertTestCompany,
  purgeCustomsDocuments,
} from "./customs-fixtures"

// Form dokumen BC bersama (backlog M3-04): simpan Draft lewat server action, entitas perusahaan
// terisi sesuai arah dokumen, isi dokumen dibaca kembali utuh untuk form.

const session = vi.hoisted(() => ({ user: null as CurrentUser | null }))
vi.mock("@/server/auth/session", () => ({ requireUser: async () => session.user }))
vi.mock("next/cache", () => ({ refresh: vi.fn() }))

function loginAs(roles: Role[]) {
  session.user = {
    id: crypto.randomUUID(),
    name: "Staf Exim",
    email: "exim@it-inventory.local",
    roles,
    twoFactorEnabled: true,
  }
}

// Pengusaha TPB dan pemilik dari profil perusahaan, pemasok dari partner (form hmx BC 2.3); BC 3.0
// hanya eksportir dari perusahaan.
const SPEC_IN = BC23
const SPEC_OUT = BC30

let productId = ""

beforeAll(async () => {
  await insertTestCompany(db)
  const [category] = await db
    .insert(uomCategories)
    .values({ code: "ZBFC", name: "Unit uji form BC" })
    .returning({ id: uomCategories.id })
  const [unit] = await db
    .insert(uoms)
    .values({ code: "ZBFU", name: "Buah", categoryId: category.id, factor: "1", isReference: true })
    .returning({ id: uoms.id })
  const [product] = await db
    .insert(products)
    .values({
      sku: "ZBF1",
      name: "Kain katun",
      category: "raw_material",
      uomId: unit.id,
      hsCode: "52081100",
    })
    .returning({ id: products.id })
  productId = product.id
})

afterAll(async () => {
  await purgeCustomsDocuments(db)
  await db.delete(products).where(like(products.sku, "ZBF%"))
  await db.delete(uoms).where(like(uoms.code, "ZBF%"))
  await db.delete(uomCategories).where(like(uomCategories.code, "ZBF%"))
  await db.delete(company)
  await db.$client.end()
})

function form(docCode: string, draft: CustomsDocumentDraft, id?: string) {
  const data = new FormData()
  data.set("docCode", docCode)
  data.set("document", JSON.stringify(draft))
  if (id) data.set("id", id)
  return data
}

describe("newCustomsDraft", () => {
  test("entitas perusahaan sesuai jenis dokumen, kantor pengawas, dan penandatangan", async () => {
    const incoming = await newCustomsDraft(SPEC_IN, "Budi")
    expect(incoming.companyReady).toBe(true)
    expect(incoming.draft.parties.map((party) => party.entityTypeCode)).toEqual(["3", "7"])
    expect(incoming.draft.parties[0]).toMatchObject({
      name: "PT Uji Berikat",
      identityTypeCode: "6",
      identityNumber: "0012345678901000",
      permitNumber: "KEP-1/2024",
      details: { nitku: "0012345678901000000000" },
    })
    expect(incoming.draft.header).toMatchObject({
      customsOfficeCode: CUSTOMS_TEST_OFFICE,
      signerName: "Budi",
    })

    const outgoing = await newCustomsDraft(SPEC_OUT, "Budi")
    expect(outgoing.draft.parties.map((party) => party.entityTypeCode)).toEqual(["2"])
  })
})

describe("saveCustomsDocument", () => {
  test("pungutan BC 2.0 memakai teks Nilai Pungutan tanpa jenis/tarif/status tersembunyi yang wajib", async () => {
    loginAs(["staf_exim"])
    const draft = emptyDraft()
    draft.lines = []
    draft.taxes = [
      { ...emptyRow(CUSTOMS_ROW_KEYS.taxes), taxValue: "BM", paidAmount: "125,50" },
      { ...emptyRow(CUSTOMS_ROW_KEYS.taxes), taxValue: "PPN", governmentBorneAmount: "25" },
    ]
    const created = await saveCustomsDocument(null, form("20", draft))
    if (!created.ok) throw new Error(created.errors.join("\n"))
    const saved = await getCustomsDocument(BC20, created.data.id)
    expect(saved!.draft.taxes).toMatchObject([
      { taxValue: "BM", levyTypeCode: "", paidAmount: "125.5", rate: "", amount: "", status: "" },
      { taxValue: "PPN", levyTypeCode: "", governmentBorneAmount: "25" },
    ])
    const copied = await duplicateCustomsDocument({ id: created.data.id })
    if (!copied.ok) throw new Error(copied.errors.join("\n"))
    const duplicate = await getCustomsDocument(BC20, copied.data.id)
    expect(duplicate!.draft.taxes).toEqual(saved!.draft.taxes)
    saved!.draft.taxes[0].taxValue = ""
    expect(
      await saveCustomsDocument(null, form("20", saved!.draft, created.data.id)),
    ).toMatchObject({ ok: true })
    expect((await getCustomsDocument(BC20, created.data.id))!.draft.taxes[0].taxValue).toBe("")
    expect(await saveCustomsDocument(null, form("25", draft))).toMatchObject({
      ok: false,
      errors: ["Jenis pungutan wajib dipilih."],
    })
  })

  test("field tambahan BC 2.0 tersimpan, terbaca readonly/export, dan bisa diubah tanpa perhitungan otomatis", async () => {
    loginAs(["staf_exim"])
    let { draft } = await newCustomsDraft(BC20, "Budi")
    draft.lines = []
    for (const [role, value] of [
      ["1", "SG"],
      ["7", "ID"],
      ["11", "ID"],
    ]) {
      const field = customsDocumentFields(BC20).find(
        (field) => field.role === role && field.key === "countryCode",
      )!
      draft = setCustomsFieldValue(draft, field, value)
    }
    draft = setCustomsFieldValue(
      draft,
      customsDocumentFields(BC20).find((field) => field.role === "1" && field.key === "nib")!,
      "1234567890123",
    )
    draft.parties.push({
      ...emptyParty("4"),
      name: "PPJK uji BC20",
      address: "Jakarta",
      countryCode: "ID",
      identityTypeCode: "6",
      identityNumber: "0012345678901000",
    })
    draft.details = {
      disclaimer: "0",
      voluntaryDeclarationFlag: "T",
      voluntaryDeclarationValue: "0",
    }
    draft.bankAccounts = [{ code: "", bankCode: "000" }]
    draft.taxes = [
      {
        ...emptyRow(CUSTOMS_ROW_KEYS.taxes),
        levyTypeCode: "BM",
        amount: "999",
        paidAmount: "100,25",
        governmentBorneAmount: "50",
        deferredAmount: "0",
        notCollectedAmount: "10.50",
        exemptedAmount: "",
        settledAmount: "25",
      },
    ]
    const created = await saveCustomsDocument(null, form("20", draft))
    expect(created.ok).toBe(true)
    if (!created.ok) throw new Error(created.errors.join("\n"))
    const saved = await getCustomsDocument(BC20, created.data.id)
    expect(saved!.draft.details).toEqual(draft.details)
    expect(saved!.draft.parties.find((party) => party.entityTypeCode === "4")).toMatchObject({
      name: "PPJK uji BC20",
      address: "Jakarta",
      countryCode: "ID",
      identityTypeCode: "6",
      identityNumber: "0012345678901000",
    })
    expect(saved!.draft.bankAccounts).toEqual([{ code: "", bankCode: "000" }])
    expect(saved!.draft.taxes[0]).toMatchObject({
      amount: "999",
      paidAmount: "100.25",
      governmentBorneAmount: "50",
      deferredAmount: "0.0",
      notCollectedAmount: "10.5",
      exemptedAmount: "",
      settledAmount: "25",
    })
    const nib = customsDocumentFields(BC20).find(
      (field) => field.role === "1" && field.key === "nib",
    )!
    expect(customsFieldValue(saved!.draft, nib)).toBe("1234567890123")
    const sections = customsExportSections(BC20, { ...saved!, companyName: "PT Uji Berikat" })
    const output = JSON.stringify(sections)
    for (const text of [
      "PPJK uji BC20",
      "1234567890123",
      "Bank devisa",
      "INDONESIA EXIMBANK",
      "Ditanggung Pemerintah",
      "100,25",
    ])
      expect(output).toContain(text)

    saved!.draft.details.disclaimer = "1"
    saved!.draft.details.voluntaryDeclarationFlag = "Y"
    saved!.draft.taxes[0].paidAmount = "200"
    const updated = await saveCustomsDocument(null, form("20", saved!.draft, saved!.id))
    expect(updated.ok).toBe(true)
    const reread = await getCustomsDocument(BC20, saved!.id)
    expect(reread!.draft.details).toMatchObject({ disclaimer: "1", voluntaryDeclarationFlag: "Y" })
    expect(reread!.draft.taxes[0]).toMatchObject({ amount: "999", paidAmount: "200" })
    const stored = await db
      .select()
      .from(customsDocumentTaxes)
      .where(eq(customsDocumentTaxes.documentId, saved!.id))
    expect(stored).toHaveLength(1)
    expect(stored[0]).toMatchObject({ paidAmount: "200.00", governmentBorneAmount: "50.00" })
  })

  test("tambahan BC 2.0 boleh kosong dan kode pilihan baru tidak boleh sembarang", async () => {
    loginAs(["staf_exim"])
    const draft = emptyDraft()
    draft.lines = []
    const saved = await saveCustomsDocument(null, form("20", draft))
    expect(saved.ok).toBe(true)
    const invalidDetails: Record<string, string>[] = [
      { disclaimer: "Y" },
      { voluntaryDeclarationFlag: "1" },
    ]
    for (const details of invalidDetails) {
      expect(await saveCustomsDocument(null, form("20", { ...draft, details }))).toMatchObject({
        ok: false,
      })
    }
  })
  test("dokumen baru tersimpan sebagai Draft dengan semua bagiannya, lalu bisa diubah", async () => {
    loginAs(["staf_exim"])
    const { draft } = await newCustomsDraft(SPEC_IN, "Budi")
    draft.details = { loadingPortCode: "CNSHA", bc11Number: " " }
    draft.header.ndpbm = "15.750,5".replace(".", "")
    draft.lines = [
      {
        ...draft.lines[0],
        productId,
        product: { id: productId, sku: "ZBF1", name: "Kain katun" },
        qty: "100",
        ceisaUnitCode: "MTR",
        stockQty: "100",
        cifValue: "1200,50",
        details: { originLocationCode: "3201" },
        attachments: [{ ...emptyAttachment("911"), number: "LARTAS-1" }],
      },
    ]
    draft.taxes = [
      {
        ...emptyRow(CUSTOMS_ROW_KEYS.taxes),
        levyTypeCode: "BM",
        rate: "10",
        amount: "100000",
        status: "computed",
      },
      {
        ...emptyRow(CUSTOMS_ROW_KEYS.taxes),
        levyTypeCode: "PPN",
        rate: "11",
        amount: "",
        status: "",
      },
    ]
    draft.packages = [{ qty: "10", packageTypeCode: "RO", marks: "" }]
    draft.containers = [{ number: "msku1234567", sizeCode: "40", typeCode: "", loadTypeCode: "8" }]
    draft.transports = [
      { transportModeCode: "1", name: "EVER GIVEN", voyageNumber: "", flagCountryCode: "" },
    ]

    const created = await saveCustomsDocument(null, form("23", draft))
    expect(created).toMatchObject({ ok: true })
    if (!created.ok) return
    const saved = await getCustomsDocument(SPEC_IN, created.data.id)
    expect(saved).toMatchObject({ status: "draft", docCode: "23" })
    expect(saved?.number).toMatch(/^IT\/23\/\d{5}$/)
    expect(saved?.ajuNumber).toBeNull()
    expect(saved?.draft.details).toEqual({ loadingPortCode: "CNSHA" })
    expect(saved?.draft.header.ndpbm).toBe("15750.5")
    expect(saved?.draft.parties.map((party) => party.entityTypeCode)).toEqual(["3", "7"])
    expect(saved?.draft.lines[0]).toMatchObject({
      hsCode: "52081100",
      description: "Kain katun",
      cifValue: "1200.5",
    })
    expect(saved?.draft.lines[0].details).toEqual({ originLocationCode: "3201" })
    expect(saved?.draft.lines[0].attachments).toEqual([
      { ...emptyAttachment("911"), number: "LARTAS-1" },
    ])
    expect(saved?.draft.taxes).toEqual([
      {
        ...emptyRow(CUSTOMS_ROW_KEYS.taxes),
        levyTypeCode: "BM",
        rate: "10",
        amount: "100000",
        status: "computed",
      },
      {
        ...emptyRow(CUSTOMS_ROW_KEYS.taxes),
        levyTypeCode: "PPN",
        rate: "11",
        amount: "",
        status: "",
      },
    ])
    expect(saved?.draft.containers[0].number).toBe("MSKU1234567")
    expect(saved?.draft.attachments).toEqual([emptyAttachment("380")])

    // Ubah: bagian diganti seluruhnya, nomor aju tetap.
    const changed = { ...saved!.draft, lines: [], containers: [] }
    const updated = await saveCustomsDocument(null, form("23", changed, created.data.id))
    expect(updated).toMatchObject({ ok: true })
    const reread = await getCustomsDocument(SPEC_IN, created.data.id)
    expect(reread?.ajuNumber).toBe(saved?.ajuNumber)
    expect(reread?.draft.lines).toEqual([])
    expect(reread?.draft.containers).toEqual([])
  })

  test("input salah dilaporkan sekaligus", async () => {
    loginAs(["staf_exim"])
    const draft = emptyDraft()
    draft.header.ndpbm = "abc"
    draft.header.signedDate = "17/10/2026"
    draft.lines[0].productId = productId
    draft.lines[0].qty = "-1"
    draft.containers = [
      { number: "A1", sizeCode: "", typeCode: "", loadTypeCode: "" },
      { number: "a1", sizeCode: "", typeCode: "", loadTypeCode: "" },
    ]
    const result = await saveCustomsDocument(null, form("23", draft))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.errors).toEqual(
      expect.arrayContaining([
        "NDPBM harus angka, maksimal 4 desimal.",
        "Tanggal pernyataan tidak valid.",
        "Barang seri 1: Jumlah harus angka, maksimal 4 desimal.",
        "Nomor peti kemas tidak boleh sama.",
      ]),
    )
  })

  test("hanya Draft yang bisa diubah, dan hanya peran dengan izin bc:write", async () => {
    loginAs(["auditor"])
    const empty = { ...emptyDraft(), lines: [] }
    const denied = await saveCustomsDocument(null, form("30", empty))
    expect(denied).toMatchObject({
      ok: false,
      errors: ["Anda tidak punya izin untuk melakukan aksi ini."],
    })

    loginAs(["staf_exim"])
    const created = await saveCustomsDocument(null, form("30", empty))
    if (!created.ok) throw new Error(created.errors.join("\n"))
    await db.transaction((tx) =>
      forceCustomsStatus(tx, created.data.id, { status: "submitted", submittedAt: new Date() }),
    )
    // Tanggal tiap status untuk kartu status (dari audit log).
    expect(Object.keys(await statusDates("customs_documents", created.data.id)).sort()).toEqual([
      "draft",
      "submitted",
    ])
    const blocked = await saveCustomsDocument(null, form("30", empty, created.data.id))
    expect(blocked).toMatchObject({
      ok: false,
      errors: ["Dokumen sudah Submitted dan tidak dapat diubah atau dihapus."],
    })
    // Jenis lain dengan id yang sama tidak ditemukan.
    const wrongKind = await saveCustomsDocument(null, form("23", empty, created.data.id))
    expect(wrongKind).toMatchObject({ ok: false, errors: ["Dokumen tidak ditemukan."] })
    expect(
      await db
        .select({ id: customsDocumentLines.id })
        .from(customsDocumentLines)
        .where(eq(customsDocumentLines.documentId, created.data.id)),
    ).toEqual([])
  })
})

describe("bagian khusus form hmx", () => {
  test("pemilik barang berseri, bank devisa, jaminan, dan Voluntary Declaration tersimpan utuh", async () => {
    loginAs(["staf_exim"])
    const line = {
      ...emptyDraft().lines[0],
      productId,
      product: { id: productId, sku: "ZBF1", name: "Kain katun" },
      qty: "5",
      stockQty: "5",
    }

    const exportDoc = { ...emptyDraft(), lines: [line] }
    exportDoc.parties = [
      { ...emptyParty("7"), name: "Pemilik A", details: { nitku: "1".repeat(22) } },
      { ...emptyParty("7"), name: "Pemilik B" },
    ]
    exportDoc.bankAccounts = [{ code: "R1", bankCode: "008" }]
    const exported = await saveCustomsDocument(null, form("30", exportDoc))
    if (!exported.ok) throw new Error(exported.errors.join("\n"))
    const saved30 = await getCustomsDocument(BC30, exported.data.id)
    expect(saved30?.draft.parties.map((party) => [party.name, party.details])).toEqual([
      ["Pemilik A", { nitku: "1".repeat(22) }],
      ["Pemilik B", {}],
    ])
    expect(saved30?.draft.bankAccounts).toEqual([{ code: "R1", bankCode: "008" }])

    const temporary = { ...emptyDraft(), lines: [line] }
    temporary.guarantees = [
      {
        typeCode: "2",
        number: "BG-1",
        date: "2026-10-18",
        value: "5000000",
        dueDate: "2027-01-18",
        guarantor: "Bank Uji",
        bpjNumber: "",
        bpjDate: "",
      },
    ]
    const created261 = await saveCustomsDocument(null, form("261", temporary))
    if (!created261.ok) throw new Error(created261.errors.join("\n"))
    const saved261 = await getCustomsDocument(BC261, created261.data.id)
    expect(saved261?.draft.guarantees).toEqual(temporary.guarantees)

    const imported = {
      ...emptyDraft(),
      lines: [
        {
          ...line,
          vdEntries: [
            { valuationTypeCode: "ROY", dueDate: "2026-12-31", amount: "1000" },
            { valuationTypeCode: "", dueDate: "", amount: "" },
          ],
        },
      ],
    }
    const created20 = await saveCustomsDocument(null, form("20", imported))
    if (!created20.ok) throw new Error(created20.errors.join("\n"))
    const saved20 = await getCustomsDocument(BC20, created20.data.id)
    expect(saved20?.draft.lines[0].vdEntries).toEqual([
      { valuationTypeCode: "ROY", dueDate: "2026-12-31", amount: "1000" },
    ])

    // Duplikat ikut menyalin jaminan.
    const {
      rows: [copy],
    } = await db.execute<{ id: string }>(
      sql`select duplicate_customs_document(${created261.data.id}) as id`,
    )
    const duplicated = await getCustomsDocument(BC261, copy.id)
    expect(duplicated?.draft.guarantees).toEqual(temporary.guarantees)
  })
})

test("field mandatory mengikuti aturan BC tanpa mengubah spec asli", async () => {
  const spec = await requiredCustomsSpec(BC23)
  const fields = customsDocumentFields(spec)
  expect(
    fields.find((field) => field.store === "header" && field.key === "grossWeight")?.required,
  ).toBe(true)
  expect(
    fields.find((field) => field.store === "details" && field.key === "loadingPortCode")?.required,
  ).toBe(true)
  expect(
    fields.find((field) => field.store === "party" && field.role === "5" && field.key === "name")
      ?.required,
  ).toBe(true)
  expect(customsLineFields(spec).find((field) => field.key === "hsCode")?.required).toBe(true)
  expect(
    customsListBlock(spec, "packages")?.columns.find((field) => field.key === "packageTypeCode")
      ?.required,
  ).toBe(true)
  expect(customsDocumentFields(BC23).some((field) => field.required)).toBe(false)
  expect(fields.some((field) => !field.required)).toBe(true)
})
