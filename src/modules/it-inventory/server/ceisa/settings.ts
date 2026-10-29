import "server-only"

import { eq } from "drizzle-orm"
import { db } from "@/server/db"
import type { Db } from "@/server/db/client"
import { systemSettings } from "@/server/db/schema"
import { readCeisaConfig } from "./config"

export async function readStoredCeisaConfig(queryDb: Pick<Db, "select"> = db) {
  const [setting] = await queryDb
    .select({ value: systemSettings.value })
    .from(systemSettings)
    .where(eq(systemSettings.key, "ceisa.environment"))
  return readCeisaConfig(setting?.value)
}
