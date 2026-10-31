import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

// Status bersama (skill ui-it-inventory), mengikuti brand kit Veltinc: pill berlatar pucat dengan
// titik dan teks berwarna sesuai arti. Warna hanya untuk arti, teks selalu ada. Keadaan normal
// (mis. "Aktif") tidak perlu ditandai sama sekali.
export type StatusTone = "success" | "warning" | "danger" | "info" | "bonded" | "neutral"

const DOT: Record<StatusTone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-destructive",
  info: "bg-info",
  bonded: "bg-bonded",
  neutral: "bg-muted-foreground",
}

const TEXT: Record<StatusTone, string> = {
  success: "text-success",
  warning: "text-warning",
  danger: "text-destructive",
  info: "text-info",
  bonded: "text-bonded",
  neutral: "text-muted-foreground",
}

const PILL: Record<StatusTone, string> = {
  success: "bg-success-soft",
  warning: "bg-warning-soft",
  danger: "bg-destructive-soft",
  info: "bg-info-soft",
  bonded: "bg-bonded-soft",
  neutral: "bg-muted",
}

export function StatusBadge({
  tone,
  children,
  title,
  className,
}: {
  tone: StatusTone
  children: ReactNode
  title?: string
  className?: string
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-caption font-medium whitespace-nowrap",
        TEXT[tone],
        PILL[tone],
        className,
      )}
    >
      <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", DOT[tone])} />
      {children}
    </span>
  )
}

// Penanda data yang diarsipkan, diletakkan di sebelah nama.
export function ArchivedBadge() {
  return <StatusBadge tone="neutral">Arsip</StatusBadge>
}

// Sel nama di tabel: tebal, dengan penanda Arsip di sebelahnya bila diarsipkan.
export function NameCell({ children, archived }: { children: ReactNode; archived?: boolean }) {
  return (
    <span className="inline-flex min-w-32 flex-wrap items-center gap-x-2">
      <span className="font-medium text-foreground">{children}</span>
      {archived && <ArchivedBadge />}
    </span>
  )
}
