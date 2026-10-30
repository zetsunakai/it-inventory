import { and, eq, inArray, like, sql } from "drizzle-orm"
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest"

import { importLocations } from "@/modules/inventory/actions/warehouses"
import { importPartners } from "@/modules/inventory/actions/partners"
import { importProducts } from "@/app/(app)/master/produk/actions"
import type { ActionResult, FormState } from "@/lib/action-result"
import type { ImportResult } from "@/lib/import"
import type { Role } from "@/lib/permissions"
import type { CurrentUser } from "@/server/auth/session"
import { db } from "@/server/db"
import {
  auditLogs,
  locations,
  partners,
  products,
  refCodes,
  uomCategories,
  userRoles,
  users,
  userWarehouses,
  uoms,
  warehouses,
} from "@/server/db/schema"
import { exportLocations } from "@/modules/inventory/server/master-io/locations"
import { exportProducts } from "@/modules/it-inventory/server/master-io/products"
import { writeSpreadsheet } from "@/server/spreadsheet"

// Import/export master data dari Excel/CSV (backlog M1-07). Semua data uji berawalan ZM.

const session = vi.hoisted(() => ({ user: null as CurrentUser | null }))
vi.mock("@/server/auth/session", () => ({ requireUser: async () => session.user }))
vi.mock("next/cache", () => ({ refresh: vi.fn() }))

function loginAs(roles: Role[]) {
  session.user = {
    id: crypto.randomUUID(),
    name: "User Tes",
    email: "tes@it-inventory.local",
    roles,
    twoFactorEnabled: true,
  }
  return session.user
}

type ImportAction = (
  state: FormState<ImportResult>,
  formData: FormData,
) => Promise<ActionResult<ImportResult>>

// CSV dengan titik koma, seperti yang disimpan Excel berbahasa Indonesia.
function csv(rows: string[][], name = "data.csv") {
  return new File([rows.map((row) => row.join(";")).join("\r\n")], name, { type: "text/csv" })
}

async function xlsx(rows: string[][]) {
  const [header, ...data] = rows
  const body = await writeSpreadsheet(
    "xlsx",
    "Data",
    header.map((title) => ({ header: title, width: 10 })),
    data,
  )
  return new File([body as BlobPart], "data.xlsx")
}

async function run(action: ImportAction, file: File) {
  const data = new FormData()
  data.set("file", file)
  return action(null, data)
}

// Hasil import yang diharapkan berhasil dijalankan (validasi bisa lolos atau tidak).
async function runImport(action: ImportAction, file: File) {
  const result = await run(action, file)
  if (!result.ok) throw new Error(`Import gagal: ${result.errors.join(" | ")}`)
  return result.data
}

function invalid(result: ImportResult) {
  if (result.status !== "invalid") throw new Error("Import seharusnya ditolak.")
  return result.errors
}

let warehouseOne: string
let warehouseTwo: string

beforeAll(async () => {
  const [category] = await db
    .insert(uomCategories)
    .values({ code: "ZMCAT", name: "Kategori import uji" })
    .returning({ id: uomCategories.id })
  await db.insert(uoms).values([
    { code: "ZMPCS", name: "Buah", categoryId: category.id, factor: "1", isReference: true },
    { code: "ZMLUSIN", name: "Lusin", categoryId: category.id, factor: "12" },
    { code: "ZMOLD", name: "Lama", categoryId: category.id, factor: "2", active: false },
  ])
  await db.insert(refCodes).values([
    { type: "hs_code", code: "99990201", name: "Barang uji satu" },
    { type: "hs_code", code: "99990202", name: "Barang uji dua" },
    { type: "hs_code", code: "99990203", name: "Barang uji lama", active: false },
    { type: "hs_code", code: "09990201", name: "Barang uji bab 09" },
    { type: "ceisa_unit", code: "ZMU", name: "Satuan CEISA uji" },
    { type: "country", code: "ZM", name: "Negara uji" },
  ])
  const rows = await db
    .insert(warehouses)
    .values(
      ["ZMG1", "ZMG2"].map((code) => ({
        code,
        name: `Gudang ${code}`,
        address: "Bekasi",
      })),
    )
    .returning({ id: warehouses.id })
  ;[warehouseOne, warehouseTwo] = rows.map((row) => row.id)
})

beforeEach(() => loginAs(["administrator"]))

afterEach(async () => {
  await db.delete(products).where(like(products.sku, "ZM%"))
  await db.delete(partners).where(like(partners.name, "ZM %"))
  // Lepas induk dulu: foreign key induk lokasi bersifat restrict.
  await db.update(locations).set({ parentId: null }).where(like(locations.code, "ZM%"))
  await db.delete(locations).where(like(locations.code, "ZM%"))
})

afterAll(async () => {
  await db.delete(warehouses).where(like(warehouses.code, "ZM%"))
  await db.delete(uoms).where(like(uoms.code, "ZM%"))
  await db.delete(uomCategories).where(like(uomCategories.code, "ZM%"))
  await db
    .delete(refCodes)
    .where(inArray(refCodes.code, ["99990201", "99990202", "99990203", "09990201", "ZMU", "ZM"]))
  await db.$client.end()
})

// Termasuk kolom lama Satuan CEISA dan Faktor CEISA (dihapus di RM-01): diabaikan saat import.
const PRODUCT_HEADER = [
  "SKU",
  "Nama",
  "Kategori",
  "Satuan stok",
  "Kode HS",
  "Satuan CEISA",
  "Faktor CEISA",
  "Wajib lot",
]

describe("import produk", () => {
  test("produk baru dari Excel tersimpan dan tercatat di audit log", async () => {
    const result = await runImport(
      importProducts,
      await xlsx([
        PRODUCT_HEADER,
        ["ZMP1", "Baut M8", "Bahan baku", "ZMPCS", "9999.02.01", "zmu", "1", "Ya"],
        ["ZMP2", "Mur M8", "barang jadi", "zmlusin", "", "", "", ""],
      ]),
    )
    expect(result).toEqual({ status: "imported", total: 2, created: 2, updated: 0, unchanged: 0 })

    const rows = await db
      .select()
      .from(products)
      .where(like(products.sku, "ZMP%"))
      .orderBy(products.sku)
    expect(rows.map((row) => [row.sku, row.category, row.hsCode])).toEqual([
      ["ZMP1", "raw_material", "99990201"],
      ["ZMP2", "finished_good", null],
    ])
    // Kolom lama "Wajib lot" tetap terbaca: Ya = per lot, kosong = tanpa pelacakan.
    expect(rows.map((row) => [row.tracking, row.active, row.customsReady])).toEqual([
      ["lot", true, true],
      ["none", true, false],
    ])

    const audit = await db
      .select({ action: auditLogs.action, userId: auditLogs.userId })
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.tableName, "products"),
          inArray(
            auditLogs.recordId,
            rows.map((row) => row.id),
          ),
        ),
      )
    expect(audit).toEqual([
      { action: "INSERT", userId: session.user!.id },
      { action: "INSERT", userId: session.user!.id },
    ])
  })

  test("satu baris salah: tidak ada yang disimpan, semua kesalahan dilaporkan per baris", async () => {
    const result = await runImport(
      importProducts,
      csv([
        PRODUCT_HEADER,
        ["ZMP1", "Valid", "Bahan baku", "ZMPCS", "", "", "", ""],
        ["ZMP2", "Kategori salah", "Bahan", "ZMPCS", "", "", "", ""],
        ["ZMP3", "Satuan salah", "WIP", "ZMXX", "", "", "", ""],
        ["ZMP4", "", "WIP", "ZMOLD", "99990299", "ZMU", "", "mungkin"],
        ["ZMP1", "Kembar", "WIP", "ZMPCS", "99990203", "", "", ""],
      ]),
    )
    expect(invalid(result)).toEqual([
      {
        line: 3,
        key: "ZMP2",
        messages: [
          'Kategori "Bahan" tidak dikenal. Pilih Bahan baku, WIP, Barang jadi, Mesin & peralatan, atau Scrap & reject.',
        ],
      },
      {
        line: 4,
        key: "ZMP3",
        messages: ["Satuan stok ZMXX tidak ditemukan atau sudah diarsipkan."],
      },
      {
        line: 5,
        key: "ZMP4",
        messages: [
          'Pelacakan "mungkin" tidak dikenal. Pilih Tanpa pelacakan, Per lot, atau Per nomor seri.',
          "Nama produk wajib diisi.",
          "Satuan stok ZMOLD tidak ditemukan atau sudah diarsipkan.",
          "Kode HS 99990299 tidak ada di referensi kepabeanan.",
        ],
      },
      {
        line: 6,
        key: "ZMP1",
        messages: [
          "Product code ZMP1 sudah ada di baris 2.",
          "Kode HS 99990203 tidak ada di referensi kepabeanan.",
        ],
      },
    ])
    const [{ total }] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(products)
      .where(like(products.sku, "ZMP%"))
    expect(total).toBe(0)
  })

  test("SKU yang sudah ada diperbarui; kolom yang tidak ada di file tidak berubah", async () => {
    await runImport(
      importProducts,
      csv([
        ["SKU", "Nama", "Kategori", "Satuan stok", "Merk"],
        ["ZMP1", "Baut", "WIP", "ZMPCS", "ACME"],
        ["ZMP2", "Mur", "WIP", "ZMPCS", "ACME"],
      ]),
    )

    // Hanya kolom SKU dan Kode HS: isi HS massal tanpa menyentuh kolom lain.
    const result = await runImport(
      importProducts,
      csv([
        ["SKU", "Kode HS"],
        ["ZMP1", "99990201"],
        ["ZMP2", ""],
      ]),
    )
    expect(result).toEqual({ status: "imported", total: 2, created: 0, updated: 1, unchanged: 1 })
    const [row] = await db.select().from(products).where(eq(products.sku, "ZMP1"))
    expect([row.name, row.brand, row.category, row.hsCode]).toEqual([
      "Baut",
      "ACME",
      "wip",
      "99990201",
    ])

    // Satuan stok tidak bisa diubah, sama seperti di form.
    const rejected = await runImport(
      importProducts,
      csv([
        ["SKU", "Satuan stok"],
        ["ZMP1", "ZMLUSIN"],
      ]),
    )
    expect(invalid(rejected)[0].messages).toEqual([
      "Satuan stok tidak bisa diubah (tersimpan: ZMPCS).",
    ])
  })

  test("kode HS 7 digit dari Excel dilengkapi angka 0 di depan", async () => {
    await runImport(
      importProducts,
      csv([
        ["SKU", "Nama", "Kategori", "Satuan stok", "Kode HS"],
        ["ZMP1", "Kopi", "Bahan baku", "ZMPCS", "9990201"],
      ]),
    )
    const [row] = await db.select().from(products).where(eq(products.sku, "ZMP1"))
    expect(row.hsCode).toBe("09990201")
  })

  test("export lalu import ulang file yang sama tidak mengubah apa pun", async () => {
    await runImport(
      importProducts,
      csv([
        [...PRODUCT_HEADER, "Berat netto (kg)", "Aktif"],
        ["ZMP1", "Baut", "Bahan baku", "ZMPCS", "99990201", "ZMU", "0,5", "Ya", "0,25", "Ya"],
        ["ZMP2", "Mur", "WIP", "ZMPCS", "", "", "", "", "", "Tidak"],
      ]),
    )
    const exported = await exportProducts("xlsx")
    const result = await runImport(importProducts, new File([exported as BlobPart], "p.xlsx"))
    expect(result.status).toBe("imported")
    if (result.status === "imported") {
      expect([result.created, result.updated]).toEqual([0, 0])
    }
  })

  test("judul kolom yang tidak dikenal atau tanpa kolom SKU ditolak sebelum baris diperiksa", async () => {
    const result = await run(
      importProducts,
      csv([
        ["Nama", "Harga"],
        ["Baut", "1000"],
      ]),
    )
    expect(result).toMatchObject({
      ok: false,
      errors: [
        'Kolom tidak dikenal: "Harga". Gunakan judul kolom dari file export.',
        "Kolom Product code wajib ada.",
      ],
    })
  })

  test("hanya peran dengan izin master:write yang boleh import", async () => {
    loginAs(["manajer"])
    const result = await run(importProducts, csv([["SKU"], ["ZMP1"]]))
    expect(result).toMatchObject({ ok: false })
  })

  test("5.000 produk ter-import di bawah 1 menit", { timeout: 120_000 }, async () => {
    const rows = Array.from({ length: 5000 }, (_, index) => [
      `ZMB${String(index).padStart(5, "0")}`,
      `Produk massal ${index}`,
      "Bahan baku",
      "ZMPCS",
      index % 2 ? "99990201" : "99990202",
      "ZMU",
      "1",
      index % 3 ? "Tidak" : "Ya",
    ])
    const file = await xlsx([PRODUCT_HEADER, ...rows])

    const started = performance.now()
    const result = await runImport(importProducts, file)
    const seconds = (performance.now() - started) / 1000

    expect(result).toEqual({
      status: "imported",
      total: 5000,
      created: 5000,
      updated: 0,
      unchanged: 0,
    })
    expect(seconds).toBeLessThan(60)
    console.info(`[M1-07] import 5.000 produk: ${seconds.toFixed(1)} detik`)
  })
})

describe("import partner", () => {
  const HEADER = ["NPWP", "NITKU", "Nama", "Alamat", "Negara", "Jenis identitas"]

  const saved = () =>
    db.select().from(partners).where(like(partners.name, "ZM %")).orderBy(partners.name)

  test("file lama (kolom Kode, Vendor, Customer) tetap terbaca; NITKU kantor pusat otomatis", async () => {
    const result = await runImport(
      importPartners,
      csv([
        [
          "Kode",
          "Nama",
          "Alamat",
          "Negara",
          "Vendor",
          "Customer",
          "Jenis identitas",
          "Nomor identitas",
          "NITKU",
        ],
        [
          "ZMV1",
          "ZM Pemasok",
          "Bekasi",
          "zm",
          "Ya",
          "",
          "NPWP 15 digit",
          "01.234.567.8-901.000",
          "",
        ],
        ["ZMC1", "ZM Buyer Ltd", "Tokyo", "ZM", "", "Ya", "Paspor", "ab 12345", ""],
      ]),
    )
    expect(result).toEqual({ status: "imported", total: 2, created: 2, updated: 0, unchanged: 0 })
    expect(
      (await saved()).map((row) => [row.name, row.identityType, row.identityNumber, row.nitku]),
    ).toEqual([
      ["ZM Buyer Ltd", "passport", "AB12345", null],
      ["ZM Pemasok", "npwp15", "012345678901000", "0012345678901000000000"],
    ])
  })

  test("NPWP yang sudah ada diperbarui; cabang dipilih lewat NITKU", async () => {
    await runImport(
      importPartners,
      csv([
        HEADER,
        ["1111222233334444", "", "ZM Pusat", "Bekasi", "ZM", "NPWP 16 digit"],
        [
          "1111222233334444",
          "1111222233334444000001",
          "ZM Cabang",
          "Bekasi",
          "ZM",
          "NPWP 16 digit",
        ],
      ]),
    )
    const result = await runImport(
      importPartners,
      csv([
        ["NPWP", "NITKU", "Alamat"],
        ["1111.2222.3333.4444", "", "Jakarta"],
        ["1111222233334444", "1111222233334444000001", "Cikarang"],
      ]),
    )
    expect(result).toEqual({ status: "imported", total: 2, created: 0, updated: 2, unchanged: 0 })
    expect((await saved()).map((row) => [row.name, row.address])).toEqual([
      ["ZM Cabang", "Cikarang"],
      ["ZM Pusat", "Jakarta"],
    ])
  })

  test("NITKU dobel, negara dan jenis identitas tidak dikenal, NPWP dobel di file", async () => {
    await runImport(
      importPartners,
      csv([HEADER, ["0012345678901000", "", "ZM Satu", "Bekasi", "ZM", "NPWP 16 digit"]]),
    )
    const result = await runImport(
      importPartners,
      csv([
        HEADER,
        ["012345678901000", "", "ZM Dua", "Bekasi", "ZM", "npwp15"],
        ["123", "", "ZM Tiga", "Bekasi", "XX", "SIM"],
        ["5555222233334444", "", "ZM Empat", "Bekasi", "ZM", "NPWP 16 digit"],
        ["5555222233334444", "", "ZM Lima", "Bekasi", "ZM", "NPWP 16 digit"],
      ]),
    )
    expect(invalid(result)).toEqual([
      {
        line: 2,
        key: "012345678901000",
        messages: ["NITKU 0012345678901000000000 sudah dipakai partner ZM Satu."],
      },
      {
        line: 3,
        key: "123",
        messages: [
          'Jenis identitas "SIM" tidak dikenal. Pilih NPWP 16 digit, NPWP 15 digit, Paspor, KTP, atau Lainnya.',
          "Negara dengan kode XX tidak ditemukan.",
        ],
      },
      {
        line: 5,
        key: "5555222233334444",
        messages: ["NPWP 5555222233334444 sudah ada di baris 4."],
      },
    ])
  })
})

describe("import lokasi", () => {
  const HEADER = ["Kode", "Nama", "Tipe", "Gudang", "Induk"]

  async function locationTree() {
    const rows = await db
      .select({ id: locations.id, code: locations.code, parentId: locations.parentId })
      .from(locations)
      .where(like(locations.code, "ZM%"))
    const codeById = new Map(rows.map((row) => [row.id, row.code]))
    return Object.fromEntries(
      rows.map((row) => [row.code, row.parentId ? codeById.get(row.parentId) : null]),
    )
  }

  test("induk boleh ditulis di baris setelahnya; lokasi disimpan dari atas ke bawah", async () => {
    const result = await runImport(
      importLocations,
      csv([
        HEADER,
        ["ZMR-A-01", "Bin A-01", "Internal", "ZMG1", "ZMR-A"],
        ["ZMR-A", "Rak A", "internal", "ZMG1", ""],
        ["ZMSCRAP", "Area scrap", "Scrap", "ZMG2", ""],
      ]),
    )
    expect(result).toMatchObject({ status: "imported", created: 3 })
    expect(await locationTree()).toEqual({
      "ZMR-A-01": "ZMR-A",
      "ZMR-A": null,
      ZMSCRAP: null,
    })
    const saved = await db
      .select({ code: locations.code, type: locations.type, warehouseId: locations.warehouseId })
      .from(locations)
      .where(like(locations.code, "ZM%"))
      .orderBy(locations.code)
    expect(saved).toEqual([
      { code: "ZMR-A", type: "internal", warehouseId: warehouseOne },
      { code: "ZMR-A-01", type: "internal", warehouseId: warehouseOne },
      { code: "ZMSCRAP", type: "scrap", warehouseId: warehouseTwo },
    ])
  })

  test("menukar induk dan anak berhasil tanpa lingkaran sementara", async () => {
    await runImport(
      importLocations,
      csv([HEADER, ["ZMA", "A", "Internal", "ZMG1", ""], ["ZMB", "B", "Internal", "ZMG1", "ZMA"]]),
    )
    // File urut A dulu: bila disimpan sesuai urutan file, A → B sempat membentuk lingkaran.
    const result = await runImport(
      importLocations,
      csv([
        ["Kode", "Induk"],
        ["ZMA", "ZMB"],
        ["ZMB", ""],
      ]),
    )
    expect(result).toMatchObject({ status: "imported", updated: 2 })
    expect(await locationTree()).toEqual({ ZMA: "ZMB", ZMB: null })
  })

  test("tipe dan gudang tidak bisa diubah; lokasi virtual, beda gudang, dan lingkaran ditolak", async () => {
    await runImport(
      importLocations,
      csv([HEADER, ["ZMA", "A", "Internal", "ZMG1", ""], ["ZMB", "B", "Internal", "ZMG1", "ZMA"]]),
    )
    const result = await runImport(
      importLocations,
      csv([
        HEADER,
        ["ZMA", "A", "Transit", "ZMG2", "ZMB"],
        ["ZMV", "Vendor baru", "Vendor", "", ""],
        ["ZMC", "C", "Internal", "ZMG2", "ZMB"],
        ["ZMD", "D", "Internal", "ZMG9", ""],
      ]),
    )
    expect(invalid(result)).toEqual([
      {
        line: 2,
        key: "ZMA",
        messages: [
          "Tipe lokasi tidak bisa diubah (tersimpan: Internal).",
          "Gudang lokasi tidak bisa diubah (tersimpan: ZMG1).",
          "Lokasi induk ZMB harus berada di gudang yang sama.",
        ],
      },
      {
        line: 3,
        key: "ZMV",
        messages: [
          "Lokasi bertipe Vendor hanya dibuat oleh sistem. Pilih Internal, Transit, atau Scrap.",
          "Gudang wajib diisi untuk lokasi baru.",
        ],
      },
      { line: 4, key: "ZMC", messages: ["Lokasi induk ZMB harus berada di gudang yang sama."] },
      { line: 5, key: "ZMD", messages: ["Gudang ZMG9 tidak ditemukan."] },
    ])

    const cycle = await runImport(
      importLocations,
      csv([
        ["Kode", "Induk"],
        ["ZMA", "ZMB"],
      ]),
    )
    expect(invalid(cycle)[0].messages).toEqual([
      "Lokasi induk ZMB berada di bawah lokasi ini sendiri.",
    ])
  })

  test("export lokasi berisi kode gudang dan induk, hanya gudang yang boleh dilihat", async () => {
    await runImport(
      importLocations,
      csv([
        HEADER,
        ["ZMA", "A", "Internal", "ZMG1", ""],
        ["ZMB", "B", "Internal", "ZMG1", "ZMA"],
        ["ZMC", "C", "Internal", "ZMG2", ""],
      ]),
    )
    // Admin gudang yang hanya diberi akses ke ZMG1 (can_access_warehouse membaca tabel asli).
    const [user] = await db
      .insert(users)
      .values({ name: "Uji import", email: "zm-gudang@import.test", emailVerified: true })
      .returning({ id: users.id })
    try {
      await db.insert(userRoles).values({ userId: user.id, role: "admin_gudang" })
      await db.insert(userWarehouses).values({ userId: user.id, warehouseId: warehouseOne })

      const text = new TextDecoder().decode(await exportLocations("csv", user.id))
      expect(text).toContain("ZMA,A,Internal,ZMG1,,Ya")
      expect(text).toContain("ZMB,B,Internal,ZMG1,ZMA,Ya")
      expect(text).not.toContain("ZMC")
    } finally {
      await db.delete(users).where(eq(users.id, user.id))
    }
  })
})
