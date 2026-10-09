import { loadEnvConfig } from "@next/env"
import { hashPassword } from "better-auth/crypto"
import { eq } from "drizzle-orm"

import type { Role } from "../../lib/permissions"
import { createDb, type Db } from "./client"
import { accounts, systemSettings, userRoles, users } from "./schema"

// Seed bersifat idempoten: aman dijalankan berulang kali,
// dan tidak menimpa nilai yang sudah diubah lewat aplikasi.
async function main() {
  loadEnvConfig(process.cwd())
  const url = requireEnv("DATABASE_URL")

  const { db, pool } = createDb(url)
  try {
    await seedSettings(db)
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
