import { asc, eq, sql } from "drizzle-orm"
import type { Metadata } from "next"
import { Suspense } from "react"

import { ActivityLog } from "@/components/document/activity-log"
import { DocumentLayout } from "@/components/document/document-layout"
import { Skeleton } from "@/components/ui/skeleton"
import type { CeisaOutcome } from "@/modules/it-inventory/lib/ceisa"
import { readStoredCeisaConfig } from "@/modules/it-inventory/server/ceisa/settings"
import { requirePermission } from "@/server/auth/session"
import { db } from "@/server/db"
import { ceisaConnections, systemSettings } from "@/server/db/schema"
import { tableActivity } from "@/server/queries/activity"

import { CeisaIntegration } from "./ceisa-integration"

export const metadata: Metadata = { title: "Pengaturan · IT Inventory" }

export default function SettingsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <SettingList />
    </Suspense>
  )
}

async function SettingList() {
  await requirePermission("settings:write")
  const ceisa = await readStoredCeisaConfig()
  const [rows, [connection]] = await Promise.all([
    db.select().from(systemSettings).orderBy(asc(systemSettings.key)),
    db
      .select({
        lastOutcome: ceisaConnections.lastOutcome,
        lastMessage: ceisaConnections.lastMessage,
        lastAttemptAt: ceisaConnections.lastAttemptAt,
        authenticatedAt: ceisaConnections.authenticatedAt,
        httpStatus: ceisaConnections.lastHttpStatus,
        username: ceisaConnections.username,
        hasPassword: sql<boolean>`${ceisaConnections.passwordEnc} is not null`,
        hasApiKey: sql<boolean>`${ceisaConnections.apiKeyEnc} is not null`,
      })
      .from(ceisaConnections)
      .where(eq(ceisaConnections.environment, ceisa.environment))
      .limit(1),
  ])
  const labels = new Map(rows.map((row) => [row.key, row.description ?? row.key]))
  const activity = await tableActivity("system_settings", "value", (key) => labels.get(key) ?? key)

  return (
    <DocumentLayout
      title="Pengaturan"
      meta="Setiap perubahan tercatat di audit log."
      activity={<ActivityLog entries={activity} noun="pengaturan" />}
    >
      <CeisaIntegration
        settings={rows.map((row) => ({
          key: row.key,
          label: row.description ?? row.key,
          value: String(row.value),
        }))}
        environment={ceisa.environment}
        configured={Boolean(connection?.username && connection.hasPassword)}
        savedUsername={connection?.username ?? ""}
        hasApiKey={connection?.hasApiKey ?? false}
        connection={
          connection
            ? {
                ...connection,
                lastOutcome: connection.lastOutcome as CeisaOutcome,
              }
            : null
        }
      />
    </DocumentLayout>
  )
}
