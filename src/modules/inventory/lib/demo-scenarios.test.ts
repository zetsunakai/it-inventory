import { describe, expect, test } from "vitest"

import { DEMO_SCENARIOS, demoScenarioProblems } from "./demo-scenarios"

// Studi kasus data demo inventory: qty satu putaran cocok dengan alur 45 hari, dan kode tidak
// bertabrakan antar studi kasus (master tiap studi kasus dicari lewat kodenya).

describe("studi kasus data demo", () => {
  test("ada 10 studi kasus dengan kunci dan awalan unik", () => {
    expect(DEMO_SCENARIOS).toHaveLength(10)
    expect(new Set(DEMO_SCENARIOS.map((scenario) => scenario.key)).size).toBe(10)
    expect(new Set(DEMO_SCENARIOS.map((scenario) => scenario.prefix)).size).toBe(10)
  })

  test.each(DEMO_SCENARIOS.map((scenario) => [scenario.title, scenario] as const))(
    "%s: qty dan kode HS valid",
    (_, scenario) => {
      expect(demoScenarioProblems(scenario)).toEqual([])
    },
  )

  test("SKU unik dan berawalan kode studi kasusnya", () => {
    const skus = DEMO_SCENARIOS.flatMap((scenario) => {
      const list = [
        ...scenario.materials.map((entry) => entry.sku),
        scenario.packaging.sku,
        ...scenario.finished.map((entry) => entry.sku),
        scenario.scrap.sku,
      ]
      for (const sku of list) expect(sku.startsWith(`${scenario.prefix}-`)).toBe(true)
      return list
    })
    expect(new Set(skus).size).toBe(skus.length)
  })
})
