import "server-only"

import { sql } from "drizzle-orm"

import type { TransferType } from "@/modules/inventory/lib/inventory"
import {
  CUSTOMS_DOC_CODES,
  CUSTOMS_DOCUMENT_SOURCE_CODES,
  CUSTOMS_SOURCE_TYPES,
  type CustomsDocCode,
  type CustomsDocumentStatus,
  type CustomsSourceType,
} from "@/modules/it-inventory/lib/customs"
import type { CustomsTransferProduct } from "@/modules/it-inventory/lib/customs-form"
import { db } from "@/server/db"
import { containsPattern } from "@/server/db/sql-helpers"

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

export type CustomsTransferCandidate = {
  id: string
  number: string
  type: TransferType
  movementCode: string
  status: string
  // Tanggal rencana, atau tanggal selesai bila tidak ada.
  date: string | null
  partnerName: string | null
  sourcePath: string
  destinationPath: string
}

// Pilihan Inventory Transfer Documents (hx-it-inventory-transfer-selector hmx, H-04): transfer
// Siap atau Selesai dari satu jenis sumber yang diizinkan jenis dokumen ini.
export async function searchCustomsTransfers({
  docCode,
  source,
  search,
  offset,
  limit,
}: {
  docCode: CustomsDocCode
  source: CustomsSourceType
  search: string
  offset: number
  limit: number
}): Promise<CustomsTransferCandidate[]> {
  const codes = CUSTOMS_SOURCE_TYPES[source].codes.filter((code) =>
    CUSTOMS_DOCUMENT_SOURCE_CODES[docCode].includes(code),
  )
  if (!codes.length) return []
  const pattern = containsPattern(search)
  const { rows } = await db.execute<{
    id: string
    number: string
    type: TransferType
    movement_code: string
    status: string
    date: string | null
    partner_name: string | null
    source_path: string
    destination_path: string
  }>(sql`
    select t.id, t.number, t.type, t.movement_code, t.status,
      coalesce(t.scheduled_date, (t.done_at at time zone 'Asia/Jakarta')::date)::text as date,
      p.name as partner_name, src.path as source_path, dst.path as destination_path
    from transfers t
    left join partners p on p.id = t.partner_id
    join location_paths src on src.id = t.source_location_id
    join location_paths dst on dst.id = t.destination_location_id
    where t.movement_code::text in (${sql.join(
      codes.map((code) => sql`${code}`),
      sql`, `,
    )})
      and t.status in ('ready', 'done')
      ${search ? sql`and (t.number ilike ${pattern} or p.name ilike ${pattern} or t.reference ilike ${pattern})` : sql``}
    order by t.created_at desc, t.number desc
    limit ${limit} offset ${offset}`)
  return rows.map((row) => ({
    id: row.id,
    number: row.number,
    type: row.type,
    movementCode: row.movement_code,
    status: row.status,
    date: row.date,
    partnerName: row.partner_name,
    sourcePath: row.source_path,
    destinationPath: row.destination_path,
  }))
}

// Jumlah per produk dari permintaan transfer yang dipilih (sync_inventory_transfer_product_lines
// hmx): qty satuan stok dijumlahkan per produk, urut kemunculan pertama.
export async function customsTransferProducts(
  transferIds: string[],
): Promise<CustomsTransferProduct[]> {
  if (!transferIds.length) return []
  const { rows } = await db.execute<{
    product_id: string
    sku: string
    name: string
    hs_code: string | null
    qty: string
  }>(sql`
    select l.product_id, p.sku, p.name, p.hs_code, sum(l.qty)::text as qty
    from transfer_lines l
    join transfers t on t.id = l.transfer_id
    join products p on p.id = l.product_id
    where l.transfer_id in (${sql.join(
      transferIds.map((id) => sql`${id}::uuid`),
      sql`, `,
    )})
    group by l.product_id, p.sku, p.name, p.hs_code
    order by min(t.number), min(l.position), p.sku`)
  return rows.map((row) => ({
    productId: row.product_id,
    sku: row.sku,
    name: row.name,
    hsCode: row.hs_code ?? "",
    qty: row.qty,
  }))
}
