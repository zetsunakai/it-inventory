import "server-only"

import { sql } from "drizzle-orm"

import { hasPermission, type Role } from "@/lib/permissions"
import type { AttentionItem } from "@/modules/inventory/server/queries/home"
import type { CustomsDocCode } from "@/modules/it-inventory/lib/customs"
import { db } from "@/server/db"

// Laporan pengecualian dokumen BC (backlog M4-06, PRD 8.6), untuk staf exim dan manajer.

// Dokumen Terdaftar dianggap menganggur bila belum ada transfer Selesai setelah sekian hari.
export const IDLE_DOCUMENT_DAYS = 7
// Saldo asal "hampir habis": sisa paling banyak 10% dari qty masuk.
export const LOW_ORIGIN_RATIO = 0.1

const TODAY = sql`(now() at time zone 'Asia/Jakarta')::date`

export type UndocumentedTransfer = {
  id: string
  number: string
  type: "receipt" | "delivery"
  doneAt: Date
  partnerName: string | null
}

export type IdleDocument = {
  id: string
  docCode: CustomsDocCode
  ajuNumber: string
  registrationNumber: string | null
  registrationDate: string
  days: number
}

export type QtyGap = {
  documentId: string
  docCode: CustomsDocCode
  ajuNumber: string
  sku: string
  productName: string
  uomCode: string
  documentQty: string
  doneQty: string
}

export type LowOrigin = {
  documentId: string
  docCode: CustomsDocCode
  ajuNumber: string
  registrationNumber: string | null
  seq: number
  sku: string
  productName: string
  uomCode: string
  qtyIn: string
  remaining: string
}

export async function customsExceptions() {
  const [undocumented, idle, gaps, low] = await Promise.all([
    // Penerimaan/pengiriman Selesai tanpa dokumen: seharusnya mustahil sejak gerbang M4, kecuali
    // transfer lama sebelum gerbang aktif.
    db.execute<{
      id: string
      number: string
      type: "receipt" | "delivery"
      done_at: string
      partner_name: string | null
    }>(sql`
      select t.id, t.number, t.type, t.done_at, p.name as partner_name
      from transfers t left join partners p on p.id = t.partner_id
      where t.movement_code in ('gr', 'gi') and t.status = 'done'
        and t.customs_document_id is null
      order by t.done_at desc
      limit 200`),
    db.execute<{
      id: string
      doc_code: CustomsDocCode
      aju_number: string
      registration_number: string | null
      registration_date: string
      days: number
    }>(sql`
      select d.id, d.doc_code, d.aju_number, d.registration_number,
        d.registration_date::text, (${TODAY} - d.registration_date)::int as days
      from customs_documents d
      where d.status = 'registered'
        and d.registration_date < ${TODAY} - ${IDLE_DOCUMENT_DAYS}::int
        and not exists (
          select 1 from transfers t where t.customs_document_id = d.id and t.status = 'done'
        )
      order by d.registration_date`),
    // Dokumen Terdaftar yang sudah dipakai transfer Selesai, tapi qty Selesai per produk belum sama
    // dengan qty dokumen.
    db.execute<{
      document_id: string
      doc_code: CustomsDocCode
      aju_number: string
      sku: string
      product_name: string
      uom_code: string
      document_qty: string
      done_qty: string
    }>(sql`
      with docs as (
        select d.id, d.doc_code, d.aju_number from customs_documents d
        where d.status = 'registered' and exists (
          select 1 from transfers t where t.customs_document_id = d.id and t.status = 'done'
        )
      ),
      per_product as (
        select docs.id as document_id, l.product_id, sum(coalesce(l.stock_qty, 0)) as document_qty
        from docs join customs_document_lines l on l.document_id = docs.id
        group by docs.id, l.product_id
      ),
      done as (
        select t.customs_document_id as document_id, m.product_id, sum(m.qty) as done_qty
        from transfers t join stock_moves m on m.transfer_id = t.id
        where t.customs_document_id in (select id from docs) and m.status = 'done'
        group by t.customs_document_id, m.product_id
      )
      select docs.id as document_id, docs.doc_code, docs.aju_number, p.sku,
        p.name as product_name, u.code as uom_code,
        coalesce(pp.document_qty, 0)::text as document_qty,
        coalesce(dn.done_qty, 0)::text as done_qty
      from per_product pp
      full join done dn on dn.document_id = pp.document_id and dn.product_id = pp.product_id
      join docs on docs.id = coalesce(pp.document_id, dn.document_id)
      join products p on p.id = coalesce(pp.product_id, dn.product_id)
      join uoms u on u.id = p.uom_id
      where coalesce(pp.document_qty, 0) <> coalesce(dn.done_qty, 0)
      order by docs.aju_number, p.sku`),
    db.execute<{
      document_id: string
      doc_code: CustomsDocCode
      aju_number: string
      registration_number: string | null
      seq: number
      sku: string
      product_name: string
      uom_code: string
      qty_in: string
      remaining: string
    }>(sql`
      select b.document_id, b.doc_code, b.aju_number, b.registration_number, b.seq, p.sku,
        p.name as product_name, u.code as uom_code, b.qty_in::text, b.remaining::text
      from customs_origin_balances b
      join products p on p.id = b.product_id join uoms u on u.id = p.uom_id
      where b.qty_in > 0 and b.remaining <= b.qty_in * ${LOW_ORIGIN_RATIO}
      order by b.remaining, b.registration_date`),
  ])
  return {
    undocumented: undocumented.rows.map((row): UndocumentedTransfer => ({
      id: row.id,
      number: row.number,
      type: row.type,
      doneAt: new Date(row.done_at),
      partnerName: row.partner_name,
    })),
    idle: idle.rows.map((row): IdleDocument => ({
      id: row.id,
      docCode: row.doc_code,
      ajuNumber: row.aju_number,
      registrationNumber: row.registration_number,
      registrationDate: row.registration_date,
      days: row.days,
    })),
    gaps: gaps.rows.map((row): QtyGap => ({
      documentId: row.document_id,
      docCode: row.doc_code,
      ajuNumber: row.aju_number,
      sku: row.sku,
      productName: row.product_name,
      uomCode: row.uom_code,
      documentQty: row.document_qty,
      doneQty: row.done_qty,
    })),
    low: low.rows.map((row): LowOrigin => ({
      documentId: row.document_id,
      docCode: row.doc_code,
      ajuNumber: row.aju_number,
      registrationNumber: row.registration_number,
      seq: row.seq,
      sku: row.sku,
      productName: row.product_name,
      uomCode: row.uom_code,
      qtyIn: row.qty_in,
      remaining: row.remaining,
    })),
  }
}

export type CustomsExceptions = Awaited<ReturnType<typeof customsExceptions>>

const PAGE = "/dokumen-bc/pengecualian"

// Ringkasan untuk Beranda bagian Perlu perhatian.
export async function customsAttentionItems(user: { roles: Role[] }): Promise<AttentionItem[]> {
  if (!hasPermission(user.roles, "bc:read")) return []
  const { undocumented, idle, gaps, low } = await customsExceptions()
  const items: AttentionItem[] = []
  if (undocumented.length) {
    items.push({
      title: `${undocumented.length} penerimaan/pengiriman Selesai tanpa dokumen BC`,
      detail: "Transfer lama sebelum gerbang dokumen aktif. Telusuri dan lengkapi dokumennya.",
      href: `${PAGE}#tanpa-dokumen`,
      tone: "danger",
    })
  }
  if (gaps.length) {
    items.push({
      title: `${gaps.length} selisih qty dokumen BC vs transfer`,
      detail: "Qty transfer Selesai per produk belum sama dengan qty dokumen Terdaftar.",
      href: `${PAGE}#selisih`,
      tone: "warning",
    })
  }
  if (idle.length) {
    items.push({
      title: `${idle.length} dokumen BC Terdaftar belum dipakai transfer`,
      detail: `Lebih dari ${IDLE_DOCUMENT_DAYS} hari sejak tanggal daftar tanpa transfer Selesai.`,
      href: `${PAGE}#menganggur`,
      tone: "warning",
    })
  }
  if (low.length) {
    items.push({
      title: `${low.length} saldo dokumen asal hampir atau sudah habis`,
      detail: "Barang keluar berikutnya perlu dokumen asal lain.",
      href: `${PAGE}#saldo-asal`,
      tone: "info",
    })
  }
  return items
}
