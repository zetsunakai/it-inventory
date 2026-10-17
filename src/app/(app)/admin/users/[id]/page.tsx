import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"
import { z } from "zod"

import { DocumentLayout } from "@/components/document/document-layout"
import { InfoGrid } from "@/components/layout/info-grid"
import { Section } from "@/components/layout/section"
import { StatusBadge } from "@/components/status-badge"
import { Skeleton } from "@/components/ui/skeleton"
import { formatDate } from "@/lib/format"
import { hasAllWarehouseAccess, requiresMfa, ROLE_LABELS } from "@/lib/permissions"
import { requirePermission } from "@/server/auth/session"
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

  return (
    <DocumentLayout title={user.name} crumbs={[{ label: user.name }]} meta={user.email}>
      <InfoGrid
        items={[
          {
            label: "Peran",
            value: user.roles.length ? (
              user.roles.map((role) => ROLE_LABELS[role]).join(", ")
            ) : (
              <StatusBadge tone="warning">Belum punya peran</StatusBadge>
            ),
          },
          {
            label: "MFA",
            value: user.twoFactorEnabled ? (
              <StatusBadge tone="success">Aktif</StatusBadge>
            ) : requiresMfa(user.roles) ? (
              <StatusBadge tone="warning">Wajib, belum aktif</StatusBadge>
            ) : (
              "Tidak wajib"
            ),
          },
          { label: "Dibuat", value: formatDate(user.createdAt) },
        ]}
      />
      <Section title="Akses gudang">
        {allWarehouses ? (
          <p className="text-control text-muted-foreground">
            Peran {user.roles.map((role) => ROLE_LABELS[role]).join(", ")} otomatis bisa melihat
            semua gudang.
          </p>
        ) : (
          <WarehouseAccess userId={user.id} granted={granted} candidates={candidates} />
        )}
      </Section>
    </DocumentLayout>
  )
}
