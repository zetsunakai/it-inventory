import { createHmac } from "node:crypto"

// Kode TOTP (RFC 6238: HMAC-SHA1, 30 detik, 6 digit), sama seperti aplikasi authenticator,
// supaya tes bisa melewati MFA dengan kunci manual dari halaman aktivasi.

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"

function base32Decode(input: string) {
  let bits = ""
  for (const char of input.replace(/=+$/, "").toUpperCase()) {
    const value = BASE32.indexOf(char)
    if (value < 0) throw new Error(`Karakter base32 tidak valid: ${char}`)
    bits += value.toString(2).padStart(5, "0")
  }
  const bytes = bits.match(/.{8}/g) ?? []
  return Buffer.from(bytes.map((byte) => parseInt(byte, 2)))
}

export function totp(secret: string, now = Date.now()) {
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 1000 / 30)))
  const hmac = createHmac("sha1", base32Decode(secret)).update(counter).digest()
  const offset = hmac[hmac.length - 1] & 0xf
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000
  return String(code).padStart(6, "0")
}
