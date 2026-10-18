import { Check, ChevronDown, CircleX } from "lucide-react"

import { cn } from "@/lib/utils"

export type StatusStep = { code: string; label: string }

// Status saat ini; urutan alur hanya terlihat saat dropdown dibuka.
export function StatusSteps({
  steps,
  current,
  outside,
  currentLabel,
  dates = {},
}: {
  steps: StatusStep[]
  current?: string
  outside?: { label: string; tone: "neutral" | "danger"; code?: string }
  currentLabel?: string
  dates?: Record<string, Date>
}) {
  const index = steps.findIndex((step) => step.code === current)
  const finished = !outside && index === steps.length - 1
  const label = outside?.label ?? currentLabel ?? steps[index]?.label ?? "—"

  return (
    <section aria-label="Status" className="relative rounded-2xl border bg-card">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-3 rounded-2xl px-4 py-3 text-control outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
          <span
            aria-hidden
            className={cn(
              "flex size-6 shrink-0 items-center justify-center rounded-full",
              outside
                ? outside.tone === "danger"
                  ? "bg-destructive-soft text-destructive"
                  : "bg-muted text-muted-foreground"
                : "bg-info-soft text-primary",
            )}
          >
            {outside ? (
              <CircleX className="size-4" />
            ) : finished ? (
              <Check className="size-4" />
            ) : (
              <span className="size-2 rounded-full bg-primary" />
            )}
          </span>
          <span aria-current="step" className="min-w-0 flex-1 font-semibold">
            {label}
          </span>
          <ChevronDown
            className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
            aria-hidden
          />
        </summary>
        <ol className="absolute top-full right-0 z-20 mt-2 w-full min-w-56 space-y-3 rounded-2xl border bg-popover p-4 text-popover-foreground shadow-md">
          {steps.map((step, stepIndex) => {
            const active = !outside && stepIndex === index
            const done = outside ? Boolean(dates[step.code]) : stepIndex < index || finished
            return (
              <li key={step.code} className="flex items-center gap-3 text-control">
                <span
                  aria-hidden
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-full border",
                    done && "border-primary bg-primary text-primary-foreground",
                    active && !done && "border-primary text-primary",
                    !active && !done && "border-border",
                  )}
                >
                  {done ? (
                    <Check className="size-3" />
                  ) : active ? (
                    <span className="size-2 rounded-full bg-primary" />
                  ) : null}
                </span>
                <span
                  className={cn(active ? "font-semibold text-primary" : "text-muted-foreground")}
                >
                  {active ? (currentLabel ?? step.label) : step.label}
                  {active && <span className="sr-only"> (sekarang)</span>}
                </span>
              </li>
            )
          })}
        </ol>
      </details>
    </section>
  )
}
