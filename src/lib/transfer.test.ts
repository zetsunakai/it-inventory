import { describe, expect, it } from "vitest"

import { transferActions, transferSteps } from "./transfer"

describe("transferActions", () => {
  it("Draft dikonfirmasi dulu, pindah lokasi langsung divalidasi", () => {
    expect(transferActions({ status: "draft", reservable: true })).toEqual(["confirm", "cancel"])
    expect(transferActions({ status: "draft", reservable: true, instant: true })).toEqual([
      "validate",
      "cancel",
    ])
  })

  it("Menunggu stok hanya bisa Cek stok, tanpa Validasi atau Lepas reservasi", () => {
    expect(transferActions({ status: "waiting", reservable: true })).toEqual([
      "check",
      "reopen",
      "cancel",
    ])
  })

  it("Lepas reservasi hanya untuk transfer yang memesan stok", () => {
    expect(transferActions({ status: "ready", reservable: true })).toContain("release")
    expect(transferActions({ status: "ready", reservable: false })).toEqual([
      "validate",
      "reopen",
      "cancel",
    ])
    expect(transferActions({ status: "partially_available", reservable: true })).toEqual([
      "validate",
      "check",
      "release",
      "reopen",
      "cancel",
    ])
  })

  it("transfer dari permintaan tidak bisa dikembalikan ke Draft", () => {
    expect(transferActions({ status: "ready", reservable: true, fromRequest: true })).not.toContain(
      "reopen",
    )
  })

  it("transfer Selesai dan Batal tidak punya aksi", () => {
    expect(transferActions({ status: "done", reservable: true })).toEqual([])
    expect(transferActions({ status: "cancelled", reservable: false })).toEqual([])
  })
})

describe("transferSteps", () => {
  it("menyesuaikan langkah dengan jenis transfer", () => {
    const codes = (steps: { code: string }[]) => steps.map((step) => step.code)
    expect(codes(transferSteps({ reservable: true }))).toEqual([
      "draft",
      "waiting",
      "ready",
      "done",
    ])
    expect(codes(transferSteps({ reservable: false }))).toEqual(["draft", "ready", "done"])
    expect(codes(transferSteps({ reservable: true, instant: true }))).toEqual(["draft", "done"])
  })
})
