import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

// Status bersama (skill ui-it-inventory). Warna hanya untuk arti, teks selalu ada:
//   warning/danger = perlu tindakan → pill berlatar, supaya menonjol
//   success/info/bonded/neutral   = keterangan → titik + teks, tenang
// Keadaan normal (mis. "Aktif") tidak perlu ditandai sama sekali.
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

const PILL: Partial<Record<StatusTone, string>> = {
  warning: "bg-warning-soft",
  danger: "bg-destructive-soft",
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
  const pill = PILL[tone]
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap",
        TEXT[tone],
        pill && `rounded-full px-2 py-0.5 ${pill}`,
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
