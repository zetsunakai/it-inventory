import Link from "next/link"

import { buttonVariants } from "@/components/ui/button"

export default function Forbidden() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 px-4 py-16">
      <p className="text-sm text-muted-foreground">403</p>
      <h1 className="text-2xl font-semibold tracking-tight">Akses ditolak</h1>
      <p className="text-muted-foreground">
        Peran Anda tidak punya izin untuk membuka halaman ini. Hubungi Administrator bila Anda
        memerlukan akses.
      </p>
      <div>
        <Link href="/" className={buttonVariants()}>
          Kembali ke beranda
        </Link>
      </div>
    </main>
  )
}
