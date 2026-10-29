import { and, eq } from "drizzle-orm"
import { afterAll, describe, expect, test } from "vitest"

import { createDb } from "@/server/db/client"
import { auditLogs, ceisaConnections } from "@/server/db/schema"

import { TEST_DATABASE_URL } from "../test-env"
import { inRollback, setAuditUser } from "./helpers"

// Tabel koneksi CEISA: percobaan tercatat di audit, token terenkripsi disamarkan.
const { db, pool } = createDb(TEST_DATABASE_URL)
afterAll(() => pool.end())

const ACTOR = "6f1c2b9e-3d4a-4c5b-8e7f-0a1b2c3d4e5f"

describe("ceisa_connections", () => {
  test("percobaan Connect tercatat dengan pelaku, token tidak masuk audit log", async () => {
    await inRollback(db, async (tx) => {
      await setAuditUser(tx, ACTOR)

      await tx.insert(ceisaConnections).values({
        environment: "development",
        lastOutcome: "connected",
        lastMessage: "Autentikasi CEISA berhasil.",
        accessTokenEnc: "token-terenkripsi-rahasia",
        passwordEnc: "password-terenkripsi-rahasia",
        refreshTokenEnc: "refresh-terenkripsi-rahasia",
        authenticatedAt: new Date("2026-10-29T10:00:00Z"),
      })

      await tx
        .update(ceisaConnections)
        .set({
          lastOutcome: "authentication_failed",
          lastMessage: "Username atau password CEISA salah.",
          accessTokenEnc: null,
          refreshTokenEnc: null,
          lastAttemptAt: new Date("2026-10-29T10:05:00Z"),
        })
        .where(eq(ceisaConnections.environment, "development"))

      const logs = await tx
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.tableName, "ceisa_connections"),
            eq(auditLogs.recordId, "development"),
            eq(auditLogs.userId, ACTOR),
          ),
        )
        .orderBy(auditLogs.id)

      expect(logs.map((log) => log.action)).toEqual(["INSERT", "UPDATE"])
      expect(logs.every((log) => log.userId === ACTOR)).toBe(true)
      expect(JSON.stringify(logs)).not.toContain("token-terenkripsi-rahasia")
      expect(JSON.stringify(logs)).not.toContain("password-terenkripsi-rahasia")
      expect(logs[0].newData).not.toHaveProperty("password_enc")
      expect(logs[1].newData).toMatchObject({
        last_outcome: "authentication_failed",
        last_message: "Username atau password CEISA salah.",
      })
    })
  })

  test("satu baris per lingkungan", async () => {
    await inRollback(db, async (tx) => {
      await tx.insert(ceisaConnections).values({
        environment: "production",
        lastOutcome: "misconfigured",
      })

      await expect(
        tx.insert(ceisaConnections).values({
          environment: "production",
          lastOutcome: "timeout",
        }),
      ).rejects.toThrow()
    })
  })
})
