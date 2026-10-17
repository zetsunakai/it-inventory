import { eq, like } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest"

import type { Role } from "@/lib/permissions"
import { saveCustomsDocument } from "@/modules/it-inventory/actions/customs-documents"
import {
  emptyDraft,
  type CustomsDocumentDraft,
  type CustomsFormSpec,
} from "@/modules/it-inventory/lib/customs-form"
import {
  getCustomsDocument,
  newCustomsDraft,
} from "@/modules/it-inventory/server/queries/customs-documents"
import type { CurrentUser } from "@/server/auth/session"
import { db } from "@/server/db"
import {
  company,
  customsDocumentLines,
  customsDocuments,
  products,
  uomCategories,
  uoms,
} from "@/server/db/schema"

import { CUSTOMS_TEST_OFFICE, insertTestCompany } from "./customs-fixtures"

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

const SPEC_IN: CustomsFormSpec = {
  code: "23",
  title: "BC 2.3",
  description: "Uji",
  path: "/dokumen-bc/bc23",
  header: [],
  parties: [
    { code: "3", label: "Pengusaha TPB", source: "company", permit: true },
    { code: "7", label: "Pemilik barang", source: "company" },
    { code: "5", label: "Pemasok", source: "partner", country: true },
  ],
  transport: { fields: [] },
  containers: true,
  transaction: [],
  line: [],
  taxes: ["BM", "PPN"],
}

const SPEC_OUT: CustomsFormSpec = {
  ...SPEC_IN,
  code: "30",
  title: "BC 3.0",
  path: "/dokumen-bc/bc30",
  parties: [
    { code: "2", label: "Eksportir", source: "company" },
    { code: "6", label: "Pembeli", source: "partner", country: true },
  ],
  taxes: null,
}

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
  await db.delete(customsDocuments)
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
      identityNumber: "0012345678901000000000",
      permitNumber: "KEP-1/2024",
    })
    expect(incoming.draft.header).toMatchObject({
      customsOfficeCode: CUSTOMS_TEST_OFFICE,
      signerName: "Budi",
    })
    expect(incoming.draft.lines[0].taxes.map((tax) => tax.levyTypeCode)).toEqual(["BM", "PPN"])

    const outgoing = await newCustomsDraft(SPEC_OUT, "Budi")
    expect(outgoing.draft.parties.map((party) => party.entityTypeCode)).toEqual(["2"])
  })
})

describe("saveCustomsDocument", () => {
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
        taxes: draft.lines[0].taxes.map((tax) => ({ ...tax, rate: "10", facilityCode: "3" })),
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
    expect(saved?.ajuNumber).toHaveLength(26)
    expect(saved?.draft.details).toEqual({ loadingPortCode: "CNSHA" })
    expect(saved?.draft.header.ndpbm).toBe("15750,5")
    expect(saved?.draft.parties.map((party) => party.entityTypeCode)).toEqual(["3", "7"])
    expect(saved?.draft.lines[0]).toMatchObject({
      hsCode: "52081100",
      description: "Kain katun",
      cifValue: "1200,5",
    })
    expect(saved?.draft.lines[0].taxes).toHaveLength(2)
    expect(saved?.draft.containers[0].number).toBe("MSKU1234567")
    expect(saved?.draft.attachments).toEqual([{ documentTypeCode: "380", number: "", date: "" }])

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
    const draft = emptyDraft(SPEC_IN)
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
        "Barang seri 1: Jumlah satuan harus angka, maksimal 4 desimal.",
        "Nomor peti kemas tidak boleh sama.",
      ]),
    )
  })

  test("hanya Draft yang bisa diubah, dan hanya peran dengan izin bc:write", async () => {
    loginAs(["auditor"])
    const empty = { ...emptyDraft(SPEC_OUT), lines: [] }
    const denied = await saveCustomsDocument(null, form("30", empty))
    expect(denied).toMatchObject({
      ok: false,
      errors: ["Anda tidak punya izin untuk melakukan aksi ini."],
    })

    loginAs(["staf_exim"])
    const created = await saveCustomsDocument(null, form("30", empty))
    if (!created.ok) throw new Error(created.errors.join("\n"))
    await db
      .update(customsDocuments)
      .set({ status: "cancelled", cancelledAt: new Date() })
      .where(eq(customsDocuments.id, created.data.id))
    const blocked = await saveCustomsDocument(null, form("30", empty, created.data.id))
    expect(blocked).toMatchObject({ ok: false, errors: ["Hanya dokumen Draft yang bisa diubah."] })
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
