import { describe, expect, test } from "vitest"

import { digitsOnly, headOfficeNitku, npwp16, npwpIdentityType } from "./npwp"

describe("NPWP dan NITKU", () => {
  test("format bertitik dan berstrip dibaca sebagai angka saja", () => {
    expect(digitsOnly("01.234.567.8-901.000")).toBe("012345678901000")
  })

  test("NPWP 15 digit menjadi 16 digit dengan awalan 0", () => {
    expect(npwp16("01.234.567.8-901.000")).toBe("0012345678901000")
    expect(npwp16("1234567890123456")).toBe("1234567890123456")
    expect(npwp16("12345")).toBeNull()
  })

  // Aturan backlog M1-06: 16 digit → nomor + 000000; 15 digit → 0 + nomor + 000000.
  test("NITKU kantor pusat", () => {
    expect(headOfficeNitku("1234567890123456")).toBe("1234567890123456000000")
    expect(headOfficeNitku("012345678901000")).toBe("0012345678901000000000")
    expect(headOfficeNitku("")).toBeNull()
  })

  test("kode jenis identitas CEISA", () => {
    expect(npwpIdentityType("1234567890123456")).toBe("6")
    expect(npwpIdentityType("012345678901000")).toBe("5")
    expect(npwpIdentityType("123")).toBeNull()
  })
})
