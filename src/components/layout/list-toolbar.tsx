import type { ReactNode } from "react"

// Action bar daftar ala hmx-002 (backlog RU-22): aksi utama (Buat …) di kiri, pencarian dengan
// filter di tengah, pager di kanan. Di HP: aksi, pencarian, lalu pager bertumpuk.
export function ListToolbar({
  children,
  action,
  pager,
}: {
  children: ReactNode
  action?: ReactNode
  pager?: ReactNode
}) {
  return (
    <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
      {action && <div className="flex shrink-0 gap-2">{action}</div>}
      <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
        {children}
      </div>
      {pager && <div className="flex justify-end">{pager}</div>}
    </div>
  )
}
