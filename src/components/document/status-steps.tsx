"use client"

import { Check, ChevronDown, CircleX } from "lucide-react"
import { useState } from "react"

import { cn } from "@/lib/utils"

export type StatusStep = { code: string; label: string }

// Kartu status dokumen ala hmx (RU-23): "Langkah n dari m" + status sekarang; Detail membuka
// daftar langkah (selesai, sekarang, berikutnya). Status di luar urutan (mis. Batal) tampil
// tanpa nomor langkah.
export function StatusSteps({
  steps,
  current,
  outside,
  currentLabel,
}: {
  steps: StatusStep[]
  // Kode langkah sekarang (salah satu steps), atau kosong bila outside diisi.
  current?: string
  // Status di luar urutan, mis. { label: "Batal" }.
  outside?: { label: string; tone: "neutral" | "danger" }
  // Label status sekarang bila lebih rinci dari nama langkahnya (mis. Sebagian tersedia).
  currentLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const index = steps.findIndex((step) => step.code === current)
  const done = !outside && index === steps.length - 1
  const label = outside?.label ?? currentLabel ?? steps[index]?.label ?? "—"

  return (
    <div className="w-full rounded-lg border bg-card lg:w-72">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 p-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-full",
            outside
              ? outside.tone === "danger"
                ? "bg-destructive-soft text-destructive"
                : "bg-muted text-muted-foreground"
              : done
                ? "bg-success-soft text-success"
                : "bg-info-soft text-primary",
          )}
          aria-hidden
        >
          {outside ? (
            <CircleX className="size-4" />
          ) : done ? (
            <Check className="size-4" />
          ) : (
            <span className="text-control font-semibold">{index + 1}</span>
          )}
        </span>
        <span className="min-w-0 flex-1">
          {!outside && (
            <span className="block text-caption text-muted-foreground">
              Langkah {index + 1} dari {steps.length}
            </span>
          )}
          <span className="block truncate text-control font-semibold">{label}</span>
        </span>
        <span className="flex items-center gap-1 text-caption font-medium text-primary">
          Detail
          <ChevronDown
            className={cn("size-4 transition-transform", open && "rotate-180")}
            aria-hidden
          />
        </span>
      </button>
      {open && (
        <ol className="space-y-2 border-t px-3 py-3">
          {steps.map((step, stepIndex) => {
            const state = outside
              ? "upcoming"
              : stepIndex < index || done
                ? "done"
                : stepIndex === index
                  ? "current"
                  : "upcoming"
            return (
              <li key={step.code} className="flex items-center gap-2.5 text-control">
                <span
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-full border text-caption",
                    state === "done" && "border-success bg-success text-white",
                    state === "current" && "border-primary bg-primary text-primary-foreground",
                    state === "upcoming" && "text-muted-foreground",
                  )}
                  aria-hidden
                >
                  {state === "done" ? <Check className="size-3" /> : stepIndex + 1}
                </span>
                <span
                  className={cn(
                    state === "current" && "font-semibold text-primary",
                    state === "upcoming" && "text-muted-foreground",
                  )}
                >
                  {step.label}
                  {state === "current" && <span className="sr-only"> (sekarang)</span>}
                </span>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
