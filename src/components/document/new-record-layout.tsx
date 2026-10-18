import type { ReactNode } from "react"

import { ActivityLog } from "./activity-log"
import { DocumentLayout } from "./document-layout"

// Halaman Buat (record baru): susunan sama dengan halaman detail (DocumentLayout), termasuk panel
// Aktivitas yang masih kosong sampai record disimpan, supaya semua form satu template.
export function NewRecordLayout({
  title,
  description,
  noun,
  children,
}: {
  title: string
  description?: ReactNode
  // Nama record untuk teks panel Aktivitas, mis. "produk".
  noun: string
  children: ReactNode
}) {
  return (
    <DocumentLayout
      title={title}
      meta={description}
      activity={<ActivityLog entries={[]} noun={noun} unsaved />}
    >
      {children}
    </DocumentLayout>
  )
}
