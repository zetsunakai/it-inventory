import { describe, expect, test } from "vitest"

import { containsPattern, prefixPattern } from "./sql-helpers"

describe("containsPattern", () => {
  test("membungkus kata kunci dengan wildcard", () => {
    expect(containsPattern("budi")).toBe("%budi%")
  })

  test("wildcard dari input user di-escape", () => {
    expect(containsPattern("50%")).toBe("%50\\%%")
    expect(containsPattern("a_b")).toBe("%a\\_b%")
    expect(containsPattern("c:\\data")).toBe("%c:\\\\data%")
  })
})

describe("prefixPattern", () => {
  test("hanya wildcard di belakang, input tetap di-escape", () => {
    expect(prefixPattern("ID")).toBe("ID%")
    expect(prefixPattern("1_0")).toBe("1\\_0%")
  })
})
