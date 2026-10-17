"use server"

import { randomUUID } from "node:crypto"

import { eq, inArray, sql } from "drizzle-orm"
import { z } from "zod"

import { CUSTOMS_DOC_CODES } from "@/modules/it-inventory/lib/customs"
import {
  ATTACHMENT_TYPES,
  attachmentKeyPrefix,
  customsDocumentField,
  MAX_ATTACHMENT_BYTES,
  type CustomsAttachmentFile,
} from "@/modules/it-inventory/lib/customs-form"
import { AppError, defineAction, defineFormAction } from "@/server/actions/define-action"
import type { Transaction } from "@/server/db/audit"
import { getStorage } from "@/server/storage"
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

// Simpan dokumen BC Draft (backlog M3-04). Header diperbarui, lalu semua bagian (entitas, barang,
// pungutan, lampiran, kemasan, peti kemas, pengangkutan) diganti isinya dalam satu transaksi.
// Nomor aju, kategori barang, dan aturan lain diisi/diperiksa database.

// Dokumen yang sudah diajukan dikunci database (M3-11); pesan ini untuk kasus yang dicek lebih dulu.
const EDITABLE: string[] = ["draft", "ready"]
const NOT_EDITABLE = "Hanya dokumen Draft atau Siap ajukan yang bisa diubah."

export const saveCustomsDocument = defineFormAction({
  name: "saveCustomsDocument",
  permission: "bc:write",
  schema: z.object({
    id: z
      .union([z.uuid("Dokumen tidak valid."), z.literal("")])
      .optional()
      .transform((value) => value || null),
    docCode: z.enum(CUSTOMS_DOC_CODES, "Jenis dokumen tidak valid."),
    document: customsDocumentField,
  }),
  successMessage: "Dokumen disimpan.",
  handler: async ({ input, tx }) => {
    const { document } = input
    const header = { ...document.header, details: document.details }
    let id = input.id
    if (id) {
      const [current] = await tx
        .select({ docCode: customsDocuments.docCode, status: customsDocuments.status })
        .from(customsDocuments)
        .where(eq(customsDocuments.id, id))
        .for("update")
      if (!current || current.docCode !== input.docCode) {
        throw new AppError("Dokumen tidak ditemukan.")
      }
      if (!EDITABLE.includes(current.status)) throw new AppError(NOT_EDITABLE)
      await tx.update(customsDocuments).set(header).where(eq(customsDocuments.id, id))
      await deleteParts(tx, id)
    } else {
      const [row] = await tx
        .insert(customsDocuments)
        .values({ docCode: input.docCode, ...header })
        .returning({ id: customsDocuments.id })
      id = row.id
    }
    const documentId = id

    if (document.parties.length) {
      await tx
        .insert(customsDocumentParties)
        .values(document.parties.map((party) => ({ documentId, ...party, name: party.name ?? "" })))
    }
    for (const [index, { taxes, ...line }] of document.lines.entries()) {
      const [row] = await tx
        .insert(customsDocumentLines)
        .values({ documentId, seq: index + 1, ...line })
        .returning({ id: customsDocumentLines.id })
      if (taxes.length) {
        await tx.insert(customsLineTaxes).values(taxes.map((tax) => ({ lineId: row.id, ...tax })))
      }
    }
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
    return { id: documentId }
  },
})

async function deleteParts(tx: Transaction, id: string) {
  await tx.delete(customsDocumentParties).where(eq(customsDocumentParties.documentId, id))
  const lineIds = tx
    .select({ id: customsDocumentLines.id })
    .from(customsDocumentLines)
    .where(eq(customsDocumentLines.documentId, id))
  await tx.delete(customsLineTaxes).where(inArray(customsLineTaxes.lineId, lineIds))
  await tx.delete(customsDocumentLines).where(eq(customsDocumentLines.documentId, id))
  await tx.delete(customsAttachments).where(eq(customsAttachments.documentId, id))
  await tx.delete(customsPackages).where(eq(customsPackages.documentId, id))
  await tx.delete(customsContainers).where(eq(customsContainers.documentId, id))
  await tx.delete(customsTransports).where(eq(customsTransports.documentId, id))
}

// Unggah file lampiran dokumen Draft yang sudah tersimpan (M3-10). File langsung masuk storage;
// barisnya tercatat saat dokumen disimpan. File yang tidak jadi dipakai tetap di storage.
export const uploadCustomsAttachment = defineFormAction({
  name: "uploadCustomsAttachment",
  permission: "bc:write",
  schema: z.object({
    documentId: z.uuid("Simpan dokumen dulu sebelum mengunggah file."),
    file: z
      .instanceof(File, { message: "Pilih file lampiran." })
      .refine((file) => file.size > 0, "File kosong.")
      .refine((file) => file.size <= MAX_ATTACHMENT_BYTES, "Ukuran file maksimal 5 MB.")
      .refine(
        (file) => file.type in ATTACHMENT_TYPES,
        "Jenis file harus PDF, JPG, PNG, Excel, atau Word.",
      ),
  }),
  refresh: false,
  handler: async ({ input, tx }) => {
    const [doc] = await tx
      .select({ status: customsDocuments.status })
      .from(customsDocuments)
      .where(eq(customsDocuments.id, input.documentId))
    if (!doc) throw new AppError("Dokumen tidak ditemukan.")
    if (!EDITABLE.includes(doc.status)) throw new AppError(NOT_EDITABLE)

    const { file } = input
    const fileKey = `${attachmentKeyPrefix(input.documentId)}${randomUUID()}${ATTACHMENT_TYPES[file.type]}`
    await getStorage().put(fileKey, new Uint8Array(await file.arrayBuffer()), file.type)
    return {
      fileKey,
      fileName: file.name.slice(0, 255),
      contentType: file.type,
      fileSize: file.size,
    } satisfies CustomsAttachmentFile
  },
})

// Alur status (M3-11). Aturan dan penguncian dipaksakan fungsi database; di sini hanya meneruskan
// input dan pesannya.
const idInput = z.object({ id: z.uuid("Dokumen tidak valid.") })

const optionalDate = z
  .string()
  .optional()
  .transform((value) => value || null)
  .refine((value) => value === null || /^\d{4}-\d{2}-\d{2}$/.test(value), "Tanggal tidak valid.")

const response = {
  responseCode: z
    .string()
    .trim()
    .max(10)
    .optional()
    .transform((value) => value || null),
  responseNumber: z
    .string()
    .trim()
    .max(50, "Nomor respon maksimal 50 karakter.")
    .optional()
    .transform((value) => value || null),
  responseDate: optionalDate,
}

export const submitCustomsDocument = defineAction({
  name: "submitCustomsDocument",
  permission: "bc:write",
  schema: idInput,
  successMessage: "Dokumen dicatat Diajukan. Catat nomor daftar setelah respon Bea Cukai keluar.",
  handler: async ({ input, tx }) => {
    await tx.execute(sql`select submit_customs_document(${input.id})`)
  },
})

export const registerCustomsDocument = defineAction({
  name: "registerCustomsDocument",
  permission: "bc:write",
  schema: idInput.extend({
    registrationNumber: z.string().trim().max(50, "Nomor daftar maksimal 50 karakter."),
    registrationDate: optionalDate,
    ...response,
  }),
  successMessage: "Dokumen dicatat Terdaftar.",
  handler: async ({ input, tx }) => {
    await tx.execute(
      sql`select register_customs_document(${input.id}, ${input.registrationNumber},
        ${input.registrationDate}::date, ${input.responseCode}, ${input.responseNumber},
        ${input.responseDate}::date)`,
    )
  },
})

export const rejectCustomsDocument = defineAction({
  name: "rejectCustomsDocument",
  permission: "bc:write",
  schema: idInput.extend({
    reason: z.string().trim().max(1000, "Alasan maksimal 1000 karakter."),
    ...response,
  }),
  successMessage: "Dokumen dicatat Ditolak. Kembalikan ke Draft untuk memperbaikinya.",
  handler: async ({ input, tx }) => {
    await tx.execute(
      sql`select reject_customs_document(${input.id}, ${input.reason}, ${input.responseCode},
        ${input.responseNumber}, ${input.responseDate}::date)`,
    )
  },
})

export const resetCustomsDocumentToDraft = defineAction({
  name: "resetCustomsDocumentToDraft",
  permission: "bc:write",
  schema: idInput,
  successMessage: "Dokumen kembali ke Draft.",
  handler: async ({ input, tx }) => {
    await tx.execute(sql`select reset_customs_document_to_draft(${input.id})`)
  },
})

export const cancelCustomsDocument = defineAction({
  name: "cancelCustomsDocument",
  permission: "bc:cancel",
  schema: idInput,
  successMessage: "Dokumen dibatalkan.",
  handler: async ({ input, tx }) => {
    await tx.execute(sql`select cancel_customs_document(${input.id})`)
  },
})
