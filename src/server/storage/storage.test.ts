import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { afterAll, describe, expect, test } from "vitest"

import { localStorage } from "./local"
import { signV4 } from "./s3"
import { assertSafeKey } from "./types"

describe("signV4", () => {
  // Contoh "GET Object" di dokumentasi AWS (Signature Version 4, header Authorization).
  test("sama dengan contoh resmi AWS", () => {
    const authorization = signV4({
      method: "GET",
      path: "/test.txt",
      headers: {
        host: "examplebucket.s3.amazonaws.com",
        range: "bytes=0-9",
        "x-amz-content-sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        "x-amz-date": "20130524T000000Z",
      },
      payloadHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      region: "us-east-1",
      accessKeyId: "AKIAIOSFODNN7EXAMPLE",
      secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      date: "20130524T000000Z",
    })
    expect(authorization).toBe(
      "AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41",
    )
  })
})

describe("localStorage", () => {
  const dirs: string[] = []
  afterAll(async () => {
    for (const dir of dirs) await rm(dir, { recursive: true, force: true })
  })

  test("simpan, baca, hapus", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "storage-"))
    dirs.push(dir)
    const storage = localStorage(dir)
    const body = new TextEncoder().encode("isi invoice")
    await storage.put("customs/a/invoice.pdf", body, "application/pdf")
    expect(await storage.get("customs/a/invoice.pdf")).toEqual({
      body,
      contentType: "application/pdf",
    })
    await storage.delete("customs/a/invoice.pdf")
    expect(await storage.get("customs/a/invoice.pdf")).toBeNull()
  })
})

describe("assertSafeKey", () => {
  test.each(["../etc/passwd", "/abs/path", "a b.pdf", "a/../b"])("menolak %s", (key) => {
    expect(() => assertSafeKey(key)).toThrow("Kunci file tidak valid")
  })
})
