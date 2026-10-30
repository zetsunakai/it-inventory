import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { z } from "zod"

import { ActivityLog } from "@/components/document/activity-log"
import { DocumentLayout } from "@/components/document/document-layout"
import { StaticField, ViewSection } from "@/components/form-field"
import { Section } from "@/components/layout/section"
import { StatusBadge } from "@/components/status-badge"
import { Skeleton } from "@/components/ui/skeleton"
import { formatDate } from "@/lib/format"
import { hasAllWarehouseAccess, ROLE_LABELS, type Role } from "@/lib/permissions"
import { requirePermission } from "@/server/auth/session"
import { db } from "@/server/db"
import { warehouses } from "@/server/db/schema"
import { childActivity, mergeActivity, recordActivity } from "@/server/queries/activity"
import { getUser, listGrantableWarehouses, listUserWarehouses } from "@/server/queries/users"

import { WarehouseAccess } from "../warehouse-access"

export const metadata: Metadata = { title: "Detail pengguna · IT Inventory" }

export default function UserPage({ params }: PageProps<"/admin/users/[id]">) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <UserDetail params={params} />
    </Suspense>
  )
}

// Detail pengguna (RM-02): data akun dan akses gudang. Akses gudang dipindah ke sini dari
// halaman detail gudang supaya diatur per orang.
async function UserDetail({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("user:manage")
  const { id } = await params
  if (!z.uuid().safeParse(id).success) notFound()
  const user = await getUser(id)
  if (!user) notFound()
  const allWarehouses = hasAllWarehouseAccess(user.roles)
  const [granted, candidates] = allWarehouses
    ? [[], []]
    : await Promise.all([listUserWarehouses(user.id), listGrantableWarehouses(user.id)])
  const activity = await userActivity(user.id)

  return (
    <DocumentLayout
      title={user.name}
      crumbs={[{ label: user.name }]}
      activity={<ActivityLog entries={activity} noun="pengguna" />}
    >
      <ViewSection title="Data akun">
        <StaticField label="Nama" value={user.name} />
        <StaticField label="Email" value={user.email} />
        <StaticField
          label="Peran"
          value={
            user.roles.length ? (
              user.roles.map((role) => ROLE_LABELS[role]).join(", ")
            ) : (
              <StatusBadge tone="warning">Belum punya peran</StatusBadge>
            )
          }
        />
        <StaticField
          label="MFA"
          value={
            user.twoFactorEnabled ? <StatusBadge tone="success">Aktif</StatusBadge> : "Tidak aktif"
          }
        />
        <StaticField label="Dibuat" value={formatDate(user.createdAt)} />
      </ViewSection>
      {allWarehouses ? (
        <Section title="Akses gudang">
          <p className="text-control text-muted-foreground">
            Peran {user.roles.map((role) => ROLE_LABELS[role]).join(", ")} otomatis bisa melihat
            semua gudang.
          </p>
        </Section>
      ) : (
        <WarehouseAccess userId={user.id} granted={granted} candidates={candidates} />
      )}
    </DocumentLayout>
  )
}

// Riwayat pengguna: data akun, peran, dan akses gudang (tabel peran dan akses gudang tercatat per
// pengguna di audit log).
async function userActivity(userId: string) {
  const names = new Map(
    (
      await db
        .select({ id: warehouses.id, code: warehouses.code, name: warehouses.name })
        .from(warehouses)
    ).map((row) => [row.id, `${row.code} · ${row.name}`]),
  )
  return mergeActivity(
    await recordActivity("users", userId, {
      fields: { name: "Nama", email: "Email", two_factor_enabled: "MFA" },
    }),
    await childActivity("user_roles", userId, "Peran", (data) =>
      String(ROLE_LABELS[data.role as Role] ?? data.role),
    ),
    await childActivity("user_warehouses", userId, "Akses gudang", (data) =>
      String(names.get(String(data.warehouse_id)) ?? "gudang"),
    ),
  )
}
