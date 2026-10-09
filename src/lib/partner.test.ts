import { describe, expect, test } from "vitest"

import { partnerAsCustomsParty, partnerFieldsSchema, partnerNitku } from "./partner"

const BASE = {
  name: "PT Pemasok Uji",
  address: "Jl. Raya No. 2, Bekasi",
  countryCode: "ID",
  isVendor: "on",
  nitku: "",
}

function parse(values: Record<string, string>) {
  return partnerFieldsSchema.safeParse({ ...BASE, ...values })
}

function messages(values: Record<string, string>) {
  const result = parse(values)
  return result.success ? [] : result.error.issues.map((issue) => issue.message)
}

// Kriteria selesai backlog M1-06.
describe("NITKU otomatis dari NPWP", () => {
  test("NPWP 16 digit → nomor + 000000", () => {
    expect(partnerNitku("npwp16", "1234567890123456", "")).toBe("1234567890123456000000")
  })

  test("NPWP 15 digit → 0 + nomor + 000000", () => {
    expect(partnerNitku("npwp15", "012345678901000", "")).toBe("0012345678901000000000")
  })

  test("NITKU cabang yang diisi dipakai apa adanya; non-NPWP tanpa NITKU", () => {
    expect(partnerNitku("npwp16", "1234567890123456", "1234567890123456000002")).toBe(
      "1234567890123456000002",
    )
    expect(partnerNitku("passport", "A1234567", "")).toBeNull()
  })

  test("lewat form: NPWP bertitik dibaca angkanya, NITKU terisi otomatis", () => {
    const result = parse({ identityType: "npwp15", identityNumber: "01.234.567.8-901.000" })
    expect(result.success && result.data).toMatchObject({
      identityNumber: "012345678901000",
      nitku: "0012345678901000000000",
      isVendor: true,
      isCustomer: false,
    })
  })
})

describe("validasi partner", () => {
  test("semua kesalahan tampil sekaligus, termasuk peran dan nomor identitas", () => {
    const result = partnerFieldsSchema.safeParse({
      name: "",
      address: "",
      countryCode: "",
      nitku: "",
      identityType: "npwp16",
      identityNumber: "123",
    })
    expect(result.success ? [] : result.error.issues.map((issue) => issue.message)).toEqual(
      expect.arrayContaining([
        "Nama partner wajib diisi.",
        "Alamat wajib diisi.",
        "Negara wajib dipilih.",
        "Pilih minimal satu peran: vendor atau customer.",
        "NPWP harus 16 digit.",
      ]),
    )
  })

  test("format nomor sesuai jenis identitas", () => {
    expect(messages({ identityType: "npwp16", identityNumber: "123" })).toEqual([
      "NPWP harus 16 digit.",
    ])
    expect(messages({ identityType: "ktp", identityNumber: "12345" })).toEqual([
      "Nomor KTP (NIK) harus 16 digit.",
    ])
    expect(messages({ identityType: "passport", identityNumber: "a b" })).toEqual([
      "Nomor paspor harus 5–20 huruf atau angka.",
    ])
  })

  test("nomor paspor dirapikan jadi huruf besar tanpa spasi", () => {
    const result = parse({ identityType: "passport", identityNumber: "a 1234567" })
    expect(result.success && result.data.identityNumber).toBe("A1234567")
  })

  test("minimal satu peran", () => {
    // Checkbox yang tidak dicentang tidak terkirim sama sekali.
    const result = partnerFieldsSchema.safeParse({
      name: BASE.name,
      address: BASE.address,
      countryCode: BASE.countryCode,
      nitku: "",
      identityType: "npwp16",
      identityNumber: "1234567890123456",
    })
    expect(result.success ? [] : result.error.issues.map((issue) => issue.message)).toEqual([
      "Pilih minimal satu peran: vendor atau customer.",
    ])
  })

  test("NITKU harus diawali NPWP partner, dan hanya untuk NPWP", () => {
    expect(
      messages({
        identityType: "npwp16",
        identityNumber: "1234567890123456",
        nitku: "9999999999999999000000",
      }),
    ).toEqual(["NITKU harus 22 digit dan diawali NPWP 16 digit partner."])
    expect(
      messages({ identityType: "ktp", identityNumber: "3201234567890001", nitku: "123" }),
    ).toEqual(["NITKU hanya untuk partner dengan identitas NPWP."])
  })
})

describe("partnerAsCustomsParty", () => {
  test("NPWP memakai NITKU dengan kode jenis identitas CEISA; paspor memakai nomornya", () => {
    const npwp = parse({ identityType: "npwp16", identityNumber: "1234567890123456" })
    expect(npwp.success && partnerAsCustomsParty(npwp.data)).toEqual({
      name: "PT Pemasok Uji",
      address: "Jl. Raya No. 2, Bekasi",
      countryCode: "ID",
      identityType: "6",
      identityNumber: "1234567890123456000000",
    })

    const passport = parse({
      identityType: "passport",
      identityNumber: "E1234567",
      countryCode: "JP",
    })
    expect(passport.success && partnerAsCustomsParty(passport.data)).toMatchObject({
      countryCode: "JP",
      identityType: "2",
      identityNumber: "E1234567",
    })
  })
})
