import { describe, expect, it } from "vitest"
import { lookupPage, lookupResponse } from "./lookup-page"

describe("pagination lookup", () => {
  it("menahan halaman tidak valid dan membatasi offset", () => {
    expect(lookupPage(new URLSearchParams())).toEqual({ offset: 0, limit: 20 })
    expect(lookupPage(new URLSearchParams("page=2"))).toEqual({ offset: 20, limit: 20 })
    for (const page of ["-1", "x", "1.5", "Infinity", "0"])
      expect(lookupPage(new URLSearchParams({ page })).offset).toBe(0)
    expect(lookupPage(new URLSearchParams("page=999999999999999999999999999"))).toEqual({
      offset: 99980,
      limit: 20,
    })
  })
  it("mengembalikan hanya batas hasil dan hasMore dari sentinel", () => {
    const all = Array.from({ length: 21 }, (_, id) => ({ id }))
    expect(lookupResponse(all, 20)).toEqual({ items: all.slice(0, 20), hasMore: true })
    expect(lookupResponse(all.slice(20), 20)).toEqual({ items: [{ id: 20 }], hasMore: false })
  })
})
