import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

// Tata letak form standar (backlog UF-03; aturan urutan field di skill ui-it-inventory):
//   - satu lebar untuk semua form (FORM_CLASS);
//   - FormGrid dua kolom di desktop: kolom kiri siapa/di mana (partner, jenis, lokasi), kolom kanan
//     kapan/rujukan (tanggal, referensi); field panjang (alasan, catatan) memakai FormWide;
//   - FormActions di bawah: aksi utama dulu, lalu sekunder, aksi berbahaya di kanan; menempel di
//     bawah layar di HP.

export const FORM_CLASS = "w-full max-w-4xl space-y-6"

export function FormGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid gap-x-6 gap-y-5 sm:grid-cols-2", className)}>{children}</div>
}

export function FormWide({ children }: { children: ReactNode }) {
  return <div className="sm:col-span-2">{children}</div>
}

export function FormActions({
  children,
  danger,
}: {
  children: ReactNode
  // Aksi berbahaya (Hapus, Batalkan), dipisah di kanan.
  danger?: ReactNode
}) {
  return (
    <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:static sm:mx-0 sm:bg-transparent sm:px-0 sm:pt-5 sm:pb-0 sm:backdrop-blur-none">
      {children}
      {danger && <div className="ml-auto flex flex-wrap gap-2">{danger}</div>}
    </div>
  )
}

// Dua kolom dengan isi tetap per kolom (bukan mengalir per baris): kiri siapa/di mana, kanan
// kapan/rujukan. Di HP kolom kiri dulu, lalu kanan.
export function FormColumns({ children }: { children: ReactNode }) {
  return <div className="grid items-start gap-x-6 gap-y-5 sm:grid-cols-2">{children}</div>
}

export function FormColumn({ children }: { children: ReactNode }) {
  return <div className="space-y-5">{children}</div>
}
