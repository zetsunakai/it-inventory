import "server-only"

import { eq, inArray, sql } from "drizzle-orm"

import type { CustomsDocCode } from "@/modules/it-inventory/lib/customs"
import {
  attachmentKeyPrefix,
  type CustomsDocumentInput,
} from "@/modules/it-inventory/lib/customs-form"
import { AppError } from "@/server/actions/app-error"
import type { Transaction } from "@/server/db/audit"
import {
  customsAttachments,
  customsContainers,
  customsDocumentLines,
  customsDocumentParties,
  customsDocuments,
  customsLineTaxes,
  customsPackages,
  customsTransports,
} from "@/server/db/schema"

// Penyimpanan isi dokumen BC di dalam transaksi aksi (M3-04, M4-04). Bukan file "use server":
// fungsi di sini hanya dipanggil aksi yang sudah memeriksa izin.

// Dokumen yang sudah diajukan dikunci database (M3-11); pesan ini untuk kasus yang dicek lebih dulu.
export const EDITABLE: string[] = ["draft", "ready"]
export const NOT_EDITABLE = "Hanya dokumen Draft atau Siap ajukan yang bisa diubah."

// Simpan isi dokumen (baru atau Draft yang ada); dipakai form dan "Buat dokumen BC" dari transfer
// (M4-04). Mengembalikan id dokumen.
export async function persistCustomsDocument(
  tx: Transaction,
  existingId: string | null,
  docCode: CustomsDocCode,
  document: CustomsDocumentInput,
) {
  const header = { ...document.header, details: document.details }
  let id = existingId
  if (id) {
    const [current] = await tx
      .select({ docCode: customsDocuments.docCode, status: customsDocuments.status })
      .from(customsDocuments)
      .where(eq(customsDocuments.id, id))
      .for("update")
    if (!current || current.docCode !== docCode) {
      throw new AppError("Dokumen tidak ditemukan.")
    }
    if (!EDITABLE.includes(current.status)) throw new AppError(NOT_EDITABLE)
    await tx.update(customsDocuments).set(header).where(eq(customsDocuments.id, id))
    await deleteParts(tx, id)
  } else {
    const [row] = await tx
      .insert(customsDocuments)
      .values({ docCode, ...header })
      .returning({ id: customsDocuments.id })
    id = row.id
  }
  const documentId = id

  if (document.parties.length) {
    await tx
      .insert(customsDocumentParties)
      .values(document.parties.map((party) => ({ documentId, ...party, name: party.name ?? "" })))
  }
  await saveLines(tx, documentId, document.lines)
  const numbered = <T>(rows: T[]) =>
    rows.map((row, index) => ({ documentId, seq: index + 1, ...row }))
  const prefix = attachmentKeyPrefix(documentId)
  if (document.attachments.some((row) => row.file && !row.file.fileKey.startsWith(prefix))) {
    throw new AppError("File lampiran tidak valid. Unggah ulang filenya.")
  }
  if (document.attachments.length) {
    await tx.insert(customsAttachments).values(
      numbered(
        document.attachments.map(({ file, ...row }) => ({
          ...row,
          fileKey: file?.fileKey ?? null,
          fileName: file?.fileName ?? null,
          contentType: file?.contentType || null,
          fileSize: file?.fileSize ?? null,
        })),
      ),
    )
  }
  if (document.packages.length) {
    await tx
      .insert(customsPackages)
      .values(numbered(document.packages.map((row) => ({ ...row, qty: row.qty ?? "0" }))))
  }
  if (document.containers.length) {
    await tx.insert(customsContainers).values(numbered(document.containers))
  }
  if (document.transports.length) {
    await tx.insert(customsTransports).values(numbered(document.transports))
  }
  // Draft ⇄ Siap ajukan sesuai kelengkapan (M3-11).
  await tx.execute(sql`select refresh_customs_document_status(${documentId})`)
  return documentId
}

// Bagian dokumen selain barang diganti seluruhnya setiap simpan. Barang disimpan per seri
// (saveLines) supaya id barisnya tetap: alokasi dokumen asal (M4-03) dan tautan baris stock move
// (M4-01) merujuk ke id itu.
async function deleteParts(tx: Transaction, id: string) {
  await tx.delete(customsDocumentParties).where(eq(customsDocumentParties.documentId, id))
  await tx.delete(customsAttachments).where(eq(customsAttachments.documentId, id))
  await tx.delete(customsPackages).where(eq(customsPackages.documentId, id))
  await tx.delete(customsContainers).where(eq(customsContainers.documentId, id))
  await tx.delete(customsTransports).where(eq(customsTransports.documentId, id))
}

type LineInput = CustomsDocumentInput["lines"][number]

// Barang per seri: seri yang sudah ada diperbarui di tempat, seri baru ditambah, seri yang tidak
// ada lagi dihapus. Pungutan per barang diganti.
async function saveLines(tx: Transaction, documentId: string, lines: LineInput[]) {
  const existing = await tx
    .select({ id: customsDocumentLines.id, seq: customsDocumentLines.seq })
    .from(customsDocumentLines)
    .where(eq(customsDocumentLines.documentId, documentId))
  const idBySeq = new Map(existing.map((row) => [row.seq, row.id]))
  const removed = existing.filter((row) => row.seq > lines.length).map((row) => row.id)
  if (removed.length) {
    await tx.delete(customsDocumentLines).where(inArray(customsDocumentLines.id, removed))
  }
  for (const [index, { taxes, ...line }] of lines.entries()) {
    const seq = index + 1
    let lineId = idBySeq.get(seq)
    if (lineId) {
      await tx.update(customsDocumentLines).set(line).where(eq(customsDocumentLines.id, lineId))
      await tx.delete(customsLineTaxes).where(eq(customsLineTaxes.lineId, lineId))
    } else {
      const [row] = await tx
        .insert(customsDocumentLines)
        .values({ documentId, seq, ...line })
        .returning({ id: customsDocumentLines.id })
      lineId = row.id
    }
    if (taxes.length) {
      await tx.insert(customsLineTaxes).values(taxes.map((tax) => ({ lineId, ...tax })))
    }
  }
}
