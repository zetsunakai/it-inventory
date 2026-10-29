import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto"

// Token CEISA disimpan di database dalam bentuk terenkripsi (AES-256-GCM).
// Kunci diambil dari CEISA_TOKEN_KEY (base64 32 byte). Bila kosong, turunan
// SHA-256 dari BETTER_AUTH_SECRET dipakai supaya deployment sederhana tetap aman
// tanpa menambah secret baru; mengganti secret itu membuat token lama tidak terbaca.
const VERSION = "v1"
const ALGORITHM = "aes-256-gcm"

export class CeisaTokenKeyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "CeisaTokenKeyError"
  }
}

function encryptionKey(): Buffer {
  const configured = process.env.CEISA_TOKEN_KEY?.trim()
  if (configured) {
    const key = Buffer.from(configured, "base64")
    if (key.length !== 32) {
      throw new CeisaTokenKeyError("CEISA_TOKEN_KEY harus berisi 32 byte dalam base64.")
    }
    return key
  }

  const fallback = process.env.BETTER_AUTH_SECRET
  if (!fallback) {
    throw new CeisaTokenKeyError(
      "CEISA_TOKEN_KEY atau BETTER_AUTH_SECRET belum diatur, token CEISA tidak bisa disimpan.",
    )
  }
  return createHash("sha256").update(fallback).digest()
}

export function encryptToken(token: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv)
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return [
    VERSION,
    iv.toString("base64"),
    tag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":")
}

export function decryptToken(payload: string): string {
  const [version, iv, tag, encrypted] = payload.split(":")
  if (version !== VERSION || !iv || !tag || !encrypted) {
    throw new CeisaTokenKeyError("Format token CEISA tersimpan tidak dikenali.")
  }
  const decipher = createDecipheriv(ALGORITHM, encryptionKey(), Buffer.from(iv, "base64"))
  decipher.setAuthTag(Buffer.from(tag, "base64"))
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64")),
    decipher.final(),
  ]).toString("utf8")
}
