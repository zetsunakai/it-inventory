import { describe, expect, test } from "vitest"

import { formatDecimal, parseDecimalInput, sameDecimal, toDecimalInput } from "./decimal"

describe("parseDecimalInput", () => {
  test("koma dan titik sama-sama pemisah desimal", () => {
    expect(parseDecimalInput("0,001", 10)).toBe("0.001")
    expect(parseDecimalInput(" 1000.5 ", 10)).toBe("1000.5")
    expect(parseDecimalInput("012", 10)).toBe("12")
  })

  test("nol, negatif, pemisah ribuan, dan desimal berlebih ditolak", () => {
    for (const input of ["0", "0,000", "-1", "1.000,5", "1,2,3", "abc", "", "0.00000000001"]) {
      expect(parseDecimalInput(input, 10)).toBeNull()
    }
  })
})

describe("tampilan", () => {
  test("formatDecimal memakai format Indonesia", () => {
    expect(formatDecimal("1000.0000000000")).toBe("1.000")
    expect(formatDecimal("1234567.5000")).toBe("1.234.567,5")
    expect(formatDecimal("0.0010000000")).toBe("0,001")
  })

  test("toDecimalInput terbaca ulang sebagai angka yang sama", () => {
    for (const stored of ["1000.0000000000", "0.0010000000", "12.0000000000", "0.0001000000"]) {
      const reparsed = parseDecimalInput(toDecimalInput(stored), 10)
      expect(Number(reparsed)).toBe(Number(stored))
    }
    expect(toDecimalInput("1000.0000000000")).toBe("1000")
    expect(toDecimalInput("0.0000")).toBe("0.0")
    expect(toDecimalInput("0.0010000000")).toBe("0.001")
  })
})

test("sameDecimal mengabaikan nol di belakang koma", () => {
  expect(sameDecimal("1.5000000000", "1.5")).toBe(true)
  expect(sameDecimal("1000.0000000000", "1000")).toBe(true)
  expect(sameDecimal("1.5", "1.05")).toBe(false)
  expect(sameDecimal(null, null)).toBe(true)
  expect(sameDecimal(null, "1")).toBe(false)
})
