"use server"

import { z } from "zod"
import { eq } from "drizzle-orm"

import type { CeisaConnectResult } from "@/modules/it-inventory/lib/ceisa"
import { connectToCeisa } from "@/modules/it-inventory/server/ceisa/connect"
import { readStoredCeisaConfig } from "@/modules/it-inventory/server/ceisa/settings"
import { decryptToken, encryptToken } from "@/modules/it-inventory/server/ceisa/token-crypto"
import { AppError, defineAction } from "@/server/actions/define-action"
import { ceisaConnections, systemSettings } from "@/server/db/schema"

// Rahasia hanya dibaca atas permintaan eksplisit tombol mata, bukan payload awal halaman.
export const revealCeisaPassword = defineAction({
  name: "revealCeisaPassword",
  permission: "settings:write",
  schema: z.object({}),
  refresh: false,
  handler: async ({ tx }) => {
    const { environment } = await readStoredCeisaConfig(tx)
    const [saved] = await tx
      .select({ passwordEnc: ceisaConnections.passwordEnc })
      .from(ceisaConnections)
      .where(eq(ceisaConnections.environment, environment))
    return { password: saved?.passwordEnc ? decryptToken(saved.passwordEnc) : "" }
  },
})

export const saveCeisaCredentials = defineAction({
  name: "saveCeisaCredentials",
  permission: "settings:write",
  schema: z.object({
    username: z.string().trim().max(200),
    password: z.string().max(4096),
    apiKey: z.string().trim().max(4096).optional(),
    settings: z
      .array(
        z.object({ key: z.string().min(1), value: z.string().trim().min(1, "Nilai wajib diisi.") }),
      )
      .optional(),
  }),
  handler: async ({ tx, input }) => {
    const previousConfig = await readStoredCeisaConfig(tx)
    for (const setting of input.settings ?? []) {
      if (
        setting.key === "ceisa.environment" &&
        !["development", "production"].includes(setting.value)
      ) {
        throw new AppError("Lingkungan CEISA harus development atau production.")
      }
      const [saved] = await tx
        .update(systemSettings)
        .set({ value: setting.value })
        .where(eq(systemSettings.key, setting.key))
        .returning({ key: systemSettings.key })
      if (!saved) throw new AppError(`Pengaturan "${setting.key}" tidak ditemukan.`)
    }
    const { environment } = await readStoredCeisaConfig(tx)
    const [target] = await tx
      .select()
      .from(ceisaConnections)
      .where(eq(ceisaConnections.environment, environment))
      .for("update")
    // Saat pengguna mengganti lingkungan, kredensial boleh dipakai kembali untuk username sama.
    const [source] =
      previousConfig.environment !== environment
        ? await tx
            .select()
            .from(ceisaConnections)
            .where(eq(ceisaConnections.environment, previousConfig.environment))
            .for("update")
        : []
    const current = target ?? (source?.username === input.username ? source : undefined)
    if (!input.username) {
      if (input.settings && !current?.username && !input.password && !input.apiKey) {
        return { message: "Pengaturan disimpan." }
      }
      throw new AppError("Username CEISA wajib diisi.")
    }
    if (!input.password && (!current?.passwordEnc || current.username !== input.username)) {
      throw new AppError("Password CEISA wajib diisi untuk akun baru atau username yang berubah.")
    }
    if (target?.username === input.username && !input.password && !input.apiKey) {
      return { message: input.settings ? "Pengaturan disimpan." : "Akun CEISA tersimpan." }
    }
    const passwordEnc = input.password ? encryptToken(input.password) : current!.passwordEnc
    const values = {
      username: input.username,
      passwordEnc,
      apiKeyEnc: input.apiKey ? encryptToken(input.apiKey) : (current?.apiKeyEnc ?? null),
      accessTokenEnc: null,
      refreshTokenEnc: null,
      authenticatedAt: null,
      lastOutcome: "misconfigured",
      lastMessage: "Akun CEISA tersimpan. Pilih Hubungkan untuk autentikasi.",
      lastHttpStatus: null,
    }
    await tx
      .insert(ceisaConnections)
      .values({ environment, ...values })
      .onConflictDoUpdate({ target: ceisaConnections.environment, set: values })
    return { message: input.settings ? "Pengaturan disimpan." : "Akun CEISA tersimpan." }
  },
})

// Tombol Hubungkan di Pengaturan › Integrasi CEISA. Percobaan yang gagal tetap
// disimpan (dan masuk audit log), jadi status di layar tidak menyesatkan.
// Token hanya disimpan di server dalam bentuk terenkripsi.
export const connectCeisa = defineAction({
  name: "connectCeisa",
  permission: "settings:write",
  schema: z.object({}),
  handler: async ({ tx }): Promise<CeisaConnectResult> => {
    const { environment } = await readStoredCeisaConfig(tx)
    const [saved] = await tx
      .select()
      .from(ceisaConnections)
      .where(eq(ceisaConnections.environment, environment))
      .for("update")
    const config = {
      environment,
      username: saved?.username ?? "",
      password: saved?.passwordEnc ? decryptToken(saved.passwordEnc) : "",
      configured: Boolean(saved?.username && saved.passwordEnc),
    }
    const result = config.configured
      ? await connectToCeisa(config)
      : {
          outcome: "misconfigured" as const,
          message: "Username atau password CEISA belum diatur. Isi field akun lalu pilih Simpan.",
          httpStatus: null,
          authenticatedAt: null,
          accessToken: null,
          refreshToken: null,
        }

    let message = result.message
    let accessTokenEnc: string | null = null
    let refreshTokenEnc: string | null = null

    if (result.outcome === "connected" && result.accessToken) {
      try {
        accessTokenEnc = encryptToken(result.accessToken)
        refreshTokenEnc = result.refreshToken ? encryptToken(result.refreshToken) : null
      } catch (error) {
        // Koneksi tetap berhasil walau token tidak bisa disimpan; jangan sembunyikan alasannya.
        console.error("[ceisa:connect] token encryption failed", error)
        message += " Token akses tidak tersimpan karena kunci enkripsi server belum siap."
      }
    }

    // Token lama dipertahankan saat gangguan sementara, tetapi dihapus saat kredensial ditolak.
    const clearsTokens =
      result.outcome === "authentication_failed" ||
      result.outcome === "forbidden" ||
      result.outcome === "misconfigured"
    const tokenPatch =
      result.outcome === "connected"
        ? { accessTokenEnc, refreshTokenEnc }
        : clearsTokens
          ? { accessTokenEnc: null, refreshTokenEnc: null }
          : {}

    const attemptAt = new Date()
    const shared = {
      lastAttemptAt: attemptAt,
      lastOutcome: result.outcome,
      lastMessage: message,
      lastHttpStatus: result.httpStatus,
    }

    await tx
      .insert(ceisaConnections)
      .values({
        environment: config.environment,
        ...shared,
        authenticatedAt: result.authenticatedAt,
        ...tokenPatch,
      })
      .onConflictDoUpdate({
        target: ceisaConnections.environment,
        set: {
          ...shared,
          ...tokenPatch,
          ...(result.outcome === "connected" ? { authenticatedAt: result.authenticatedAt } : {}),
        },
      })

    return {
      environment: config.environment,
      outcome: result.outcome,
      message,
      httpStatus: result.httpStatus,
      authenticatedAt: (result.authenticatedAt ?? null)?.toISOString() ?? null,
    }
  },
})
