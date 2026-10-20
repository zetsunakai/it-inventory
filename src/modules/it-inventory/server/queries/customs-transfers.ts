import "server-only"

import { sql } from "drizzle-orm"

import type { TransferType } from "@/modules/inventory/lib/inventory"
import {
  CUSTOMS_DOC_CODES,
  CUSTOMS_DOCUMENT_SOURCE_CODES,
  type CustomsDocCode,
  type CustomsDocumentStatus,
} from "@/modules/it-inventory/lib/customs"
import { db } from "@/server/db"

// Relasi dokumen BC ↔ transfer mengikuti hmx (backlog H-01, PRD 8): dokumen memilih transfer
// lewat customs_document_transfers; transfer hanya menampilkan dokumen yang memilihnya.

export type LinkedCustomsDocument = {
  id: string
  docCode: CustomsDocCode
  number: string
  ajuNumber: string | null
  registrationNumber: string | null
  registrationDate: string | null
  status: CustomsDocumentStatus
}

// Dokumen BC yang memilih transfer ini. null = kode pergerakan transfer tidak dipakai dokumen apa
// pun, jadi panelnya tidak ditampilkan.
export async function getTransferCustoms(transferId: string) {
  const { rows } = await db.execute<{ movement_code: string }>(
    sql`select movement_code from transfers where id = ${transferId}`,
  )
  const movementCode = rows[0]?.movement_code
  if (!movementCode) return null
  const allowed = CUSTOMS_DOC_CODES.filter((code) =>
    CUSTOMS_DOCUMENT_SOURCE_CODES[code].includes(movementCode),
  )
  if (!allowed.length) return null

  const { rows: documents } = await db.execute<{
    id: string
    doc_code: CustomsDocCode
    number: string
    aju_number: string | null
    registration_number: string | null
    registration_date: string | null
    status: CustomsDocumentStatus
  }>(sql`
    select d.id, d.doc_code, d.number, d.aju_number, d.registration_number,
      d.registration_date::text, d.status
    from customs_document_transfers l join customs_documents d on d.id = l.document_id
    where l.transfer_id = ${transferId}
    order by d.number`)
  return {
    allowed,
    documents: documents.map((row): LinkedCustomsDocument => ({
      id: row.id,
      docCode: row.doc_code,
      number: row.number,
      ajuNumber: row.aju_number,
      registrationNumber: row.registration_number,
      registrationDate: row.registration_date,
      status: row.status,
    })),
  }
}

export type TransferCustoms = NonNullable<Awaited<ReturnType<typeof getTransferCustoms>>>

export type DocumentTransferRow = {
  id: string
  number: string
  type: TransferType
  movementCode: string
  status: string
  doneAt: Date | null
}

// Transfer yang dipilih dokumen ini (tab Transfer di detail dokumen).
export async function getDocumentTransfers(documentId: string) {
  const { rows } = await db.execute<{
    id: string
    number: string
    type: TransferType
    movement_code: string
    status: string
    done_at: string | null
  }>(sql`
    select t.id, t.number, t.type, t.movement_code, t.status, t.done_at
    from customs_document_transfers l join transfers t on t.id = l.transfer_id
    where l.document_id = ${documentId}
    order by t.number`)
  return rows.map((row): DocumentTransferRow => ({
    id: row.id,
    number: row.number,
    type: row.type,
    movementCode: row.movement_code,
    status: row.status,
    doneAt: row.done_at ? new Date(row.done_at) : null,
  }))
}
