import { Suspense } from "react"

import { Button } from "@/components/ui/button"
import { signOut } from "@/server/auth/actions"
import { requireUser } from "@/server/auth/session"

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-6 px-4 py-16">
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">Kawasan Berikat</p>
        <h1 className="text-3xl font-semibold tracking-tight">IT Inventory</h1>
        <p className="text-muted-foreground">
          Pencatatan pergerakan barang di gudang berikat yang terhubung dengan dokumen BC.
        </p>
      </div>
      <Suspense fallback={<p className="text-sm text-muted-foreground">Memuat sesi…</p>}>
        <CurrentUser />
      </Suspense>
    </main>
  )
}

async function CurrentUser() {
  const user = await requireUser()
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
      <div>
        <p className="font-medium">{user.name}</p>
        <p className="text-sm text-muted-foreground">{user.email}</p>
      </div>
      <form action={signOut}>
        <Button type="submit" variant="outline">
          Keluar
        </Button>
      </form>
    </div>
  )
}
