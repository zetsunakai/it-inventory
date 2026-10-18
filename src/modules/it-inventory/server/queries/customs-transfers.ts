import "server-only"

import { sql } from "drizzle-orm"

import {
  CUSTOMS_MOVEMENT_DOC_CODES,
  type CustomsDocCode,
  type CustomsDocumentStatus,
} from "@/modules/it-inventory/lib/customs"
import { db } from "@/server/db"
import { containsPattern } from "@/server/db/sql-helpers"

// Data relasi dokumen BC ↔ transfer untuk panel di detail transfer dan tab Transfer di detail
// dokumen (backlog M4-04, M4-05).

export type LinkedCustomsDocument = {
  id: string
  docCode: CustomsDocCode
  ajuNumber: string
  ajuDate: string
  registrationNumber: string | null
  registrationDate: string | null
  status: CustomsDocumentStatus
}

export type CustomsQtyRow = {
  sku: string
  productName: string
  uomCode: string
  // Satuan stok. transfer = transfer ini; done = transfer lain dengan dokumen sama yang Selesai.
  documentQty: string
  doneQty: string
  transferQty: string
}

export async function getTransferCustoms(transferId: string) {
  const { rows } = await db.execute<{
    id: string
    number: string
    status: string
    movement_code: string
    document_id: string | null
  }>(sql`
    select id, number, status, movement_code, customs_document_id as document_id
    from transfers where id = ${transferId}`)
  const transfer = rows[0]
  if (!transfer) return null
  const allowed = CUSTOMS_MOVEMENT_DOC_CODES[transfer.movement_code] ?? []
  if (!allowed.length) return null

  const document = transfer.document_id ? await linkedDocument(transfer.document_id) : null
  const open = transfer.status !== "done" && transfer.status !== "cancelled"
  const gate = open
    ? (
        await db.execute<{ errors: string[] }>(
          sql`select customs_gate_errors(${transfer.id}) as errors`,
        )
      ).rows[0].errors
    : []
  const quantities = document ? await transferQuantities(transfer.id, document.id) : []
  return {
    transferId: transfer.id,
    number: transfer.number,
    open,
    allowed,
    document,
    gate,
    quantities,
  }
}

export type TransferCustoms = NonNullable<Awaited<ReturnType<typeof getTransferCustoms>>>

async function linkedDocument(id: string): Promise<LinkedCustomsDocument> {
  const { rows } = await db.execute<{
    id: string
    doc_code: CustomsDocCode
    aju_number: string
    aju_date: string
    registration_number: string | null
    registration_date: string | null
    status: CustomsDocumentStatus
  }>(sql`
    select id, doc_code, aju_number, aju_date::text, registration_number,
      registration_date::text, status
    from customs_documents where id = ${id}`)
  const row = rows[0]
  return {
    id: row.id,
    docCode: row.doc_code,
    ajuNumber: row.aju_number,
    ajuDate: row.aju_date,
    registrationNumber: row.registration_number,
    registrationDate: row.registration_date,
    status: row.status,
  }
}

// Qty per produk: dokumen, transfer lain yang sudah Selesai dengan dokumen sama, dan transfer ini.
async function transferQuantities(transferId: string, documentId: string) {
  const { rows } = await db.execute<{
    sku: string
    product_name: string
    uom_code: string
    document_qty: string
    done_qty: string
    transfer_qty: string
  }>(sql`
    with products_in as (
      select product_id from customs_document_lines where document_id = ${documentId}
      union
      select product_id from stock_moves where transfer_id = ${transferId} and status <> 'cancelled'
    )
    select p.sku, p.name as product_name, u.code as uom_code,
      coalesce((select sum(stock_qty) from customs_document_lines
        where document_id = ${documentId} and product_id = p.id), 0)::text as document_qty,
      coalesce((select sum(m.qty) from stock_moves m join transfers t on t.id = m.transfer_id
        where t.customs_document_id = ${documentId} and t.id <> ${transferId}
          and m.status = 'done' and m.product_id = p.id), 0)::text as done_qty,
      coalesce((select sum(qty) from stock_moves
        where transfer_id = ${transferId} and status <> 'cancelled' and product_id = p.id), 0)::text
        as transfer_qty
    from products_in i join products p on p.id = i.product_id join uoms u on u.id = p.uom_id
    order by p.sku`)
  return rows.map((row): CustomsQtyRow => ({
    sku: row.sku,
    productName: row.product_name,
    uomCode: row.uom_code,
    documentQty: row.document_qty,
    doneQty: row.done_qty,
    transferQty: row.transfer_qty,
  }))
}

export type LinkableCustomsDocument = {
  id: string
  docCode: CustomsDocCode
  ajuNumber: string
  registrationNumber: string | null
  status: CustomsDocumentStatus
}

// Dokumen yang bisa ditautkan ke transfer: jenis sesuai arah, belum Batal, cari nomor aju atau
// nomor daftar. Terdaftar dulu, lalu terbaru.
export async function searchLinkableCustomsDocuments(transferId: string, search: string) {
  const { rows: transferRows } = await db.execute<{ movement_code: string }>(
    sql`select movement_code from transfers where id = ${transferId}`,
  )
  const allowed = CUSTOMS_MOVEMENT_DOC_CODES[transferRows[0]?.movement_code ?? ""] ?? []
  if (!allowed.length) return []
  const pattern = containsPattern(search)
  const { rows } = await db.execute<{
    id: string
    doc_code: CustomsDocCode
    aju_number: string
    registration_number: string | null
    status: CustomsDocumentStatus
  }>(sql`
    select id, doc_code, aju_number, registration_number, status
    from customs_documents
    where doc_code::text in (${sql.join(
      allowed.map((code) => sql`${code}`),
      sql`, `,
    )})
      and status <> 'cancelled'
      and (${search} = '' or aju_number ilike ${pattern} or registration_number ilike ${pattern})
    order by (status = 'registered') desc, created_at desc
    limit 20`)
  return rows.map((row): LinkableCustomsDocument => ({
    id: row.id,
    docCode: row.doc_code,
    ajuNumber: row.aju_number,
    registrationNumber: row.registration_number,
    status: row.status,
  }))
}

export type DocumentTransferRow = {
  id: string
  number: string
  type: "receipt" | "delivery"
  status: string
  doneAt: Date | null
}

export type DocumentQtyRow = {
  sku: string
  productName: string
  uomCode: string
  documentQty: string
  doneQty: string
  openQty: string
}

// Sisi dokumen (M4-05): transfer tertaut dan qty per produk dokumen vs transfer Selesai vs transfer
// yang masih berjalan.
export async function getDocumentTransfers(documentId: string) {
  const [transferRows, qtyRows] = await Promise.all([
    db.execute<{
      id: string
      number: string
      type: "receipt" | "delivery"
      status: string
      done_at: string | null
    }>(sql`
      select id, number, type, status, done_at from transfers
      where customs_document_id = ${documentId}
      order by created_at`),
    db.execute<{
      sku: string
      product_name: string
      uom_code: string
      document_qty: string
      done_qty: string
      open_qty: string
    }>(sql`
      with products_in as (
        select product_id from customs_document_lines where document_id = ${documentId}
        union
        select m.product_id from stock_moves m join transfers t on t.id = m.transfer_id
        where t.customs_document_id = ${documentId}
      )
      select p.sku, p.name as product_name, u.code as uom_code,
        coalesce((select sum(stock_qty) from customs_document_lines
          where document_id = ${documentId} and product_id = p.id), 0)::text as document_qty,
        coalesce((select sum(m.qty) from stock_moves m join transfers t on t.id = m.transfer_id
          where t.customs_document_id = ${documentId} and m.product_id = p.id
            and m.status = 'done'), 0)::text as done_qty,
        coalesce((select sum(m.qty) from stock_moves m join transfers t on t.id = m.transfer_id
          where t.customs_document_id = ${documentId} and m.product_id = p.id
            and m.status = 'draft' and t.status not in ('done', 'cancelled')), 0)::text as open_qty
      from products_in i join products p on p.id = i.product_id join uoms u on u.id = p.uom_id
      order by p.sku`),
  ])
  return {
    transfers: transferRows.rows.map((row): DocumentTransferRow => ({
      id: row.id,
      number: row.number,
      type: row.type,
      status: row.status,
      doneAt: row.done_at ? new Date(row.done_at) : null,
    })),
    quantities: qtyRows.rows.map((row): DocumentQtyRow => ({
      sku: row.sku,
      productName: row.product_name,
      uomCode: row.uom_code,
      documentQty: row.document_qty,
      doneQty: row.done_qty,
      openQty: row.open_qty,
    })),
  }
}

export type OriginOption = {
  lineId: string
  docCode: CustomsDocCode
  ajuNumber: string
  registrationNumber: string | null
  seq: number
  // Sisa saldo asal ditambah yang sudah dialokasikan ke baris ini sendiri.
  available: string
}

export type OutLineAllocation = {
  lineId: string
  seq: number
  sku: string
  productName: string
  uomCode: string
  stockQty: string
  allocations: (OriginOption & { qty: string })[]
}

const ORIGIN_OPTION = sql`
  b.line_id, b.doc_code, b.aju_number, b.registration_number, b.seq,
  (b.remaining + coalesce((select sum(x.qty) from origin_allocations x
    where x.origin_line_id = b.line_id and x.out_line_id = l.id), 0))::text as available`

type OriginOptionRow = {
  line_id: string
  doc_code: CustomsDocCode
  aju_number: string
  registration_number: string | null
  seq: number
  available: string
}

const toOption = (row: OriginOptionRow): OriginOption => ({
  lineId: row.line_id,
  docCode: row.doc_code,
  ajuNumber: row.aju_number,
  registrationNumber: row.registration_number,
  seq: row.seq,
  available: row.available,
})

// Alokasi dokumen asal per baris barang dokumen keluar (M4-03, M4-05).
export async function getDocumentAllocations(documentId: string): Promise<OutLineAllocation[]> {
  const [lines, allocations] = await Promise.all([
    db.execute<{
      id: string
      seq: number
      sku: string
      product_name: string
      uom_code: string
      stock_qty: string | null
    }>(sql`
      select l.id, l.seq, p.sku, p.name as product_name, u.code as uom_code,
        l.stock_qty::text
      from customs_document_lines l join products p on p.id = l.product_id
      join uoms u on u.id = p.uom_id
      where l.document_id = ${documentId}
      order by l.seq`),
    db.execute<OriginOptionRow & { out_line_id: string; qty: string }>(sql`
      select a.out_line_id, a.qty::text, ${ORIGIN_OPTION}
      from origin_allocations a
      join customs_document_lines l on l.id = a.out_line_id
      join customs_origin_balances b on b.line_id = a.origin_line_id
      where l.document_id = ${documentId}
      order by b.registration_date, b.aju_number, b.seq`),
  ])
  return lines.rows.map((line) => ({
    lineId: line.id,
    seq: line.seq,
    sku: line.sku,
    productName: line.product_name,
    uomCode: line.uom_code,
    stockQty: line.stock_qty ?? "0",
    allocations: allocations.rows
      .filter((row) => row.out_line_id === line.id)
      .map((row) => ({ ...toOption(row), qty: row.qty })),
  }))
}

// Pilihan saldo asal untuk satu baris dokumen keluar: produk sama, jenis yang boleh, masih ada
// sisa (atau sudah dipakai baris ini). Cari nomor aju atau nomor daftar.
export async function searchOriginOptions(outLineId: string, search: string) {
  const pattern = containsPattern(search)
  const { rows } = await db.execute<OriginOptionRow>(sql`
    select ${ORIGIN_OPTION}
    from customs_document_lines l
    join customs_documents d on d.id = l.document_id
    join customs_origin_balances b on b.product_id = l.product_id
      and b.doc_code = any (customs_origin_doc_codes(d.doc_code))
    where l.id = ${outLineId}
      and (${search} = '' or b.aju_number ilike ${pattern}
        or b.registration_number ilike ${pattern})
    order by b.registration_date, b.aju_number, b.seq
    limit 20`)
  return rows.map(toOption).filter((option) => Number(option.available) > 0)
}

// Saran FIFO (suggest_origin_allocations) beserta keterangan saldo asalnya.
export async function suggestOrigins(outLineId: string) {
  const { rows } = await db.execute<OriginOptionRow & { qty: string }>(sql`
    select s.qty::text, ${ORIGIN_OPTION}
    from suggest_origin_allocations(${outLineId}) s
    join customs_origin_balances b on b.line_id = s.origin_line_id
    join customs_document_lines l on l.id = ${outLineId}`)
  return rows.map((row) => ({ ...toOption(row), qty: row.qty }))
}
