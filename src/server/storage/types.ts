export type StoredFile = { body: Uint8Array; contentType: string }

export type Storage = {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>
  get(key: string): Promise<StoredFile | null>
  delete(key: string): Promise<void>
}

// Kunci file hanya huruf, angka, dan - _ . / tanpa "..", supaya aman dipakai sebagai path lokal
// maupun kunci object.
export function assertSafeKey(key: string) {
  if (!/^[A-Za-z0-9._/-]+$/.test(key) || key.includes("..") || key.startsWith("/")) {
    throw new Error(`Kunci file tidak valid: ${key}`)
  }
}
