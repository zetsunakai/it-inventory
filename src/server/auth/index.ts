import "server-only"

import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { nextCookies } from "better-auth/next-js"
import { twoFactor } from "better-auth/plugins"

import { AUTH_COOKIE_PREFIX } from "@/lib/auth-config"
import { db } from "@/server/db"
import * as schema from "@/server/db/schema"

const HOUR = 60 * 60

export const auth = betterAuth({
  appName: "IT Inventory",
  database: drizzleAdapter(db, { provider: "pg", usePlural: true, schema }),
  emailAndPassword: {
    enabled: true,
    // User dibuat oleh Administrator, bukan mendaftar sendiri (PRD bagian 3).
    disableSignUp: true,
    minPasswordLength: 10,
  },
  session: {
    // Sesi habis setelah 12 jam tidak aktif (PRD bagian 11):
    // setiap aktivitas yang lewat 1 jam memperpanjang sesi 12 jam lagi.
    expiresIn: 12 * HOUR,
    updateAge: HOUR,
  },
  advanced: {
    cookiePrefix: AUTH_COOKIE_PREFIX,
    database: { generateId: "uuid" },
  },
  // nextCookies harus paling akhir: dibutuhkan supaya sign-in dari
  // server action bisa menulis cookie sesi.
  plugins: [
    // MFA TOTP. Wajib untuk Manajer dan Administrator (PRD bagian 11),
    // dipaksakan di requireUser(). Issuer tampil di aplikasi authenticator.
    twoFactor({ issuer: "IT Inventory" }),
    nextCookies(),
  ],
})
