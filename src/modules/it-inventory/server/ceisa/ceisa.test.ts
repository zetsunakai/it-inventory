import { afterEach, describe, expect, test, vi } from "vitest"

import { connectToCeisa } from "@/modules/it-inventory/server/ceisa/connect"
import {
  CEISA_HOSTS,
  CEISA_LOGIN_PATH,
  readCeisaConfig,
} from "@/modules/it-inventory/server/ceisa/config"
import { decryptToken, encryptToken } from "@/modules/it-inventory/server/ceisa/token-crypto"

const CONFIG = {
  environment: "development" as const,
  username: "akun-ceisa",
  password: "rahasia",
  configured: true,
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  })
}

function mockFetch(impl: (url: string, init?: RequestInit) => Promise<Response>) {
  return vi.fn(impl) as unknown as typeof fetch
}

const originalEnv = { ...process.env }

afterEach(() => {
  process.env = { ...originalEnv }
  vi.restoreAllMocks()
})

describe("connectToCeisa", () => {
  test("login berhasil mengembalikan token dan tidak membocorkan kata sandi", async () => {
    const fetchImpl = mockFetch(async () =>
      jsonResponse({
        status: "success",
        item: { access_token: "akses", refresh_token: "segarkan" },
      }),
    )

    const result = await connectToCeisa(CONFIG, fetchImpl)

    expect(result.outcome).toBe("connected")
    expect(result.accessToken).toBe("akses")
    expect(result.refreshToken).toBe("segarkan")
    expect(result.httpStatus).toBe(200)
    expect(result.authenticatedAt).toBeInstanceOf(Date)

    const [url, init] = vi.mocked(fetchImpl).mock.calls[0]
    expect(url).toBe(`${CEISA_HOSTS.development}${CEISA_LOGIN_PATH}`)
    expect(init?.method).toBe("POST")
    expect(String(init?.body)).toContain('"username":"akun-ceisa"')
    expect(String(init?.body)).toContain('"password":"rahasia"')
  })

  test("produksi memakai host Postman dan kredensial hanya di body JSON", async () => {
    const fetchImpl = mockFetch(async () => jsonResponse({ item: { access_token: "akses" } }))
    await connectToCeisa({ ...CONFIG, environment: "production" }, fetchImpl)
    const [url, init] = vi.mocked(fetchImpl).mock.calls[0]
    expect(url).toBe("https://apis-gw.beacukai.go.id/nle-oauth/v1/user/login")
    expect(new URL(String(url)).search).toBe("")
    expect(init?.headers).toMatchObject({ "Content-Type": "application/json" })
    expect(JSON.parse(String(init?.body))).toEqual({
      username: CONFIG.username,
      password: CONFIG.password,
    })
  })

  test("status login error dari CEISA dianggap kredensial ditolak", async () => {
    const fetchImpl = mockFetch(async () => jsonResponse({ status: "login error" }))

    const result = await connectToCeisa(CONFIG, fetchImpl)

    expect(result.outcome).toBe("authentication_failed")
    expect(result.accessToken).toBeNull()
    expect(result.message).toContain("Username atau password")
  })

  test("HTTP 401 dan 403 dibedakan", async () => {
    const unauthorized = await connectToCeisa(
      CONFIG,
      mockFetch(async () => jsonResponse({ message: "unauthorized" }, 401)),
    )
    expect(unauthorized.outcome).toBe("authentication_failed")

    const forbidden = await connectToCeisa(
      CONFIG,
      mockFetch(async () => jsonResponse({ message: "forbidden" }, 403)),
    )
    expect(forbidden.outcome).toBe("forbidden")
  })

  test("gangguan server dan timeout tidak dianggap salah password", async () => {
    const serverError = await connectToCeisa(
      CONFIG,
      mockFetch(async () => new Response("", { status: 503 })),
    )
    expect(serverError.outcome).toBe("server_error")

    const timeout = await connectToCeisa(
      CONFIG,
      mockFetch(async () => {
        const error = new Error("timeout")
        error.name = "TimeoutError"
        throw error
      }),
    )
    expect(timeout.outcome).toBe("timeout")

    const offline = await connectToCeisa(
      CONFIG,
      mockFetch(async () => {
        throw new TypeError("fetch failed")
      }),
    )
    expect(offline.outcome).toBe("unreachable")
  })

  test("respons tanpa access_token dianggap tidak dikenali", async () => {
    const result = await connectToCeisa(
      CONFIG,
      mockFetch(async () => jsonResponse({ status: "success", item: null })),
    )

    expect(result.outcome).toBe("invalid_response")
    expect(result.message).toContain("token akses")
  })
})

describe("readCeisaConfig", () => {
  test("selain production selalu development; env server diabaikan", () => {
    process.env.CEISA_ENV = "produksi"
    process.env.CEISA_USERNAME = " akun "
    process.env.CEISA_PASSWORD = "sandi"
    expect(readCeisaConfig("development")).toEqual({
      environment: "development",
    })
  })

  test("production hanya bila disebut eksplisit; env kredensial diabaikan", () => {
    process.env.CEISA_ENV = "production"
    delete process.env.CEISA_USERNAME
    delete process.env.CEISA_PASSWORD
    expect(readCeisaConfig("production")).toEqual({ environment: "production" })
    expect(readCeisaConfig(undefined)).toEqual({ environment: "development" })
  })
})

describe("token CEISA terenkripsi", () => {
  test("bisa dibuka kembali dan menolak data yang diubah", () => {
    process.env.CEISA_TOKEN_KEY = Buffer.alloc(32, 7).toString("base64")

    const encrypted = encryptToken("token-rahasia")
    expect(encrypted).not.toContain("token-rahasia")
    expect(decryptToken(encrypted)).toBe("token-rahasia")

    const parts = encrypted.split(":")
    parts[3] = Buffer.from("diubah").toString("base64")
    expect(() => decryptToken(parts.join(":"))).toThrow()
  })

  test("kunci yang salah panjang ditolak", () => {
    process.env.CEISA_TOKEN_KEY = Buffer.alloc(8, 1).toString("base64")
    expect(() => encryptToken("token")).toThrow(/32 byte/)
  })
})
