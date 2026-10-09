import { asc } from "drizzle-orm"
import type { Metadata } from "next"
import { Suspense } from "react"

import { PageHeader } from "@/components/page-header"
import { requirePermission } from "@/server/auth/session"
import { db } from "@/server/db"
import { systemSettings } from "@/server/db/schema"

import { SettingForm } from "./setting-form"

export const metadata: Metadata = { title: "Pengaturan · IT Inventory" }

export default function SettingsPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title="Pengaturan" description="Setiap perubahan tercatat di audit log." />
      <Suspense fallback={<p className="text-sm text-muted-foreground">Memuat…</p>}>
        <SettingList />
      </Suspense>
    </div>
  )
}

async function SettingList() {
  await requirePermission("settings:write")
  const rows = await db.select().from(systemSettings).orderBy(asc(systemSettings.key))

  return (
    <ul className="space-y-6">
      {rows.map((row) => (
        <li key={row.key} className="space-y-2">
          <div>
            <p className="font-medium">{row.description ?? row.key}</p>
            <p className="font-mono text-xs text-muted-foreground">{row.key}</p>
          </div>
          <SettingForm settingKey={row.key} value={String(row.value)} />
        </li>
      ))}
    </ul>
  )
}
