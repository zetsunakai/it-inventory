import "server-only"

import { eq, inArray } from "drizzle-orm"

import type { CustomsDocCode } from "@/modules/it-inventory/lib/customs"
import {
  attachmentKeyPrefix,
  type CustomsDocumentInput,
} from "@/modules/it-inventory/lib/customs-form"
import { AppError } from "@/server/actions/app-error"
import type { Transaction } from "@/server/db/audit"
import {
  customsAttachments,
  customsBankAccounts,
  customsContainers,
  customsDocumentLines,
  customsDocumentParties,
  customsDocumentTaxes,
  customsDocuments,
  customsGuarantees,
  customsPackages,
  customsTransports,
} from "@/server/db/schema"

// Penyimpanan isi dokumen BC di dalam transaksi aksi (M3-04, M4-04). Bukan file "use server":
// fungsi di sini hanya dipanggil aksi yang sudah memeriksa izin.

// Dokumen Submitted dikunci database (H-01); pesan ini untuk kasus yang dicek lebih dulu.
export const EDITABLE: string[] = ["draft"]
export const NOT_EDITABLE = "Dokumen sudah Submitted dan tidak dapat diubah atau dihapus."

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
  await saveAttachments(tx, documentId, null, document.attachments)
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
  if (document.taxes.length) {
    await tx.insert(customsDocumentTaxes).values(numbered(document.taxes))
  }
  if (document.guarantees.length) {
    await tx.insert(customsGuarantees).values(numbered(document.guarantees))
  }
  if (document.bankAccounts.length) {
    await tx.insert(customsBankAccounts).values(numbered(document.bankAccounts))
  }
  return documentId
}

type AttachmentInput = CustomsDocumentInput["attachments"][number]

// Lampiran dokumen (lineId null) atau Dokumen Lartas satu barang. File harus milik dokumen ini.
async function saveAttachments(
  tx: Transaction,
  documentId: string,
  lineId: string | null,
  rows: AttachmentInput[],
) {
  const prefix = attachmentKeyPrefix(documentId)
  if (rows.some((row) => row.file && !row.file.fileKey.startsWith(prefix))) {
    throw new AppError("File lampiran tidak valid. Unggah ulang filenya.")
  }
  if (!rows.length) return
  await tx.insert(customsAttachments).values(
    rows.map(({ file, ...row }, index) => ({
      documentId,
      lineId,
      seq: index + 1,
      ...row,
      fileKey: file?.fileKey ?? null,
      fileName: file?.fileName ?? null,
      contentType: file?.contentType || null,
      fileSize: file?.fileSize ?? null,
    })),
  )
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
  await tx.delete(customsDocumentTaxes).where(eq(customsDocumentTaxes.documentId, id))
  await tx.delete(customsGuarantees).where(eq(customsGuarantees.documentId, id))
  await tx.delete(customsBankAccounts).where(eq(customsBankAccounts.documentId, id))
}

type LineInput = CustomsDocumentInput["lines"][number]

// Barang per seri: seri yang sudah ada diperbarui di tempat, seri baru ditambah, seri yang tidak
// ada lagi dihapus. Dokumen Lartas per barang diganti (lampiran dokumen sudah dihapus deleteParts).
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
  for (const [index, { attachments, ...line }] of lines.entries()) {
    const seq = index + 1
    let lineId = idBySeq.get(seq)
    if (lineId) {
      await tx.update(customsDocumentLines).set(line).where(eq(customsDocumentLines.id, lineId))
    } else {
      const [row] = await tx
        .insert(customsDocumentLines)
        .values({ documentId, seq, ...line })
        .returning({ id: customsDocumentLines.id })
      lineId = row.id
    }
    await saveAttachments(tx, documentId, lineId, attachments)
  }
}
