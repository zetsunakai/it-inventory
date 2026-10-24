import { cn } from "@/lib/utils"

export type StatusStep = { code: string; label: string }

// Seluruh tahap terlihat dalam satu baris kapsul; status hanya indikator, bukan tombol transisi.
export function StatusSteps({
  steps,
  current,
  outside,
  currentLabel,
}: {
  steps: StatusStep[]
  current?: string
  outside?: { label: string; tone: "neutral" | "danger"; code?: string }
  currentLabel?: string
  dates?: Record<string, Date>
}) {
  const activeCode = outside ? (outside.code ?? "outside") : current
  const displayedSteps = outside
    ? [
        ...steps.filter((step) => step.code !== activeCode),
        { code: outside.code ?? "outside", label: outside.label },
      ]
    : steps

  return (
    <section
      aria-label="Status"
      className="max-w-full rounded-3xl border border-border bg-muted p-1 shadow-sm"
    >
      <ol className="flex flex-wrap items-center gap-1">
        {displayedSteps.map((step) => {
          const active = step.code === activeCode
          return (
            <li key={step.code} className="min-w-0">
              <span
                aria-current={active ? "step" : undefined}
                className={cn(
                  "block rounded-full px-4 py-2 text-control font-semibold wrap-anywhere",
                  active
                    ? outside
                      ? outside.tone === "danger"
                        ? "bg-destructive-soft text-destructive"
                        : "bg-card text-foreground shadow-sm"
                      : "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground",
                )}
              >
                {active ? (outside?.label ?? currentLabel ?? step.label) : step.label}
              </span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
