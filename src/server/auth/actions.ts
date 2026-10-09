"use server"

import { APIError } from "better-auth/api"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import QRCode from "qrcode"
import { z } from "zod"

import { LOGIN_PATH, MFA_VERIFY_PATH, safeRedirectPath } from "@/lib/auth-config"

import { auth } from "."
import { getSession, requireUser } from "./session"

// ---------- Login ----------

const signInSchema = z.object({
  email: z.email("Format email tidak valid."),
  password: z.string().min(1, "Password wajib diisi."),
  next: z.string().optional(),
})

export type SignInState = {
  errors?: string[]
  email?: string
}

export async function signIn(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const parsed = signInSchema.safeParse(Object.fromEntries(formData))
  const email = String(formData.get("email") ?? "")
  if (!parsed.success) {
    // Tampilkan semua kesalahan sekaligus (PRD bagian 7.6).
    return { errors: parsed.error.issues.map((issue) => issue.message), email }
  }

  let result
  try {
    result = await auth.api.signInEmail({
      body: { email: parsed.data.email, password: parsed.data.password },
      headers: await headers(),
    })
  } catch (error) {
    // Jangan bedakan "email tidak terdaftar" dan "password salah".
    if (error instanceof APIError) return { errors: ["Email atau password salah."], email }
    throw error
  }

  const next = safeRedirectPath(parsed.data.next)
  // User dengan MFA aktif belum mendapat sesi: lanjut ke langkah kode TOTP.
  if ("twoFactorRedirect" in result && result.twoFactorRedirect) {
    redirect(`${MFA_VERIFY_PATH}?next=${encodeURIComponent(next)}`)
  }
  redirect(next)
}

export async function signOut() {
  await auth.api.signOut({ headers: await headers() })
  redirect(LOGIN_PATH)
}

// ---------- Langkah kedua login (kode TOTP) ----------

const codeSchema = z.object({
  code: z.string().regex(/^\d{6}$/, "Kode harus 6 digit angka."),
  next: z.string().optional(),
})

export type CodeState = { errors?: string[] }

export async function verifyLoginCode(_prev: CodeState, formData: FormData): Promise<CodeState> {
  const parsed = codeSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { errors: parsed.error.issues.map((issue) => issue.message) }

  try {
    await auth.api.verifyTOTP({ body: { code: parsed.data.code }, headers: await headers() })
  } catch (error) {
    if (error instanceof APIError) {
      return { errors: ["Kode salah atau kedaluwarsa. Ulangi login bila perlu."] }
    }
    throw error
  }
  redirect(safeRedirectPath(parsed.data.next))
}

// ---------- Aktivasi MFA ----------

export type MfaSetupState = {
  errors?: string[]
  // Diisi setelah password benar: QR untuk dipindai, kunci yang sama untuk diketik
  // manual bila kamera tidak bisa dipakai, dan backup code.
  qrSvg?: string
  manualKey?: string
  backupCodes?: string[]
}

export async function startMfaSetup(
  _prev: MfaSetupState,
  formData: FormData,
): Promise<MfaSetupState> {
  await requireUser({ allowMissingMfa: true })
  const password = String(formData.get("password") ?? "")
  if (!password) return { errors: ["Password wajib diisi."] }

  try {
    const result = await auth.api.enableTwoFactor({
      body: { password, method: "totp" },
      headers: await headers(),
    })
    if (result.method !== "totp") throw new Error("Metode MFA yang diharapkan TOTP.")
    // QR dibuat di server sendiri: URI berisi secret, jangan dikirim ke layanan pihak ketiga.
    const qrSvg = await QRCode.toString(result.totpURI, { type: "svg", margin: 1 })
    const manualKey = new URL(result.totpURI).searchParams.get("secret") ?? undefined
    return { qrSvg, manualKey, backupCodes: result.backupCodes }
  } catch (error) {
    if (error instanceof APIError) return { errors: ["Password salah."] }
    throw error
  }
}

export async function confirmMfaSetup(_prev: CodeState, formData: FormData): Promise<CodeState> {
  // Sengaja bukan requireUser(): hasilnya di-cache per request (React cache) dengan status MFA
  // lama, padahal halaman ini dirender ulang di request yang sama setelah MFA aktif.
  if (!(await getSession())) redirect(LOGIN_PATH)
  const parsed = codeSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { errors: parsed.error.issues.map((issue) => issue.message) }

  try {
    // Kode pertama yang benar sekaligus mengaktifkan MFA untuk user ini.
    await auth.api.verifyTOTP({ body: { code: parsed.data.code }, headers: await headers() })
  } catch (error) {
    if (error instanceof APIError) return { errors: ["Kode salah. Coba kode terbaru di aplikasi."] }
    throw error
  }
  // Tanpa redirect("/"): dengan cacheComponents, router menyimpan tree beranda dari kunjungan
  // sebelum MFA aktif (berisi redirect ke halaman ini) dan menampilkannya lagi. Halaman ini
  // dirender ulang menampilkan "MFA sudah aktif" dengan link muat ulang penuh ke beranda.
  return {}
}
