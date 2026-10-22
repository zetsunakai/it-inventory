"use client"

import { PanelRightClose, PanelRightOpen } from "lucide-react"
import { useLayoutEffect, useRef, useState, type ReactNode } from "react"

import { useStoredValue } from "@/lib/use-stored-value"
import { cn } from "@/lib/utils"

// Panel samping dokumen (RU-23, seperti hmx): log aktivitas, bisa diciutkan; pilihannya diingat
// per browser. Bawaannya diciutkan (rail 48px) supaya isi dokumen selebar form lain; dibuka lewat
// tombolnya. Tanpa scroll sendiri: panjangnya mengikuti isi dan ikut halaman. Hanya tampil saat area
// isi lebar (@5xl DocumentLayout); saat sempit diganti strip ikon DocumentRail. wide = kolom kanan
// selalu 320px (dokumen dengan kartu status di atasnya): diciutkan hanya menyembunyikan isinya.
export function SidePanel({
  title,
  wide,
  children,
}: {
  title: string
  wide?: boolean
  children: ReactNode
}) {
  const [collapsed, setCollapsed] = useStoredValue("panel-samping-ciut", true)
  const rail = collapsed && !wide
  return (
    <aside
      aria-label={title}
      className={cn("min-w-0 rounded-2xl border bg-card", rail ? "w-12" : "w-80")}
    >
      <div
        className={cn(
          "flex items-center justify-between gap-2 border-b px-4 py-3",
          rail && "px-2",
          // Diciutkan di kolom lebar: hanya judul, tanpa garis ke isi yang tersembunyi.
          collapsed && wide && "border-b-0",
        )}
      >
        <h2 className={cn("text-control font-semibold", rail && "sr-only")}>{title}</h2>
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={
            collapsed ? `Tampilkan ${title.toLowerCase()}` : `Sembunyikan ${title.toLowerCase()}`
          }
          aria-expanded={!collapsed}
          className="flex size-8 items-center justify-center rounded-md border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          {collapsed ? (
            <PanelRightOpen className="size-4" />
          ) : (
            <PanelRightClose className="size-4" />
          )}
        </button>
      </div>
      <div className={cn("p-4", collapsed && "hidden")}>{children}</div>
    </aside>
  )
}

// Kolom kanan dokumen (kartu status, panel samping). Saat tampil di samping isi, bagian atasnya
// sejajar dengan kartu form pertama di kolom isi (bukan baris tombol Simpan atau pesan di atasnya),
// seperti chatter di samping sheet hmx; dihitung ulang bila tinggi isi berubah.
export function DocumentAside({
  wide,
  className,
  children,
}: {
  wide?: boolean
  className?: string
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const offset = useFormOffset(ref)
  return (
    <div
      ref={ref}
      style={offset ? { marginTop: offset } : undefined}
      className={cn("flex min-w-0 flex-col gap-4", wide && "w-80", className)}
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
