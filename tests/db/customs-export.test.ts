import { eq, like, sql } from "drizzle-orm"
import ExcelJS from "exceljs"
import { NextRequest } from "next/server"
import { PDFDocument } from "pdf-lib"
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest"

import { GET as exportList } from "@/app/api/customs-documents/export/route"
import { GET as exportDocument } from "@/app/api/customs-documents/[id]/export/route"
import type { Role } from "@/lib/permissions"
import { duplicateCustomsDocument } from "@/modules/it-inventory/actions/customs-documents"
import { BC23 } from "@/modules/it-inventory/lib/customs-specs"
import {
  getCustomsDocument,
  listCustomsDocuments,
} from "@/modules/it-inventory/server/queries/customs-documents"
import type { CurrentUser } from "@/server/auth/session"
import { db } from "@/server/db"
import {
  company,
  customsAttachments,
  customsDocuments,
  products,
  uomCategories,
  uoms,
} from "@/server/db/schema"

import {
  insertCompleteDocument,
  insertCustomsProduct,
  insertTestCompany,
  purgeCustomsDocuments,
} from "./customs-fixtures"

// Daftar per jenis dengan filter, duplikat, dan export draft PDF/Excel (backlog M3-13).

const session = vi.hoisted(() => ({ user: null as CurrentUser | null }))
vi.mock("@/server/auth/session", () => ({
  requireUser: async () => session.user,
  getApiUser: async () => session.user,
}))
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

const ids = { complete: "", other: "" }

beforeAll(async () => {
  await insertTestCompany(db)
  await db.transaction(async (tx) => {
    const product = await insertCustomsProduct(tx, "ZBX1")
    const doc = await insertCompleteDocument(tx, "23", product)
    await tx
      .update(customsAttachments)
      .set({ fileKey: `customs/${doc.id}/a.pdf`, fileName: "Invoice.pdf" })
      .where(eq(customsAttachments.documentId, doc.id))
    await tx.execute(sql`select refresh_customs_document_status(${doc.id})`)
    ids.complete = doc.id
    // Dokumen lain di kantor berbeda dan bertanggal aju tahun lalu.
    const [other] = await tx
      .insert(customsDocuments)
      .values({ docCode: "23", customsOfficeCode: "040300" })
      .returning({ id: customsDocuments.id })
    // Tanggal aju dikunci trigger; untuk data uji trigger dimatikan sementara.
    await tx.execute(sql`set local session_replication_role = replica`)
    await tx
      .update(customsDocuments)
      .set({ ajuDate: "2020-01-15" })
      .where(eq(customsDocuments.id, other.id))
    await tx.execute(sql`set local session_replication_role = origin`)
    ids.other = other.id
  })
})

afterAll(async () => {
  await purgeCustomsDocuments(db)
  await db.delete(products).where(like(products.sku, "ZBX%"))
  await db.delete(uoms).where(like(uoms.code, "ZBX%"))
  await db.delete(uomCategories).where(like(uomCategories.code, "ZBX%"))
  await db.delete(company)
  await db.$client.end()
})

const list = (filters: Partial<Parameters<typeof listCustomsDocuments>[0]> = {}) =>
  listCustomsDocuments({
    search: "",
    page: 1,
    pageSize: 20,
    offset: 0,
    docCode: "23",
    ...filters,
  }).then(({ rows }) => rows.map((row) => row.id).sort())

describe("daftar per jenis", () => {
  test("filter status, kantor, dan periode tanggal aju", async () => {
    expect(await list()).toEqual([ids.complete, ids.other].sort())
    expect(await list({ status: "ready" })).toEqual([ids.complete])
    expect(await list({ officeCode: "040300" })).toEqual([ids.other])
    expect(await list({ period: "bulan-ini" })).toEqual([ids.complete])
    expect(await list({ docCode: "25" })).toEqual([])
  })
})

describe("duplikat", () => {
  test("Draft baru dengan nomor aju baru, semua bagian tersalin kecuali file lampiran", async () => {
    loginAs(["staf_exim"])
    const result = await duplicateCustomsDocument({ id: ids.complete })
    if (!result.ok) throw new Error(result.errors.join("\n"))
    const [original, copy] = await Promise.all([
      getCustomsDocument(BC23, ids.complete),
      getCustomsDocument(BC23, result.data.id),
    ])
    expect(copy!.ajuNumber).not.toBe(original!.ajuNumber)
    expect(copy!.version).toBe(1)
    expect(copy!.draft.parties).toEqual(original!.draft.parties)
    expect(copy!.draft.lines).toEqual(original!.draft.lines)
    expect(copy!.draft.attachments).toEqual([{ ...original!.draft.attachments[0], file: null }])
    // Aturan invoice memeriksa baris lampiran (M3-03), bukan filenya.
    expect(copy!.status).toBe("ready")
  })
})

describe("export draft", () => {
  test("PDF dan Excel berisi semua bagian dokumen", async () => {
    loginAs(["auditor"])
    const request = (format: string) =>
      exportDocument(
        new NextRequest(
          `http://localhost/api/customs-documents/${ids.complete}/export?format=${format}`,
        ),
        { params: Promise.resolve({ id: ids.complete }) },
      )
    const doc = await getCustomsDocument(BC23, ids.complete)

    const pdf = await request("pdf")
    expect(pdf.status).toBe(200)
    expect(pdf.headers.get("content-disposition")).toBe(
      `attachment; filename="BC23-${doc!.ajuNumber}.pdf"`,
    )
    const loaded = await PDFDocument.load(await pdf.arrayBuffer())
    expect(loaded.getPageCount()).toBeGreaterThanOrEqual(1)
    expect(loaded.getTitle()).toBe(`BC 2.3 ${doc!.ajuNumber}`)

    const excel = await request("xlsx")
    expect(excel.status).toBe(200)
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(await excel.arrayBuffer())
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      "Dokumen",
      "Header",
      "Entitas",
      "Dokumen Lampiran",
      "Pengangkut",
      "Kemasan",
      "Peti Kemas",
      "Barang",
      "Dokumen Lartas",
      "Transaksi",
      "Pernyataan",
    ])
    const values = (name: string) =>
      workbook
        .getWorksheet(name)!
        .getSheetValues()
        .flatMap((row) => (Array.isArray(row) ? row.slice(1).map(String) : []))
    expect(values("Dokumen")).toEqual(expect.arrayContaining(["Nomor aju", doc!.ajuNumber]))
    expect(values("Barang")).toEqual(expect.arrayContaining(["ZBX1", "52081100"]))
    expect(values("Dokumen Lampiran")).toEqual(expect.arrayContaining(["Invoice.pdf"]))

    const invalid = await request("docx")
    expect(invalid.status).toBe(400)
  })
})

describe("export daftar BC", () => {
  test("mengikuti filter kantor, mengabaikan halaman, dan membuat PDF/Excel", async () => {
    loginAs(["auditor"])
    const doc = await getCustomsDocument(BC23, ids.other)
    const query = "docCode=23&kantor=040300&page=99"
    const excel = await exportList(
      new NextRequest(`http://localhost/api/customs-documents/export?${query}&format=xlsx`),
    )
    expect(excel.status).toBe(200)
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(await excel.arrayBuffer())
    const sheet = workbook.worksheets[0]
    expect(sheet.rowCount).toBe(2)
    expect(sheet.getCell("A2").value).toBe(doc!.ajuNumber)
    expect(excel.headers.get("content-disposition")).toContain("Daftar-BC23.xlsx")

    const pdf = await exportList(
      new NextRequest(`http://localhost/api/customs-documents/export?${query}&format=pdf`),
    )
    expect(pdf.status).toBe(200)
    const loaded = await PDFDocument.load(await pdf.arrayBuffer())
    expect(loaded.getTitle()).toBe("Daftar BC 2.3")
    expect(loaded.getPageCount()).toBeGreaterThan(0)
  })

  test("memvalidasi sesi, izin, jenis dokumen, dan format", async () => {
    const request = (query = "docCode=23&format=xlsx") =>
      exportList(new NextRequest(`http://localhost/api/customs-documents/export?${query}`))
    session.user = null
    expect((await request()).status).toBe(401)
    loginAs(["admin_gudang"])
    expect((await request()).status).toBe(403)
    loginAs(["auditor"])
    expect((await request("docCode=unknown&format=xlsx")).status).toBe(400)
    expect((await request("docCode=23&format=docx")).status).toBe(400)
  })
})
