"use client"

import { PanelRightClose, PanelRightOpen } from "lucide-react"
import type { ReactNode } from "react"

import { useStoredValue } from "@/lib/use-stored-value"
import { cn } from "@/lib/utils"

// Panel samping dokumen (RU-23, seperti hmx): log aktivitas, bisa diciutkan; pilihannya diingat
// per browser. Bawaannya diciutkan (rail 48px) supaya isi dokumen selebar form lain; dibuka lewat
// tombolnya. Tanpa scroll sendiri: panjangnya mengikuti isi dan ikut halaman. Di layar sempit
// panel tampil di bawah isi dokumen.
export function SidePanel({ title, children }: { title: string; children: ReactNode }) {
  const [collapsed, setCollapsed] = useStoredValue("panel-samping-ciut", true)
  return (
    <aside
      aria-label={title}
      className={cn("min-w-0 rounded-2xl border bg-card", collapsed ? "xl:w-12" : "xl:w-80")}
    >
      <div
        className={cn(
          "flex items-center justify-between gap-2 border-b px-4 py-3",
          collapsed && "xl:px-2",
        )}
      >
        <h2 className={cn("text-control font-semibold", collapsed && "xl:sr-only")}>{title}</h2>
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={
            collapsed ? `Tampilkan ${title.toLowerCase()}` : `Sembunyikan ${title.toLowerCase()}`
          }
          aria-expanded={!collapsed}
          className="hidden size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground xl:flex"
        >
          {collapsed ? (
            <PanelRightOpen className="size-4" />
          ) : (
            <PanelRightClose className="size-4" />
          )}
        </button>
      </div>
      <div className={cn("p-4", collapsed && "xl:hidden")}>{children}</div>
    </aside>
  )
}
