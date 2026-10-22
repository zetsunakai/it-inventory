import type { Metadata } from "next"
import { Suspense } from "react"

import { PageHeader } from "@/components/page-header"
import { Skeleton } from "@/components/ui/skeleton"
import { hasPermission } from "@/lib/permissions"
import { DemoDataButton } from "@/modules/inventory/components/demo-data-button"
import { InventoryDashboardView } from "@/modules/inventory/components/inventory-dashboard"
import { inventoryDemoAllowed, inventoryDemoRuns } from "@/modules/inventory/server/demo-data"
import { inventoryDashboard } from "@/modules/inventory/server/queries/dashboard"
import { requirePermission } from "@/server/auth/session"

export const metadata: Metadata = { title: "Dashboard inventory · IT Inventory" }

// Inventory Dashboard hmx-002 (menu Inventory Dashboard, sequence 5 di bawah root inventory).
export default function InventoryDashboardPage() {
  return (
    <>
      <PageHeader
        title="Dashboard inventory"
        description="Ringkasan stok dan dokumen transfer aktif di gudang yang boleh Anda lihat."
        actions={
          <Suspense fallback={null}>
            <DemoAction />
          </Suspense>
        }
      />
      <Suspense fallback={<DashboardSkeleton />}>
        <Dashboard />
      </Suspense>
    </>
  )
}

// Tombol data demo hanya untuk Administrator; pilih studi kasus, satu putaran per klik.
async function DemoAction() {
  const user = await requirePermission("inventory:read")
  if (!hasPermission(user.roles, "settings:write") || !inventoryDemoAllowed()) return null
  return <DemoDataButton runs={await inventoryDemoRuns()} />
}

async function Dashboard() {
  const user = await requirePermission("inventory:read")
  return <InventoryDashboardView data={await inventoryDashboard(user.id)} />
}

function DashboardSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-12">
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-36 w-full rounded-xl xl:col-span-3" />
      ))}
      <Skeleton className="h-36 w-full rounded-xl sm:col-span-2 xl:col-span-12" />
      <Skeleton className="h-80 w-full rounded-xl sm:col-span-2 xl:col-span-12 2xl:col-span-6" />
      <Skeleton className="h-80 w-full rounded-xl sm:col-span-2 xl:col-span-12 2xl:col-span-6" />
    </div>
  )
}
