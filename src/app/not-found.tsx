import Link from "next/link"

import { buttonVariants } from "@/components/ui/button"

export default function NotFound() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 px-4 py-16">
      <p className="text-sm text-muted-foreground">404</p>
      <h1 className="text-2xl font-semibold tracking-tight">Halaman tidak ditemukan</h1>
      <p className="text-muted-foreground">
        Data yang Anda cari tidak ada, sudah dipindahkan, atau Anda tidak punya akses ke data ini.
      </p>
      <div>
        <Link href="/" className={buttonVariants()}>
          Kembali ke beranda
        </Link>
      </div>
    </main>
  )
}
