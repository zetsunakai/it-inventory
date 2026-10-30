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

// Alur status seperti hmx-002 (backlog H-01): Draft → Submitted lewat submit_customs_document(),
// yang memeriksa field wajib dan transfer sekaligus. Draft boleh dihapus; Submitted dikunci database.
const idInput = z.object({ id: z.uuid("Dokumen tidak valid.") })

export const submitCustomsDocument = defineAction({
  name: "submitCustomsDocument",
  permission: "bc:write",
  schema: idInput,
  successMessage: "Dokumen Submitted. Dokumen dan barangnya sekarang terkunci.",
  handler: async ({ input, tx }) => {
    await tx.execute(sql`select submit_customs_document(${input.id})`)
  },
})

export const deleteCustomsDocument = defineAction({
  name: "deleteCustomsDocument",
  permission: "bc:write",
  schema: idInput,
  successMessage: "Dokumen dihapus.",
  handler: async ({ input, tx }) => {
    const deleted = await tx
      .delete(customsDocuments)
      .where(eq(customsDocuments.id, input.id))
      .returning({ id: customsDocuments.id })
    if (!deleted.length) throw new AppError("Dokumen tidak ditemukan.")
  },
})

// Duplikat (M3-13): Draft baru dengan nomor urut baru; No. Aju, nomor daftar, transfer, dan file
// lampiran tidak ikut.
export const duplicateCustomsDocument = defineAction({
  name: "duplicateCustomsDocument",
  permission: "bc:write",
  schema: idInput,
  successMessage: "Dokumen diduplikat sebagai Draft baru. Unggah ulang file lampirannya.",
  handler: async ({ input, tx }) => {
    const result = await tx.execute<{ id: string }>(
      sql`select duplicate_customs_document(${input.id}) as id`,
    )
    // Fungsi SQL lama menyalin kolom pungutan dasar; lengkapi field BC 2.0 pada salinan Draft.
    await tx.execute(sql`update customs_document_taxes target set
      tax_value = source.tax_value, paid_amount = source.paid_amount,
      government_borne_amount = source.government_borne_amount, deferred_amount = source.deferred_amount,
      not_collected_amount = source.not_collected_amount, exempted_amount = source.exempted_amount,
      settled_amount = source.settled_amount
      from customs_document_taxes source
      where target.document_id = ${result.rows[0].id} and source.document_id = ${input.id}
        and target.seq = source.seq`)
    return { id: result.rows[0].id }
  },
})
