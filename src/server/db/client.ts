import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"

import * as schema from "./schema"

// Dipakai oleh aplikasi (lewat ./index.ts) dan oleh script CLI seperti seed.
// Sengaja tanpa "server-only" supaya bisa diimpor dari luar Next.js.
export function createDb(connectionString: string) {
  const pool = new Pool({ connectionString })
  const db = drizzle({ client: pool, schema, casing: "snake_case" })
  return { db, pool }
}

export type Db = ReturnType<typeof createDb>["db"]
