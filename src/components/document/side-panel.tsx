"use client"

import { PanelRightClose, PanelRightOpen } from "lucide-react"
import { usePathname } from "next/navigation"
import { useLayoutEffect, useRef, useState, type ReactNode } from "react"

import { cn } from "@/lib/utils"

// Panel selalu mulai tertutup saat berpindah form, tanpa preferensi browser.
// Saat ditutup lebarnya menjadi strip ikon dan ruang sisanya kembali ke form.
export function SidePanel(props: { title: string; children: ReactNode }) {
  const pathname = usePathname()
  return <CollapsibleSidePanel key={pathname} {...props} />
}

function CollapsibleSidePanel({ title, children }: { title: string; children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(true)
  return (
    <aside
      aria-label={title}
      className={cn(
        "min-w-0 overflow-hidden rounded-2xl border bg-card transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
        collapsed ? "w-12" : "w-80",
      )}
    >
      <div
        className={cn(
          "relative flex h-14 items-center justify-end border-b px-2 transition-colors duration-300 motion-reduce:transition-none",
          collapsed ? "border-transparent" : "border-border",
        )}
      >
        <h2
          aria-hidden={collapsed}
          className={cn(
            "absolute right-12 left-4 truncate text-control font-semibold transition-opacity duration-200 motion-reduce:transition-none",
            collapsed ? "pointer-events-none opacity-0" : "opacity-100",
          )}
        >
          {title}
        </h2>
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={
            collapsed ? `Tampilkan ${title.toLowerCase()}` : `Sembunyikan ${title.toLowerCase()}`
          }
          aria-expanded={!collapsed}
          className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-background text-muted-foreground shadow-sm hover:bg-muted hover:text-foreground"
        >
          {collapsed ? (
            <PanelRightOpen className="size-4" />
          ) : (
            <PanelRightClose className="size-4" />
          )}
        </button>
      </div>
      <div
        inert={collapsed}
        aria-hidden={collapsed}
        className={cn(
          "grid transition-[grid-template-rows,opacity,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
          collapsed
            ? "translate-x-2 grid-rows-[0fr] opacity-0"
            : "translate-x-0 grid-rows-[1fr] opacity-100",
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="w-[calc(20rem-2px)] p-4">{children}</div>
        </div>
      </div>
    </aside>
  )
}

// Kolom Aktivitas. Saat tampil di samping isi, bagian atasnya
// sejajar dengan kartu form pertama di kolom isi (bukan baris tombol Simpan atau pesan di atasnya),
// seperti chatter di samping sheet hmx; dihitung ulang bila tinggi isi berubah.
export function DocumentAside({
  className,
  children,
}: {
  className?: string
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const offset = useFormOffset(ref)
  return (
    <div
      ref={ref}
      style={offset ? { marginTop: offset } : undefined}
      className={cn(
        "flex min-w-0 flex-col gap-4 transition-[margin-top] duration-300 ease-out motion-reduce:transition-none",
        className,
      )}
    >
      {children}
    </div>
  )
}

const FORM_CARD = ".form-sheet, .form-notebook"

// Jarak dari atas kolom isi (saudara pertama di grid DocumentLayout) ke kartu form pertama, hanya
// saat kolom ini tampil di samping isi (tidak disembunyikan karena area isi sempit).
function useFormOffset(ref: React.RefObject<HTMLElement | null>) {
  const [offset, setOffset] = useState(0)
  useLayoutEffect(() => {
    const aside = ref.current
    const content = aside?.parentElement?.firstElementChild
    if (!aside || !(content instanceof HTMLElement)) return
    const measure = () => {
      const card = content.querySelector(FORM_CARD)
      const shown = aside.offsetParent !== null
      setOffset(
        shown && card
          ? Math.max(card.getBoundingClientRect().top - content.getBoundingClientRect().top, 0)
          : 0,
      )
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(content)
    observer.observe(aside)
    return () => observer.disconnect()
  }, [ref])
  return offset
}
