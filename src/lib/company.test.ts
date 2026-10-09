import { describe, expect, test } from "vitest"

import { companyAsCustomsParty, companyProfileSchema } from "./company"

const VALID = {
  name: " PT Uji Berikat ",
  address: "Jl. Industri No. 1, Bekasi",
  npwp: "01.234.567.8-901.000",
  nitku: "",
  nib: "1234 5678 90123",
  facilityType: "kawasan_berikat",
  permitNumber: "KEP-123/WBC.08/2024",
  permitDate: "2024-03-15",
  supervisingOfficeCode: "050500",
}

function issues(input: Record<string, unknown>) {
  const result = companyProfileSchema.safeParse(input)
  return result.success ? [] : result.error.issues.map((issue) => issue.message)
}

describe("companyProfileSchema", () => {
  test("nomor resmi disimpan sebagai angka; NITKU kosong menjadi NITKU kantor pusat", () => {
    expect(companyProfileSchema.parse(VALID)).toMatchObject({
      name: "PT Uji Berikat",
      npwp: "0012345678901000",
      nitku: "0012345678901000000000",
      nib: "1234567890123",
    })
  })

  test("NITKU cabang dipakai apa adanya bila diawali NPWP perusahaan", () => {
    const parsed = companyProfileSchema.parse({ ...VALID, nitku: "0012345678901000000001" })
    expect(parsed.nitku).toBe("0012345678901000000001")
  })

  test("NITKU milik NPWP lain ditolak", () => {
    expect(issues({ ...VALID, nitku: "9999999999999999000000" })).toEqual([
      "NITKU harus diawali NPWP 16 digit perusahaan.",
    ])
  })

  test("semua kesalahan field dikembalikan sekaligus", () => {
    expect(
      issues({
        name: "",
        address: "",
        npwp: "123",
        nitku: "",
        nib: "1",
        facilityType: "",
        permitNumber: "",
        permitDate: "",
        supervisingOfficeCode: "",
      }),
    ).toEqual(
      expect.arrayContaining([
        "Nama perusahaan wajib diisi.",
        "Alamat wajib diisi.",
        "NPWP harus 15 atau 16 digit.",
        "NIB harus 13 digit.",
        "Jenis fasilitas wajib dipilih.",
        "Nomor izin fasilitas wajib diisi.",
        "Tanggal izin fasilitas wajib diisi.",
        "Kantor pabean pengawas wajib dipilih.",
      ]),
    )
  })
})

describe("companyAsCustomsParty", () => {
  test("NITKU menjadi nomor identitas dengan jenis identitas NPWP 16 digit", () => {
    expect(companyAsCustomsParty(companyProfileSchema.parse(VALID))).toEqual({
      name: "PT Uji Berikat",
      address: "Jl. Industri No. 1, Bekasi",
      identityType: "6",
      identityNumber: "0012345678901000000000",
      nib: "1234567890123",
      permitNumber: "KEP-123/WBC.08/2024",
      permitDate: "2024-03-15",
    })
  })
})
