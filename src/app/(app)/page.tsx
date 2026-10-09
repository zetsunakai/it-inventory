import { ChevronRight } from "lucide-react"
import Link from "next/link"
import { Suspense } from "react"

import { StatusBadge } from "@/components/status-badge"
import { Skeleton } from "@/components/ui/skeleton"
import { requireUser } from "@/server/auth/session"
import { attentionItems } from "@/server/queries/home"

// Beranda berisi pekerjaan, bukan sapaan (skill ui-it-inventory): hal yang perlu
// ditindaklanjuti. Navigasi modul cukup di sidebar.
export default function HomePage() {
  return (
    <>
      <h1 className="sr-only">Beranda</h1>
      <Suspense fallback={<Skeleton className="h-40 w-full" />}>
        <Home />
      </Suspense>
    </>
  )
}

async function Home() {
  const user = await requireUser()
  const items = await attentionItems(user)

  return (
    <div className="max-w-3xl">
      <section aria-labelledby="perlu-perhatian" className="space-y-3">
        <h2 id="perlu-perhatian" className="text-base font-semibold">
          Perlu perhatian
        </h2>
        {items.length === 0 ? (
          <p className="rounded-lg border bg-card px-4 py-6 text-sm text-muted-foreground">
            Tidak ada yang perlu ditindaklanjuti saat ini.
          </p>
        ) : (
          <ul className="divide-y rounded-lg border bg-card">
            {items.map((item) => (
              <li key={item.title}>
                <Link
                  href={item.href}
                  className="group flex items-start gap-3 px-4 py-3 outline-none hover:bg-muted/50 focus-visible:bg-muted/50"
                >
                  <StatusBadge tone={item.tone} className="mt-0.5">
                    {item.tone === "danger" ? "Wajib" : "Perhatian"}
                  </StatusBadge>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{item.title}</span>
                    <span className="block text-sm text-muted-foreground">{item.detail}</span>
                  </span>
                  <ChevronRight
                    aria-hidden
                    className="mt-0.5 size-4 shrink-0 text-muted-foreground group-hover:text-foreground"
                  />
                </Link>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">
          Pengecualian transaksi (dokumen BC belum terdaftar, selisih qty) tampil di sini mulai M4.
        </p>
      </section>
    </div>
  )
}
