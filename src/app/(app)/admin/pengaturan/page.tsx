import { asc } from "drizzle-orm"
import type { Metadata } from "next"
import { Suspense } from "react"

import { ActivityLog } from "@/components/document/activity-log"
import { DocumentLayout } from "@/components/document/document-layout"
import { Skeleton } from "@/components/ui/skeleton"
import { requirePermission } from "@/server/auth/session"
import { db } from "@/server/db"
import { systemSettings } from "@/server/db/schema"
import { tableActivity } from "@/server/queries/activity"

import { SettingForm } from "./setting-form"

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
  const rows = await db.select().from(systemSettings).orderBy(asc(systemSettings.key))
  const labels = new Map(rows.map((row) => [row.key, row.description ?? row.key]))
  const activity = await tableActivity("system_settings", "value", (key) => labels.get(key) ?? key)

  return (
    <DocumentLayout
      title="Pengaturan"
      meta="Setiap perubahan tercatat di audit log."
      activity={<ActivityLog entries={activity} noun="pengaturan" />}
    >
      <ul className="space-y-6">
        {rows.map((row) => (
          <li key={row.key} className="space-y-2">
            <div>
              <p className="font-medium">{row.description ?? row.key}</p>
              <p className="font-mono text-caption text-muted-foreground">{row.key}</p>
            </div>
            <SettingForm settingKey={row.key} value={String(row.value)} />
          </li>
        ))}
      </ul>
    </DocumentLayout>
  )
}
