"use client"

import { PanelRightClose, PanelRightOpen } from "lucide-react"
import { useLayoutEffect, useRef, useState, type ReactNode } from "react"

import { useStoredValue } from "@/lib/use-stored-value"
import { cn } from "@/lib/utils"

// Panel samping dokumen (RU-23, seperti hmx): log aktivitas, bisa diciutkan; pilihannya diingat
// per browser. Bawaannya diciutkan (rail 48px) supaya isi dokumen selebar form lain; dibuka lewat
// tombolnya. Tanpa scroll sendiri: panjangnya mengikuti isi dan ikut halaman. Di layar sempit
// panel tampil di bawah isi dokumen. wide = kolom kanan selalu 320px (dokumen dengan kartu
// status di atasnya): diciutkan hanya menyembunyikan isinya, lebarnya tetap.
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
      className={cn("min-w-0 rounded-2xl border bg-card", rail ? "xl:w-12" : "xl:w-80")}
    >
      <div
        className={cn(
          "flex items-center justify-between gap-2 border-b px-4 py-3",
          rail && "xl:px-2",
          // Diciutkan di kolom lebar: hanya judul, tanpa garis ke isi yang tersembunyi.
          collapsed && wide && "xl:border-b-0",
        )}
      >
        <h2 className={cn("text-control font-semibold", rail && "xl:sr-only")}>{title}</h2>
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

// Kolom kanan dokumen (kartu status, panel samping). Di layar lebar bagian atasnya sejajar dengan
// kartu form pertama di kolom isi (bukan baris tombol Simpan atau pesan di atasnya), seperti chatter
// di samping sheet hmx; dihitung ulang bila tinggi isi berubah.
export function DocumentAside({ wide, children }: { wide?: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const offset = useFormOffset(ref)
  return (
    <div
      ref={ref}
      style={offset ? { marginTop: offset } : undefined}
      className={cn("flex min-w-0 flex-col gap-4", wide && "xl:w-80")}
    >
      {children}
    </div>
  )
}

const FORM_CARD = ".form-sheet, .form-notebook"
const WIDE = "(min-width: 1280px)"

// Jarak dari atas kolom isi (saudara sebelumnya di grid DocumentLayout) ke kartu form pertama, hanya
// di layar lebar (≥ 1280px, saat kolom kanan di samping).
function useFormOffset(ref: React.RefObject<HTMLElement | null>) {
  const [offset, setOffset] = useState(0)
  useLayoutEffect(() => {
    const aside = ref.current
    const content = aside?.previousElementSibling
    if (!aside || !(content instanceof HTMLElement)) return
    const wide = window.matchMedia(WIDE)
    const measure = () => {
      const card = content.querySelector(FORM_CARD)
      setOffset(
        wide.matches && card
          ? Math.max(card.getBoundingClientRect().top - content.getBoundingClientRect().top, 0)
          : 0,
      )
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(content)
    wide.addEventListener("change", measure)
    return () => {
      observer.disconnect()
      wide.removeEventListener("change", measure)
    }
  }, [ref])
  return offset
}
