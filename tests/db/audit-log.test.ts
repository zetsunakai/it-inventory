import { and, eq, sql } from "drizzle-orm"
import { afterAll, describe, expect, test } from "vitest"

import { createDb } from "@/server/db/client"
import { accounts, auditLogs, systemSettings, users } from "@/server/db/schema"

import { TEST_DATABASE_URL } from "../test-env"
import { inRollback, pgErrorMessage, setAuditUser } from "./helpers"

// Trigger audit_row_change() dan perlindungan audit_logs (migrasi 0007, PRD bagian 11).

const { db, pool } = createDb(TEST_DATABASE_URL)
afterAll(() => pool.end())

const ACTOR = "6f1c2b9e-3d4a-4c5b-8e7f-0a1b2c3d4e5f"

function logsFor(tx: Parameters<Parameters<typeof inRollback>[1]>[0], table: string, id: string) {
  return tx
    .select()
    .from(auditLogs)
    .where(and(eq(auditLogs.tableName, table), eq(auditLogs.recordId, id)))
    .orderBy(auditLogs.id)
}

describe("audit_row_change", () => {
  test("insert, update, dan delete tercatat dengan nilai lama, nilai baru, dan pelakunya", async () => {
    await inRollback(db, async (tx) => {
      await setAuditUser(tx, ACTOR)
      await tx.insert(systemSettings).values({ key: "tes.audit", value: "awal" })
      await tx
        .update(systemSettings)
        .set({ value: "baru" })
        .where(eq(systemSettings.key, "tes.audit"))
      await tx.delete(systemSettings).where(eq(systemSettings.key, "tes.audit"))

      const logs = await logsFor(tx, "system_settings", "tes.audit")
      expect(logs.map((log) => log.action)).toEqual(["INSERT", "UPDATE", "DELETE"])
      expect(logs.every((log) => log.userId === ACTOR)).toBe(true)

      const [insert, update, remove] = logs
      expect(insert.oldData).toBeNull()
      expect(insert.newData).toMatchObject({ key: "tes.audit", value: "awal" })
      expect(update.oldData).toMatchObject({ value: "awal" })
      expect(update.newData).toMatchObject({ value: "baru" })
      expect(remove.oldData).toMatchObject({ value: "baru" })
      expect(remove.newData).toBeNull()
    })
  })

  test("update yang tidak mengubah isi (hanya updated_at) tidak dicatat", async () => {
    await inRollback(db, async (tx) => {
      await tx.insert(systemSettings).values({ key: "tes.sama", value: "tetap" })
      await tx
        .update(systemSettings)
        .set({ value: "tetap" })
        .where(eq(systemSettings.key, "tes.sama"))

      const logs = await logsFor(tx, "system_settings", "tes.sama")
      expect(logs.map((log) => log.action)).toEqual(["INSERT"])
    })
  })

  test("perubahan tanpa app.user_id tercatat sebagai perubahan sistem", async () => {
    await inRollback(db, async (tx) => {
      await tx.insert(systemSettings).values({ key: "tes.sistem", value: "seed" })

      const [log] = await logsFor(tx, "system_settings", "tes.sistem")
      expect(log.userId).toBeNull()
    })
  })

  test("kolom rahasia tidak ikut tersimpan di audit log", async () => {
    await inRollback(db, async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({ name: "Tes Rahasia", email: "rahasia@tes.local", emailVerified: true })
        .returning({ id: users.id })
      const [account] = await tx
        .insert(accounts)
        .values({
          userId: user.id,
          accountId: user.id,
          providerId: "credential",
          password: "hash-rahasia",
        })
        .returning({ id: accounts.id })

      const [log] = await logsFor(tx, "accounts", account.id)
      expect(log.newData).toMatchObject({ provider_id: "credential" })
      expect(log.newData).not.toHaveProperty("password")
      expect(JSON.stringify(log.newData)).not.toContain("hash-rahasia")
    })
  })
})

describe("audit_logs append-only", () => {
  test("update ditolak", async () => {
    await inRollback(db, async (tx) => {
      await tx.insert(systemSettings).values({ key: "tes.ubah-log", value: "x" })
      const message = await pgErrorMessage(
        tx.update(auditLogs).set({ userId: ACTOR }).where(eq(auditLogs.recordId, "tes.ubah-log")),
      )
      expect(message).toContain("audit_logs hanya boleh ditambah: UPDATE")
    })
  })

  test("delete ditolak", async () => {
    await inRollback(db, async (tx) => {
      await tx.insert(systemSettings).values({ key: "tes.hapus-log", value: "x" })
      const message = await pgErrorMessage(
        tx.delete(auditLogs).where(eq(auditLogs.recordId, "tes.hapus-log")),
      )
      expect(message).toContain("audit_logs hanya boleh ditambah: DELETE")
    })
  })

  test("truncate ditolak", async () => {
    await inRollback(db, async (tx) => {
      const message = await pgErrorMessage(tx.execute(sql`truncate audit_logs`))
      expect(message).toContain("audit_logs hanya boleh ditambah: TRUNCATE")
    })
  })
})
