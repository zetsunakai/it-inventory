import "server-only"

import { createHash, createHmac } from "node:crypto"

import { assertSafeKey, type Storage } from "./types"

// Object storage S3-compatible (AWS S3, MinIO, Cloudflare R2, dst.) lewat fetch dengan tanda
// tangan AWS Signature Version 4, tanpa SDK. Alamat path-style: <endpoint>/<bucket>/<key>.

export type S3Config = {
  endpoint: string
  region: string
  bucket: string
  accessKeyId: string
  secretAccessKey: string
}

const sha256 = (data: string | Uint8Array) => createHash("sha256").update(data).digest("hex")
const hmac = (key: string | Buffer, data: string) => createHmac("sha256", key).update(data).digest()

// Encode per segmen path sesuai aturan SigV4 (RFC 3986, "/" tidak di-encode).
const encodePath = (value: string) =>
  value
    .split("/")
    .map((segment) =>
      encodeURIComponent(segment).replace(
        /[!'()*]/g,
        (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
      ),
    )
    .join("/")

// Header Authorization SigV4 untuk satu request. headers berisi semua header yang ditandatangani
// (minimal host, x-amz-content-sha256, x-amz-date).
export function signV4({
  method,
  path,
  headers,
  payloadHash,
  region,
  accessKeyId,
  secretAccessKey,
  date,
}: {
  method: string
  path: string
  headers: Record<string, string>
  payloadHash: string
  region: string
  accessKeyId: string
  secretAccessKey: string
  date: string
}) {
  const names = Object.keys(headers)
    .map((name) => name.toLowerCase())
    .sort()
  const lower = Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value.trim()]),
  )
  const signedHeaders = names.join(";")
  const canonicalRequest = [
    method,
    path,
    "",
    names.map((name) => `${name}:${lower[name]}\n`).join(""),
    signedHeaders,
    payloadHash,
  ].join("\n")
  const day = date.slice(0, 8)
  const scope = `${day}/${region}/s3/aws4_request`
  const stringToSign = ["AWS4-HMAC-SHA256", date, scope, sha256(canonicalRequest)].join("\n")
  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${secretAccessKey}`, day), region), "s3"),
    "aws4_request",
  )
  const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex")
  return `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
}

export function s3Storage(config: S3Config): Storage {
  const base = new URL(config.endpoint)

  async function send(
    method: "PUT" | "GET" | "DELETE",
    key: string,
    body?: Uint8Array,
    type?: string,
  ) {
    assertSafeKey(key)
    const path = `${base.pathname.replace(/\/$/, "")}/${encodePath(config.bucket)}/${encodePath(key)}`
    const payloadHash = sha256(body ?? "")
    const date = new Date()
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "")
    const headers: Record<string, string> = {
      host: base.host,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": date,
    }
    if (type) headers["content-type"] = type
    const authorization = signV4({
      method,
      path,
      headers,
      payloadHash,
      region: config.region,
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      date,
    })
    // host diisi fetch sendiri.
    const sent = Object.fromEntries(Object.entries(headers).filter(([name]) => name !== "host"))
    return fetch(`${base.origin}${path}`, {
      method,
      headers: { ...sent, authorization },
      body: body ? Buffer.from(body) : undefined,
    })
  }

  return {
    async put(key, body, contentType) {
      const response = await send("PUT", key, body, contentType)
      if (!response.ok) throw new Error(`Gagal menyimpan file (${response.status}).`)
    },
    async get(key) {
      const response = await send("GET", key)
      if (response.status === 404) return null
      if (!response.ok) throw new Error(`Gagal membaca file (${response.status}).`)
      return {
        body: new Uint8Array(await response.arrayBuffer()),
        contentType: response.headers.get("content-type") ?? "application/octet-stream",
      }
    },
    async delete(key) {
      const response = await send("DELETE", key)
      if (!response.ok && response.status !== 404) {
        throw new Error(`Gagal menghapus file (${response.status}).`)
      }
    },
  }
}
