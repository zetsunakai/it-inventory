import "server-only"

import { and, count, eq, notExists, sql } from "drizzle-orm"

import { hasPermission, type Role } from "@/lib/permissions"
import { TRANSFER_KINDS } from "@/modules/inventory/lib/transfer"
import { db } from "@/server/db"
import { company, locations, products, warehouses } from "@/server/db/schema"

export type AttentionItem = {
  // Kalimat yang menyebut apa yang perlu dilakukan, beserta jumlahnya bila ada.
  title: string
  detail: string
  href: string
  tone: "warning" | "danger" | "info"
  // Label penanda; kosong = menurut tone (Wajib, Perhatian, Info).
  label?: string
}

// Hal yang perlu ditindaklanjuti, dari data nyata (skill ui-it-inventory: beranda berisi
// pekerjaan).
export async function attentionItems(user: { id: string; roles: Role[] }) {
  const [master, inventory] = await Promise.all([masterItems(user), inventoryItems(user)])
  return [...master, ...inventory]
}

async function masterItems(user: { id: string; roles: Role[] }) {
  if (!hasPermission(user.roles, "master:read")) return []
  const canEdit = hasPermission(user.roles, "master:write")

  const [[profile], [notReady], emptyWarehouses] = await Promise.all([
    db.select({ name: company.name }).from(company),
    db
      .select({ total: count() })
      .from(products)
      .where(and(eq(products.active, true), eq(products.customsReady, false))),
    db
      .select({ id: warehouses.id, code: warehouses.code })
      .from(warehouses)
      .where(
        and(
          eq(warehouses.active, true),
          sql`can_access_warehouse(${user.id}, ${warehouses.id})`,
          notExists(
            db
              .select({ one: sql`1` })
              .from(locations)
              // Lokasi yang diarsipkan tidak bisa menerima barang.
              .where(and(eq(locations.warehouseId, warehouses.id), eq(locations.active, true))),
          ),
        ),
      ),
  ])

  const items: AttentionItem[] = []
  if (!profile) {
    items.push({
      title: "Profil perusahaan belum diisi",
      detail: canEdit
        ? "Dibutuhkan sebagai entitas Pengusaha/Pemilik di setiap dokumen BC."
        : "Dibutuhkan untuk dokumen BC. Hubungi Administrator.",
      href: "/master/perusahaan",
      tone: "danger",
    })
  }
  if (notReady.total > 0) {
    items.push({
      title: `${notReady.total} produk belum siap dokumen BC`,
      detail: "Kode HS atau satuan CEISA belum diisi, jadi belum bisa dipakai di dokumen BC.",
      href: "/master/produk?dokumen-bc=belum",
      tone: "warning",
    })
  }
  if (emptyWarehouses.length > 0) {
    const codes = emptyWarehouses.map((warehouse) => warehouse.code)
    items.push({
      title: `${emptyWarehouses.length} gudang belum punya lokasi`,
      detail: `${codes.slice(0, 5).join(", ")}${codes.length > 5 ? ", …" : ""}: barang belum bisa diterima ke gudang ini.`,
      href: "/master/gudang",
      tone: "warning",
    })
  }
  return items
}

// Pekerjaan inventory di gudang yang boleh diakses user (RU-01): persetujuan Manajer, opname yang
// membekukan gudang, transfer yang menunggu stok, dan barang yang masih di transit.
async function inventoryItems(user: { id: string; roles: Role[] }) {
  if (!hasPermission(user.roles, "inventory:read")) return []
  const canApprove = hasPermission(user.roles, "inventory:approve")
  // Transfer terlihat bila salah satu sisinya gudang yang boleh diakses.
  const visible = sql`exists (
    select 1 from locations l
    where l.id in (t.source_location_id, t.destination_location_id) and l.warehouse_id is not null
      and can_access_warehouse(${user.id}, l.warehouse_id))`

  const [approvals, waiting, counts, inTransit] = await Promise.all([
    db.execute<{ type: "scrap" | "adjustment"; total: number }>(sql`
      select t.type, count(*)::int as total from transfers t
      where t.type in ('scrap', 'adjustment') and t.approved_at is null
        and t.status::text in ('waiting', 'partially_available', 'ready') and ${visible}
      group by t.type`),
    db.execute<{ type: keyof typeof TRANSFER_KINDS; interwarehouse: boolean; total: number }>(sql`
      select t.type, t.interwarehouse_id is not null as interwarehouse, count(*)::int as total
      from transfers t
      where t.status::text in ('waiting', 'partially_available') and ${visible}
        and t.type in ('delivery', 'internal', 'return', 'scrap', 'adjustment')
      group by 1, 2`),
    db.execute<{ id: string; number: string; status: string; warehouse: string }>(sql`
      select c.id, c.number, c.status::text as status, w.code as warehouse
      from stock_counts c join warehouses w on w.id = c.warehouse_id
      where c.status::text in ('counting', 'counted', 'review')
        and can_access_warehouse(${user.id}, w.id)
      order by c.number`),
    db.execute<{ total: number }>(sql`
      select count(*)::int as total from interwarehouse_transfers i
      join locations s on s.id = i.source_location_id
      where i.status = 'in_progress' and can_access_warehouse(${user.id}, s.warehouse_id)
        and exists (select 1 from interwarehouse_in_transit(i.id))`),
  ])

  const items: AttentionItem[] = []
  if (canApprove) {
    for (const row of approvals.rows) {
      const kind = TRANSFER_KINDS[row.type]
      items.push({
        title: `${row.total} ${kind.noun} menunggu persetujuan`,
        detail: "Stok baru berubah setelah Manajer menyetujui dan memvalidasinya.",
        href: `${kind.path}?antrean=persetujuan`,
        tone: "warning",
        label: "Persetujuan",
      })
    }
    const review = counts.rows.filter((row) => row.status === "review")
    if (review.length > 0) {
      items.push({
        title: `${review.length} stock opname menunggu persetujuan`,
        detail: `${review.map((row) => `${row.number} (${row.warehouse})`).join(", ")}: gudangnya tetap beku sampai disetujui atau ditolak.`,
        href:
          review.length === 1
            ? `/inventory/opname/${review[0].id}`
            : "/inventory/opname?status=review",
        tone: "warning",
        label: "Persetujuan",
      })
    }
  }
  const running = counts.rows.filter((row) => row.status !== "review")
  if (running.length > 0) {
    items.push({
      title: `${running.length} gudang dibekukan untuk stock opname`,
      detail: `${running.map((row) => `${row.warehouse} (${row.number})`).join(", ")}: transfer di gudang ini belum bisa divalidasi.`,
      href: running.length === 1 ? `/inventory/opname/${running[0].id}` : "/inventory/opname",
      tone: "info",
      label: "Opname",
    })
  }
  for (const row of waiting.rows) {
    // Transfer retur dan transfer keluar antar gudang dibuka dari daftar permintaannya.
    const [noun, href] = row.interwarehouse
      ? ["transfer antar gudang", "/inventory/antar-gudang"]
      : row.type === "return"
        ? ["transfer retur", "/inventory/retur"]
        : [TRANSFER_KINDS[row.type].noun, TRANSFER_KINDS[row.type].path]
    items.push({
      title: `${row.total} ${noun} menunggu stok`,
      detail: "Stok di lokasi asal belum cukup. Tekan Cek stok setelah barang tersedia.",
      href,
      tone: "warning",
    })
  }
  if (inTransit.rows[0]?.total) {
    items.push({
      title: `${inTransit.rows[0].total} transfer antar gudang masih di perjalanan`,
      detail: "Barang sudah keluar dari gudang asal dan belum diterima di gudang tujuan.",
      href: "/inventory/antar-gudang?status=in_progress",
      tone: "info",
      label: "Di transit",
    })
  }
  return items
}
