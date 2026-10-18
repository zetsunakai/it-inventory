import { eq, sql } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, test } from "vitest"

import { db } from "@/server/db"
import { company, customsDocumentLines } from "@/server/db/schema"

import {
  insertCompleteDocument,
  insertCustomsProduct,
  insertTestCompany,
  registerDocument,
} from "./customs-fixtures"
import { inRollback, pgErrorInSavepoint } from "./helpers"

// Alokasi dokumen asal (backlog M4-03, PRD 8.5): pasangan jenis, produk sama, tidak melebihi sisa
// saldo asal, saran FIFO, dan alokasi lengkap sebagai syarat Siap ajukan dokumen keluar.

type Tx = Parameters<Parameters<typeof inRollback>[1]>[0]

beforeAll(async () => {
  await insertTestCompany(db)
})

afterAll(async () => {
  await db.delete(company)
  await db.$client.end()
})

async function firstLine(tx: Tx, documentId: string) {
  const [line] = await tx
    .select()
    .from(customsDocumentLines)
    .where(eq(customsDocumentLines.documentId, documentId))
  return line
}

// Dokumen masuk Terdaftar (qty 100 satuan stok) sebagai saldo asal.
async function origin(tx: Tx, code: "23" | "40", productId: string) {
  const doc = await insertCompleteDocument(tx, code, productId)
  await registerDocument(tx, doc.id, doc.ajuDate)
  return { doc, line: await firstLine(tx, doc.id) }
}

// Dokumen keluar Draft (qty 100) tanpa alokasi.
async function outgoing(tx: Tx, code: "25" | "30" | "41", productId: string) {
  const doc = await insertCompleteDocument(tx, code, productId)
  const line = await firstLine(tx, doc.id)
  await allocate(tx, line.id, [])
  return { doc, line }
}

function allocate(tx: Tx, lineId: string, items: { origin_line_id: string; qty: string }[]) {
  return tx.execute(sql`select allocate_origin(${lineId}, ${JSON.stringify(items)}::jsonb)`)
}

async function remaining(tx: Tx, lineId: string) {
  const { rows } = await tx.execute<{ remaining: string }>(
    sql`select remaining from customs_origin_balances where line_id = ${lineId}`,
  )
  return Number(rows[0].remaining)
}

describe("allocate_origin", () => {
  test("BC 4.1 hanya dari BC 4.0; produk harus sama; asal harus Terdaftar", async () => {
    await inRollback(db, async (tx) => {
      const product = await insertCustomsProduct(tx, "ZOP1")
      const other = await insertCustomsProduct(tx, "ZOP2")
      const bc23 = await origin(tx, "23", product)
      const bc40Other = await origin(tx, "40", other)
      const draft40 = await insertCompleteDocument(tx, "40", product)
      const out = await outgoing(tx, "41", product)

      const error = (items: { origin_line_id: string; qty: string }[]) =>
        pgErrorInSavepoint(tx, (sp) => allocate(sp, out.line.id, items))
      expect(await error([{ origin_line_id: bc23.line.id, qty: "10" }])).toBe(
        "BC 4.1 tidak bisa mengambil asal dari BC 2.3.",
      )
      expect(await error([{ origin_line_id: bc40Other.line.id, qty: "10" }])).toBe(
        `Barang seri 1 dan asalnya (${bc40Other.doc.ajuNumber} seri 1) bukan produk yang sama.`,
      )
      const draftLine = await firstLine(tx, draft40.id)
      expect(await error([{ origin_line_id: draftLine.id, qty: "10" }])).toBe(
        `Dokumen asal ${draft40.ajuNumber} belum Terdaftar.`,
      )
    })
  })

  test("tidak melebihi sisa saldo asal maupun qty baris; batal mengembalikan saldo", async () => {
    await inRollback(db, async (tx) => {
      const product = await insertCustomsProduct(tx, "ZOP1")
      const source = await origin(tx, "23", product)
      const first = await outgoing(tx, "25", product)
      const second = await outgoing(tx, "30", product)

      await allocate(tx, first.line.id, [{ origin_line_id: source.line.id, qty: "70" }])
      expect(await remaining(tx, source.line.id)).toBe(30)
      expect(
        await pgErrorInSavepoint(tx, (sp) =>
          allocate(sp, second.line.id, [{ origin_line_id: source.line.id, qty: "40" }]),
        ),
      ).toBe(`Alokasi 40 melebihi sisa saldo asal ${source.doc.ajuNumber} seri 1 (sisa 30).`)
      expect(
        await pgErrorInSavepoint(tx, (sp) =>
          allocate(sp, second.line.id, [{ origin_line_id: source.line.id, qty: "101" }]),
        ),
      ).toBe("Total alokasi 101 melebihi qty barang seri 1 (100).")

      await tx.execute(sql`select cancel_customs_document(${first.doc.id})`)
      expect(await remaining(tx, source.line.id)).toBe(100)
    })
  })

  test("alokasi lengkap jadi syarat Siap ajukan; terkunci setelah diajukan", async () => {
    await inRollback(db, async (tx) => {
      const product = await insertCustomsProduct(tx, "ZOP1")
      const source = await origin(tx, "40", product)
      const out = await outgoing(tx, "41", product)
      const { rows } = await tx.execute<{ errors: string[] }>(
        sql`select customs_document_errors(${out.doc.id}) as errors`,
      )
      expect(rows[0].errors).toEqual(["Barang seri 1: dokumen asal baru dialokasikan 0 dari 100."])

      await allocate(tx, out.line.id, [{ origin_line_id: source.line.id, qty: "100" }])
      await tx.execute(sql`select refresh_customs_document_status(${out.doc.id})`)
      await tx.execute(sql`select submit_customs_document(${out.doc.id})`)
      expect(await pgErrorInSavepoint(tx, (sp) => allocate(sp, out.line.id, []))).toBe(
        `Dokumen BC ${out.doc.ajuNumber} sudah Diajukan dan tidak bisa diubah.`,
      )
    })
  })

  test("produk baris dokumen keluar diganti: alokasinya dihapus", async () => {
    await inRollback(db, async (tx) => {
      const product = await insertCustomsProduct(tx, "ZOP1")
      const other = await insertCustomsProduct(tx, "ZOP2")
      const source = await origin(tx, "23", product)
      const out = await outgoing(tx, "25", product)
      await allocate(tx, out.line.id, [{ origin_line_id: source.line.id, qty: "50" }])
      await tx
        .update(customsDocumentLines)
        .set({ productId: other })
        .where(eq(customsDocumentLines.id, out.line.id))
      expect(await remaining(tx, source.line.id)).toBe(100)
    })
  })
})

describe("suggest_origin_allocations", () => {
  test("FIFO: dokumen asal tertua dulu sampai qty terpenuhi, tanpa melewati sisa", async () => {
    await inRollback(db, async (tx) => {
      const product = await insertCustomsProduct(tx, "ZOP1")
      const older = await origin(tx, "23", product)
      const newer = await origin(tx, "40", product)
      const taken = await outgoing(tx, "25", product)
      await allocate(tx, taken.line.id, [{ origin_line_id: older.line.id, qty: "70" }])

      const out = await outgoing(tx, "30", product)
      await tx
        .update(customsDocumentLines)
        .set({ stockQty: "120" })
        .where(eq(customsDocumentLines.id, out.line.id))
      const { rows } = await tx.execute<{ origin_line_id: string; qty: string }>(
        sql`select * from suggest_origin_allocations(${out.line.id})`,
      )
      expect(rows.map((row) => [row.origin_line_id, Number(row.qty)])).toEqual([
        [older.line.id, 30],
        [newer.line.id, 90],
      ])
    })
  })
})
