import { asc } from "drizzle-orm"
import type { Metadata } from "next"
import { Suspense } from "react"

import { ActivityLog } from "@/components/document/activity-log"
import { FormSection } from "@/components/form-field"
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
      {/* Satu kartu seperti form lain (I-08); tiap pengaturan disimpan sendiri-sendiri. */}
      <FormSection title="Pengaturan sistem">
        {rows.map((row) => (
          <SettingForm
            key={row.key}
            settingKey={row.key}
            label={row.description ?? row.key}
            value={String(row.value)}
          />
        ))}
      </FormSection>
    </DocumentLayout>
  )
}
