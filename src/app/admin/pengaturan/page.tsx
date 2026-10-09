import { asc } from "drizzle-orm"
import type { Metadata } from "next"
import { Suspense } from "react"

import { requirePermission } from "@/server/auth/session"
import { db } from "@/server/db"
import { systemSettings } from "@/server/db/schema"

import { SettingForm } from "./setting-form"

export const metadata: Metadata = { title: "Pengaturan · IT Inventory" }

export default function SettingsPage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 px-4 py-10">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Pengaturan</h1>
        <p className="text-sm text-muted-foreground">Setiap perubahan tercatat di audit log.</p>
      </div>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Memuat…</p>}>
        <SettingList />
      </Suspense>
    </main>
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
