import { describe, expect, it } from "vitest"

import { addLotScan, lotRowsPayload, lotRowsTotal } from "./receipt-lots"

describe("addLotScan", () => {
  it("lot yang dipindai ulang bertambah 1", () => {
    const first = addLotScan([], "LOT-A", { tracking: "lot", requested: 10 })
    expect(first.ok && first.rows).toEqual([{ lot: "LOT-A", qty: "1" }])
    const second = addLotScan(first.ok ? first.rows : [], " LOT-A ", {
      tracking: "lot",
      requested: 10,
    })
    expect(second.ok && second.rows).toEqual([{ lot: "LOT-A", qty: "2" }])
  })

  it("nomor seri ganda ditolak", () => {
    const rows = [{ lot: "SN1", qty: "1" }]
    expect(addLotScan(rows, "SN1", { tracking: "serial", requested: 5 })).toEqual({
      ok: false,
      message: "Nomor seri SN1 sudah dipindai.",
    })
    const next = addLotScan(rows, "SN2", { tracking: "serial", requested: 5 })
    expect(next.ok && next.rows).toHaveLength(2)
  })

  it("scan yang melebihi qty diminta ditolak", () => {
    const rows = [{ lot: "LOT-A", qty: "2" }]
    expect(addLotScan(rows, "LOT-B", { tracking: "lot", requested: 2 }).ok).toBe(false)
  })
})

describe("lotRowsPayload dan lotRowsTotal", () => {
  it("baris kosong diabaikan, lot kosong jadi null", () => {
    const rows = [
      { lot: "LOT-A", qty: "4" },
      { lot: "", qty: "1,5" },
      { lot: " ", qty: "" },
    ]
    expect(lotRowsPayload(rows)).toEqual([
      { lot: "LOT-A", qty: "4" },
      { lot: null, qty: "1,5" },
    ])
    expect(lotRowsTotal(rows)).toBe(5.5)
  })
})
