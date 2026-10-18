import type { ReactNode } from "react"

import { ActivityLog } from "./activity-log"
import { DocumentLayout } from "./document-layout"

// Halaman Buat (record baru): susunan sama dengan halaman detail (DocumentLayout), termasuk panel
// Aktivitas yang masih kosong sampai record disimpan, supaya semua form satu template.
export function NewRecordLayout({
  title,
  hideTitle,
  description,
  noun,
  status,
  children,
}: {
  title: string
  hideTitle?: boolean
  description?: ReactNode
  // Nama record untuk teks panel Aktivitas, mis. "produk".
  noun: string
  status?: ReactNode
  children: ReactNode
}) {
  return (
    <DocumentLayout
      title={title}
      hideTitle={hideTitle}
      meta={description}
      status={status}
      activity={<ActivityLog entries={[]} noun={noun} unsaved />}
    >
      {children}
    </DocumentLayout>
  )
}
