import "server-only"

import { and, count, eq, notExists, sql } from "drizzle-orm"

import { hasPermission, type Role } from "@/lib/permissions"
import { db } from "@/server/db"
import { company, locations, products, warehouses } from "@/server/db/schema"

export type AttentionItem = {
  // Kalimat yang menyebut apa yang perlu dilakukan, beserta jumlahnya bila ada.
  title: string
  detail: string
  href: string
  tone: "warning" | "danger"
}

// Hal yang perlu ditindaklanjuti, dari data nyata (skill ui-it-inventory: beranda berisi
// pekerjaan). Pengecualian transaksi (PRD 8.6) menyusul di M4.
export async function attentionItems(user: { id: string; roles: Role[] }) {
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
              .where(eq(locations.warehouseId, warehouses.id)),
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
