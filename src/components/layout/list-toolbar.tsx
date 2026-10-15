import type { ReactNode } from "react"

// Toolbar halaman daftar (backlog UF-03): cari dan filter di kiri, aksi utama (Buat …) di kanan.
export function ListToolbar({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      {children}
      {action && <div className="sm:ml-auto">{action}</div>}
    </div>
  )
}
