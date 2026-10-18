"use server"

import { and, eq, ne, sql } from "drizzle-orm"
import { z } from "zod"

import { parseDecimalInput } from "@/lib/decimal"

import {
  CUSTOMS_DOC_CODE_LABELS,
  CUSTOMS_DOC_CODES,
  CUSTOMS_MOVEMENT_DOC_CODES,
} from "@/modules/it-inventory/lib/customs"
import {
  customsDocumentInputSchema,
  emptyLine,
  emptyParty,
} from "@/modules/it-inventory/lib/customs-form"
import { CUSTOMS_SPECS } from "@/modules/it-inventory/lib/customs-specs"
import { persistCustomsDocument } from "@/modules/it-inventory/server/customs-persist"
import {
  customsPartyFromPartner,
  newCustomsDraft,
} from "@/modules/it-inventory/server/queries/customs-documents"
import { suggestOrigins } from "@/modules/it-inventory/server/queries/customs-transfers"
import { AppError, defineAction } from "@/server/actions/define-action"
import type { Transaction } from "@/server/db/audit"
import { customsDocuments, transferLines, transfers } from "@/server/db/schema"

// Dokumen BC ↔ transfer (backlog M4-04, PRD 8.3): buat dokumen dari penerimaan/pengiriman, atau
// tautkan transfer ke dokumen yang sudah ada. Aturan jenis, status, dan tautan baris move
// dipaksakan database (migrasi customs_transfer_links, customs_move_links).

async function lockTransfer(tx: Transaction, id: string) {
  const [transfer] = await tx
    .select({
      id: transfers.id,
      number: transfers.number,
      status: transfers.status,
      movementCode: transfers.movementCode,
      partnerId: transfers.partnerId,
      customsDocumentId: transfers.customsDocumentId,
    })
    .from(transfers)
    .where(eq(transfers.id, id))
    .for("update")
  if (!transfer) throw new AppError("Transfer tidak ditemukan.")
  if (transfer.status === "done" || transfer.status === "cancelled") {
    throw new AppError(
      `Transfer ${transfer.number} sudah Selesai atau Batal; dokumennya tidak bisa diubah.`,
    )
  }
  return transfer
}

// Dokumen baru dari transfer: entitas perusahaan dan kantor dari profil perusahaan, entitas partner
// dari partner transfer, barang dari baris permintaan (qty satuan stok; kode HS dan uraian dari
// produk), penandatangan = user. Bila transfer sudah punya dokumen jenis itu, dokumen itu dibuka.
export const createCustomsDocumentFromTransfer = defineAction({
  name: "createCustomsDocumentFromTransfer",
  permission: "bc:write",
  schema: z.object({
    transferId: z.uuid("Transfer tidak valid."),
    docCode: z.enum(CUSTOMS_DOC_CODES, "Jenis dokumen tidak valid."),
  }),
  handler: async ({ input, user, tx }) => {
    const transfer = await lockTransfer(tx, input.transferId)
    const spec = CUSTOMS_SPECS[input.docCode]
    const allowed = CUSTOMS_MOVEMENT_DOC_CODES[transfer.movementCode] ?? []
    if (!allowed.includes(input.docCode)) {
      throw new AppError(`Transfer ${transfer.number} tidak bisa memakai ${spec.title}.`)
    }
    if (transfer.customsDocumentId) {
      const [linked] = await tx
        .select({ docCode: customsDocuments.docCode, ajuNumber: customsDocuments.ajuNumber })
        .from(customsDocuments)
        .where(eq(customsDocuments.id, transfer.customsDocumentId))
      if (linked.docCode === input.docCode) {
        return {
          id: transfer.customsDocumentId,
          path: `${spec.path}/${transfer.customsDocumentId}`,
        }
      }
      throw new AppError(
        `Transfer ${transfer.number} sudah ditautkan ke ${CUSTOMS_DOC_CODE_LABELS[linked.docCode]} ${linked.ajuNumber}. Lepas dulu tautannya.`,
      )
    }

    const { draft } = await newCustomsDraft(spec, user.name)
    const partnerRole = spec.parties.find((role) => role.source === "partner")
    const partner = transfer.partnerId ? await customsPartyFromPartner(transfer.partnerId) : null
    if (partnerRole && partner) {
      draft.parties.push({
        ...emptyParty(partnerRole.code),
        ...partner,
      })
    }
    const lines = await tx
      .select({
        productId: transferLines.productId,
        qty: sql<string>`sum(${transferLines.qty})`,
      })
      .from(transferLines)
      .where(eq(transferLines.transferId, transfer.id))
      .groupBy(transferLines.productId)
      .orderBy(sql`min(${transferLines.position})`)
    draft.lines = lines.map((line) => ({
      ...emptyLine(),
      productId: line.productId,
      stockQty: line.qty,
    }))

    const id = await persistCustomsDocument(
      tx,
      null,
      input.docCode,
      customsDocumentInputSchema.parse(draft),
    )
    await tx.update(transfers).set({ customsDocumentId: id }).where(eq(transfers.id, transfer.id))
    return { id, path: `${spec.path}/${id}` }
  },
  successMessage: "Dokumen BC dibuat dari transfer dan ditautkan.",
})

// Tautkan transfer ke dokumen yang sudah ada, atau lepas (documentId null). Baris move ikut
// ditautkan ke baris dokumen per produk oleh database.
export const linkTransferCustomsDocument = defineAction({
  name: "linkTransferCustomsDocument",
  permission: "bc:write",
  schema: z.object({
    transferId: z.uuid("Transfer tidak valid."),
    documentId: z.uuid("Dokumen tidak valid.").nullable(),
  }),
  handler: async ({ input, tx }) => {
    const transfer = await lockTransfer(tx, input.transferId)
    if (input.documentId) {
      const [doc] = await tx
        .select({ id: customsDocuments.id })
        .from(customsDocuments)
        .where(
          and(eq(customsDocuments.id, input.documentId), ne(customsDocuments.status, "cancelled")),
        )
      if (!doc) throw new AppError("Dokumen BC tidak ditemukan atau sudah Batal.")
    }
    await tx
      .update(transfers)
      .set({ customsDocumentId: input.documentId })
      .where(eq(transfers.id, transfer.id))
  },
  successMessage: "Tautan dokumen BC disimpan.",
})

// Alokasi dokumen asal satu baris dokumen keluar (M4-03, M4-05). Aturan pasangan, produk, dan sisa
// saldo asal diperiksa database; status dokumen dihitung ulang (alokasi lengkap = syarat Siap ajukan).
export const allocateOrigins = defineAction({
  name: "allocateOrigins",
  permission: "bc:write",
  schema: z.object({
    lineId: z.uuid("Baris dokumen tidak valid."),
    allocations: z.array(
      z.object({
        originLineId: z.uuid("Dokumen asal tidak valid."),
        qty: z.string().transform((value, ctx) => {
          const parsed = parseDecimalInput(value, 4)
          if (!parsed) {
            ctx.addIssue({ code: "custom", message: "Qty alokasi harus angka lebih dari 0." })
            return z.NEVER
          }
          return parsed
        }),
      }),
    ),
  }),
  successMessage: "Alokasi dokumen asal disimpan.",
  handler: async ({ input, tx }) => {
    const items = input.allocations.map((item) => ({
      origin_line_id: item.originLineId,
      qty: item.qty,
    }))
    await tx.execute(sql`select allocate_origin(${input.lineId}, ${JSON.stringify(items)}::jsonb)`)
    await tx.execute(sql`
      select refresh_customs_document_status(document_id)
      from customs_document_lines where id = ${input.lineId}`)
  },
})

// Saran FIFO untuk satu baris (hanya baca).
export const suggestOriginAllocations = defineAction({
  name: "suggestOriginAllocations",
  permission: "bc:write",
  schema: z.object({ lineId: z.uuid("Baris dokumen tidak valid.") }),
  refresh: false,
  handler: async ({ input }) => suggestOrigins(input.lineId),
})
