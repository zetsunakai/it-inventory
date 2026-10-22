"use server"

import { z } from "zod"

import { DEMO_SCENARIO_KEYS } from "@/modules/inventory/lib/demo-scenarios"
import { generateInventoryDemo, inventoryDemoAllowed } from "@/modules/inventory/server/demo-data"
import { AppError, defineAction } from "@/server/actions/define-action"

// Data demo inventory mode pure backend (satu dari 10 studi kasus kawasan berikat), hanya
// Administrator. Setiap panggilan menambah satu putaran transaksi 45 hari; pesannya dibuat tombol
// dari nomor putaran. Di server produksi hanya bila DEMO_DATA_ENABLED=true, supaya data
// operasional asli tidak tercampur data demo tanpa sengaja.
export const createInventoryDemo = defineAction({
  name: "createInventoryDemo",
  permission: "settings:write",
  schema: z.object({ scenario: z.enum(DEMO_SCENARIO_KEYS, "Pilih studi kasus.") }),
  handler: async ({ input, user, tx }) => {
    if (!inventoryDemoAllowed()) {
      throw new AppError(
        "Data demo dinonaktifkan di server ini. Set DEMO_DATA_ENABLED=true untuk server demo.",
      )
    }
    return generateInventoryDemo(tx, user.id, input.scenario)
  },
})
