"use server"

import { randomUUID } from "node:crypto"

import { eq, sql } from "drizzle-orm"
import { z } from "zod"

import { CUSTOMS_DOC_CODES } from "@/modules/it-inventory/lib/customs"
import {
  ATTACHMENT_TYPES,
  attachmentKeyPrefix,
  customsDocumentField,
  MAX_ATTACHMENT_BYTES,
  type CustomsAttachmentFile,
} from "@/modules/it-inventory/lib/customs-form"
import {
  EDITABLE,
  NOT_EDITABLE,
  persistCustomsDocument,
} from "@/modules/it-inventory/server/customs-persist"
import { AppError, defineAction, defineFormAction } from "@/server/actions/define-action"
import { getStorage } from "@/server/storage"
import { customsDocuments } from "@/server/db/schema"

// Simpan dokumen BC Draft (backlog M3-04). Header diperbarui, lalu semua bagian (entitas, barang,
// pungutan, lampiran, kemasan, peti kemas, pengangkutan) diganti isinya dalam satu transaksi.
// Nomor aju, kategori barang, dan aturan lain diisi/diperiksa database.

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
  handler: async ({ input, tx }) => ({
    id: await persistCustomsDocument(tx, input.id, input.docCode, input.document),
  }),
})

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

// Revisi dokumen Terdaftar (M3-12): versi lama disimpan, dokumen kembali ke Draft dengan nomor
// aju yang sama.
export const reviseCustomsDocument = defineAction({
  name: "reviseCustomsDocument",
  permission: "bc:write",
  schema: idInput.extend({
    reason: z.string().trim().max(1000, "Alasan maksimal 1000 karakter."),
  }),
  successMessage: "Versi baru dibuat. Koreksi dokumen, ajukan, lalu catat terdaftar lagi.",
  handler: async ({ input, tx }) => {
    await tx.execute(sql`select revise_customs_document(${input.id}, ${input.reason})`)
  },
})

// Duplikat (M3-13): Draft baru dengan nomor aju baru; file lampiran tidak ikut.
export const duplicateCustomsDocument = defineAction({
  name: "duplicateCustomsDocument",
  permission: "bc:write",
  schema: idInput,
  successMessage: "Dokumen diduplikat sebagai Draft baru. Unggah ulang file lampirannya.",
  handler: async ({ input, tx }) => {
    const result = await tx.execute<{ id: string }>(
      sql`select duplicate_customs_document(${input.id}) as id`,
    )
    return { id: result.rows[0].id }
  },
})
