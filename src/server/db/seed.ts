import { readFileSync } from "node:fs"
import path from "node:path"

import { loadEnvConfig } from "@next/env"
import { hashPassword } from "better-auth/crypto"
import { parse } from "csv-parse/sync"
import { eq, inArray } from "drizzle-orm"

import type { Role } from "../../lib/permissions"
import { REF_CODE_TYPES } from "../../lib/ref-codes"
import { createDb, type Db } from "./client"
import {
  accounts,
  locations,
  refCodes,
  systemSettings,
  uomCategories,
  uoms,
  userRoles,
  users,
} from "./schema"

// Seed bersifat idempoten: aman dijalankan berulang kali,
// dan tidak menimpa nilai yang sudah diubah lewat aplikasi.
async function main() {
  loadEnvConfig(process.cwd())
  const url = requireEnv("DATABASE_URL")

  const { db, pool } = createDb(url)
  try {
    await seedSettings(db)
    await seedRefCodes(db)
    await seedVirtualLocations(db)
    await seedUoms(db)
    await seedAdmin(db)
    if (process.env.SEED_DEMO_USERS === "true") await seedDemoUsers(db)
    console.log("Seed selesai.")
  } finally {
    await pool.end()
  }
}

async function seedSettings(db: Db) {
  await db
    .insert(systemSettings)
    .values([
      { key: "app.timezone", value: "Asia/Jakarta", description: "Zona waktu aplikasi" },
      { key: "app.locale", value: "id-ID", description: "Format tanggal dan angka" },
    ])
    .onConflictDoNothing()
}

// Referensi kepabeanan dari CSV di seed-data/ref-codes (PRD bagian 5.2). Baris yang sudah ada
// tidak disentuh, jadi perubahan Administrator lewat aplikasi tetap aman. CSV dibuat oleh
// scripts/import-ref-codes-from-odoo.ts.
const REF_CODES_DIR = path.join(import.meta.dirname, "seed-data/ref-codes")
const INSERT_BATCH = 2000

async function seedRefCodes(db: Db) {
  for (const type of REF_CODE_TYPES) {
    const rows: { code: string; name: string; parent_code?: string }[] = parse(
      readFileSync(path.join(REF_CODES_DIR, `${type}.csv`)),
      { columns: true, skip_empty_lines: true },
    )
    let inserted = 0
    for (let start = 0; start < rows.length; start += INSERT_BATCH) {
      const result = await db
        .insert(refCodes)
        .values(
          rows.slice(start, start + INSERT_BATCH).map((row) => ({
            type,
            code: row.code,
            name: row.name,
            parentCode: row.parent_code || null,
          })),
        )
        .onConflictDoNothing()
        .returning({ id: refCodes.id })
      inserted += result.length
    }
    if (inserted) console.log(`Referensi ${type}: ${inserted} baris baru`)
  }
}

// Lokasi virtual di luar gudang, asal/tujuan pergerakan (PRD bagian 5.1 dan 6.2).
async function seedVirtualLocations(db: Db) {
  await db
    .insert(locations)
    .values([
      { code: "VENDOR", name: "Vendor", type: "vendor" },
      { code: "CUSTOMER", name: "Customer", type: "customer" },
      { code: "SCRAP", name: "Scrap", type: "scrap" },
      { code: "PENYESUAIAN", name: "Penyesuaian stok", type: "adjustment" },
    ])
    .onConflictDoNothing()
}

// Satuan dasar per kategori (PRD bagian 5.1). Satuan pertama tiap kategori adalah acuannya;
// factor = berapa satuan acuan dalam 1 satuan.
const UOM_SEED: {
  code: string
  name: string
  units: [code: string, name: string, factor: string][]
}[] = [
  {
    code: "UNIT",
    name: "Unit",
    units: [
      ["PCS", "Buah (pcs)", "1"],
      ["LUSIN", "Lusin", "12"],
      ["KODI", "Kodi", "20"],
    ],
  },
  {
    code: "BERAT",
    name: "Berat",
    units: [
      ["KG", "Kilogram", "1"],
      ["G", "Gram", "0.001"],
      ["TON", "Ton", "1000"],
    ],
  },
  {
    code: "VOLUME",
    name: "Volume",
    units: [
      ["L", "Liter", "1"],
      ["ML", "Mililiter", "0.001"],
      ["M3", "Meter kubik", "1000"],
    ],
  },
  {
    code: "PANJANG",
    name: "Panjang",
    units: [
      ["M", "Meter", "1"],
      ["CM", "Sentimeter", "0.01"],
      ["MM", "Milimeter", "0.001"],
    ],
  },
  {
    code: "LUAS",
    name: "Luas",
    units: [
      ["M2", "Meter persegi", "1"],
      ["CM2", "Sentimeter persegi", "0.0001"],
    ],
  },
]

async function seedUoms(db: Db) {
  await db
    .insert(uomCategories)
    .values(UOM_SEED.map(({ code, name }) => ({ code, name })))
    .onConflictDoNothing()
  const categories = await db
    .select({ id: uomCategories.id, code: uomCategories.code })
    .from(uomCategories)
    .where(
      inArray(
        uomCategories.code,
        UOM_SEED.map((category) => category.code),
      ),
    )
  const categoryId = new Map(categories.map((category) => [category.code, category.id]))

  await db
    .insert(uoms)
    .values(
      UOM_SEED.flatMap((category) =>
        category.units.map(([code, name, factor], index) => ({
          code,
          name,
          factor,
          categoryId: categoryId.get(category.code)!,
          isReference: index === 0,
        })),
      ),
    )
    .onConflictDoNothing()
}

// Akun login pertama. Sign-up publik dimatikan, jadi user berikutnya
// dibuat oleh Administrator lewat aplikasi.
async function seedAdmin(db: Db) {
  await ensureUser(db, {
    name: process.env.SEED_ADMIN_NAME || "Administrator",
    email: requireEnv("SEED_ADMIN_EMAIL"),
    password: requireEnv("SEED_ADMIN_PASSWORD"),
    roles: ["administrator"],
  })
}

// Satu akun per peran untuk mencoba hak akses di lokal. Jangan aktifkan di production.
async function seedDemoUsers(db: Db) {
  const password = requireEnv("SEED_DEMO_PASSWORD")
  const demo: { name: string; email: string; role: Role }[] = [
    { name: "Demo Manajer", email: "manajer@it-inventory.local", role: "manajer" },
    { name: "Demo Staf Exim", email: "exim@it-inventory.local", role: "staf_exim" },
    { name: "Demo Admin Gudang", email: "gudang@it-inventory.local", role: "admin_gudang" },
    { name: "Demo Auditor", email: "auditor@it-inventory.local", role: "auditor" },
  ]
  for (const user of demo) {
    await ensureUser(db, { ...user, password, roles: [user.role] })
  }
}

async function ensureUser(
  db: Db,
  input: { name: string; email: string; password: string; roles: Role[] },
) {
  const email = input.email.toLowerCase()
  await db.transaction(async (tx) => {
    let [user] = await tx.select({ id: users.id }).from(users).where(eq(users.email, email))
    if (!user) {
      ;[user] = await tx
        .insert(users)
        .values({ name: input.name, email, emailVerified: true })
        .returning({ id: users.id })
      // Format akun password sama dengan yang dibuat Better Auth saat sign-up email.
      await tx.insert(accounts).values({
        userId: user.id,
        accountId: user.id,
        providerId: "credential",
        password: await hashPassword(input.password),
      })
      console.log(`User dibuat: ${email}`)
    }
    await tx
      .insert(userRoles)
      .values(input.roles.map((role) => ({ userId: user.id, role })))
      .onConflictDoNothing()
  })
}

function requireEnv(key: string) {
  const value = process.env[key]
  if (!value) throw new Error(`${key} belum diatur. Lihat .env.example.`)
  return value
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
