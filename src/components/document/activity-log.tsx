import { ArrowRight, CirclePlus, PencilLine, Trash2 } from "lucide-react"

import { formatDateTime } from "@/lib/format"
import type { ActivityEntry } from "@/server/queries/activity"

// Log aktivitas di panel samping dokumen (RU-23): siapa, kapan, dan apa yang berubah.
export function ActivityLog({ entries, noun }: { entries: ActivityEntry[]; noun: string }) {
  if (entries.length === 0) {
    return <p className="text-control text-muted-foreground">Belum ada aktivitas tercatat.</p>
  }
  return (
    <ol className="space-y-4">
      {entries.map((entry) => {
        const Icon =
          entry.action === "INSERT" ? CirclePlus : entry.action === "DELETE" ? Trash2 : PencilLine
        return (
          <li key={entry.id} className="flex gap-3">
            <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-info-soft text-primary">
              <Icon className="size-3.5" aria-hidden />
            </span>
            <div className="min-w-0 space-y-1">
              <p className="text-control">
                <span className="font-medium">{entry.userName ?? "Sistem"}</span>{" "}
                <span className="text-muted-foreground">
                  {entry.action === "INSERT"
                    ? `membuat ${noun}`
                    : entry.action === "DELETE"
                      ? `menghapus ${noun}`
                      : "mengubah"}
                </span>
              </p>
              {entry.changes.length > 0 && (
                <ul className="space-y-0.5 text-control">
                  {entry.changes.map((change) => (
                    <li key={change.field} className="flex flex-wrap items-center gap-x-1.5">
                      <span className="text-muted-foreground">{change.field}:</span>
                      {change.from && (
                        <>
                          <span className="line-through decoration-muted-foreground/60">
                            {change.from}
                          </span>
                          <ArrowRight className="size-3 text-muted-foreground" aria-hidden />
                        </>
                      )}
                      <span className="font-medium">{change.to ?? "—"}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-caption text-muted-foreground">{formatDateTime(entry.at)}</p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
