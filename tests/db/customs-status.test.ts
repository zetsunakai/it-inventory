import { eq, like, sql } from "drizzle-orm"
import { afterAll, beforeAll, describe, expect, test } from "vitest"

import { CUSTOMS_DOC_CODES } from "@/modules/it-inventory/lib/customs"
import { db } from "@/server/db"
import {
  company,
  customsAttachments,
  customsDocumentLines,
  customsDocuments,
  userRoles,
  users,
} from "@/server/db/schema"

import { insertCompleteDocument, insertCustomsProduct, insertTestCompany } from "./customs-fixtures"
import { inRollback, pgErrorInSavepoint, setAuditUser } from "./helpers"

// Alur status dokumen BC (backlog M3-11, PRD 7.3): Draft ⇄ Siap ajukan → Diajukan → Terdaftar /
// Ditolak → Draft, Batal hanya Manajer; dokumen yang sudah diajukan dikunci database.

type Tx = Parameters<Parameters<typeof inRollback>[1]>[0]

const ids = { manajer: "", exim: "" }

beforeAll(async () => {
  await insertTestCompany(db)
  for (const role of ["manajer", "staf_exim"] as const) {
    const [user] = await db
      .insert(users)
      .values({ name: `Uji ${role}`, email: `zb-${role}@status-bc.test`, emailVerified: true })
      .returning({ id: users.id })
    await db.insert(userRoles).values({ userId: user.id, role })
    ids[role === "manajer" ? "manajer" : "exim"] = user.id
  }
})

afterAll(async () => {
  await db.delete(users).where(like(users.email, "zb-%@status-bc.test"))
  await db.delete(company)
  await db.$client.end()
})

const call = (tx: Tx, query: ReturnType<typeof sql>) => tx.execute(query)

async function status(tx: Tx, id: string) {
  const [row] = await tx
    .select({ status: customsDocuments.status })
    .from(customsDocuments)
    .where(eq(customsDocuments.id, id))
  return row.status
}

async function readyDocument(tx: Tx) {
  const product = await insertCustomsProduct(tx)
  const doc = await insertCompleteDocument(tx, "25", product)
  await call(tx, sql`select refresh_customs_document_status(${doc.id})`)
  return doc
}

describe("Draft dan Siap ajukan", () => {
  test("otomatis Siap ajukan bila lengkap, kembali Draft bila tidak lengkap lagi", async () => {
    await inRollback(db, async (tx) => {
      const doc = await readyDocument(tx)
      expect(await status(tx, doc.id)).toBe("ready")

      await tx.delete(customsAttachments).where(eq(customsAttachments.documentId, doc.id))
      await call(tx, sql`select refresh_customs_document_status(${doc.id})`)
      expect(await status(tx, doc.id)).toBe("draft")
    })
  })

  test("Ajukan dokumen belum lengkap melaporkan semua kekurangannya", async () => {
    await inRollback(db, async (tx) => {
      const [doc] = await tx.insert(customsDocuments).values({ docCode: "41" }).returning()
      const message = await pgErrorInSavepoint(tx, (sp) =>
        sp.execute(sql`select submit_customs_document(${doc.id})`),
      )
      expect(message.split("\n")).toEqual(
        expect.arrayContaining(["Dokumen belum punya barang.", "Lampiran Invoice belum ada."]),
      )
    })
  })

  test("status hanya berubah lewat fungsi alur", async () => {
    await inRollback(db, async (tx) => {
      const doc = await readyDocument(tx)
      expect(
        await pgErrorInSavepoint(tx, (sp) =>
          sp
            .update(customsDocuments)
            .set({ status: "submitted" })
            .where(eq(customsDocuments.id, doc.id)),
        ),
      ).toBe(
        "Status dokumen BC hanya berubah lewat Ajukan, Catat terdaftar, Catat ditolak, Kembali ke Draft, atau Batal.",
      )
    })
  })
})

describe("Diajukan, Terdaftar, Ditolak", () => {
  test("dokumen Diajukan dan Terdaftar tidak bisa diubah, termasuk bagian-bagiannya", async () => {
    await inRollback(db, async (tx) => {
      const doc = await readyDocument(tx)
      await call(tx, sql`select submit_customs_document(${doc.id})`)
      expect(await status(tx, doc.id)).toBe("submitted")

      const locked = `Dokumen BC ${doc.ajuNumber} sudah Diajukan dan tidak bisa diubah.`
      expect(
        await pgErrorInSavepoint(tx, (sp) =>
          sp.update(customsDocuments).set({ notes: "x" }).where(eq(customsDocuments.id, doc.id)),
        ),
      ).toBe(locked)
      expect(
        await pgErrorInSavepoint(tx, (sp) =>
          sp
            .update(customsDocumentLines)
            .set({ qty: "1" })
            .where(eq(customsDocumentLines.documentId, doc.id)),
        ),
      ).toBe(locked)
      expect(
        await pgErrorInSavepoint(tx, (sp) =>
          sp.delete(customsAttachments).where(eq(customsAttachments.documentId, doc.id)),
        ),
      ).toBe(locked)
      expect(
        await pgErrorInSavepoint(tx, (sp) =>
          sp.delete(customsDocuments).where(eq(customsDocuments.id, doc.id)),
        ),
      ).toBe(`Dokumen BC ${doc.ajuNumber} sudah Diajukan dan tidak bisa dihapus.`)

      // Nomor dan tanggal daftar wajib; tanggal tidak boleh di masa depan.
      expect(
        await pgErrorInSavepoint(tx, (sp) =>
          sp.execute(sql`select register_customs_document(${doc.id}, ' ', null)`),
        ),
      ).toBe("Nomor daftar wajib diisi.\nTanggal daftar wajib diisi.")
      expect(
        await pgErrorInSavepoint(tx, (sp) =>
          sp.execute(sql`select register_customs_document(${doc.id}, '000123', current_date + 2)`),
        ),
      ).toBe("Tanggal daftar tidak boleh di masa depan.")

      await call(
        tx,
        sql`select register_customs_document(${doc.id}, ' 000123 ', ${doc.ajuDate}::date,
          '2503', 'S-123/KPU.01/2026', ${doc.ajuDate}::date)`,
      )
      const [registered] = await tx
        .select()
        .from(customsDocuments)
        .where(eq(customsDocuments.id, doc.id))
      expect(registered).toMatchObject({
        status: "registered",
        registrationNumber: "000123",
        registrationDate: doc.ajuDate,
        responseCode: "2503",
      })
      expect(
        await pgErrorInSavepoint(tx, (sp) =>
          sp.update(customsDocuments).set({ notes: "x" }).where(eq(customsDocuments.id, doc.id)),
        ),
      ).toBe(`Dokumen BC ${doc.ajuNumber} sudah Terdaftar dan tidak bisa diubah.`)
      expect(
        await pgErrorInSavepoint(tx, (sp) =>
          sp.execute(sql`select cancel_customs_document(${doc.id})`),
        ),
      ).toBe(`Dokumen BC ${doc.ajuNumber} sudah Terdaftar dan tidak bisa dibatalkan.`)
    })
  })

  test("Ditolak wajib alasan, lalu kembali ke Draft untuk diperbaiki", async () => {
    await inRollback(db, async (tx) => {
      const doc = await readyDocument(tx)
      await call(tx, sql`select submit_customs_document(${doc.id})`)
      expect(
        await pgErrorInSavepoint(tx, (sp) =>
          sp.execute(sql`select reject_customs_document(${doc.id}, '  ')`),
        ),
      ).toBe("Alasan penolakan wajib diisi.")
      await call(tx, sql`select reject_customs_document(${doc.id}, 'HS tidak sesuai uraian')`)
      expect(await status(tx, doc.id)).toBe("rejected")
      expect(
        await pgErrorInSavepoint(tx, (sp) =>
          sp.update(customsDocuments).set({ notes: "x" }).where(eq(customsDocuments.id, doc.id)),
        ),
      ).toBe(`Dokumen BC ${doc.ajuNumber} sudah Ditolak dan tidak bisa diubah.`)

      await call(tx, sql`select reset_customs_document_to_draft(${doc.id})`)
      // Masih lengkap, jadi langsung Siap ajukan lagi; alasan penolakan tetap tersimpan.
      const [row] = await tx.select().from(customsDocuments).where(eq(customsDocuments.id, doc.id))
      expect(row).toMatchObject({ status: "ready", rejectionReason: "HS tidak sesuai uraian" })
    })
  })
})

describe("semua jenis dokumen", () => {
  test.each(CUSTOMS_DOC_CODES)("BC %s bisa dicatat sampai Terdaftar", async (code) => {
    await inRollback(db, async (tx) => {
      const product = await insertCustomsProduct(tx)
      const doc = await insertCompleteDocument(tx, code, product)
      await call(tx, sql`select refresh_customs_document_status(${doc.id})`)
      await call(tx, sql`select submit_customs_document(${doc.id})`)
      await call(
        tx,
        sql`select register_customs_document(${doc.id}, '000777', ${doc.ajuDate}::date)`,
      )
      expect(await status(tx, doc.id)).toBe("registered")
    })
  })
})

describe("Batal", () => {
  test("hanya Manajer, sebelum Terdaftar", async () => {
    await inRollback(db, async (tx) => {
      const doc = await readyDocument(tx)
      await setAuditUser(tx, ids.exim)
      expect(
        await pgErrorInSavepoint(tx, (sp) =>
          sp.execute(sql`select cancel_customs_document(${doc.id})`),
        ),
      ).toBe("Hanya Manajer yang bisa membatalkan dokumen BC.")
      await setAuditUser(tx, ids.manajer)
      await call(tx, sql`select cancel_customs_document(${doc.id})`)
      const [row] = await tx.select().from(customsDocuments).where(eq(customsDocuments.id, doc.id))
      expect(row.status).toBe("cancelled")
      expect(row.cancelledAt).not.toBeNull()
    })
  })
})
