import { describe, expect, test } from "vitest"

import { containsPattern } from "./sql-helpers"

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
