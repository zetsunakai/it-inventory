"use client"

import { createContext, useContext, type ReactNode } from "react"

const DocumentStatusContext = createContext<ReactNode>(null)

// Status mengikuti baris aksi yang aktif, termasuk saat RecordModes berganti baca/edit.
export function DocumentStatusProvider({
  status,
  children,
}: {
  status?: ReactNode
  children: ReactNode
}) {
  return (
    <DocumentStatusContext value={status}>
      <div className="document-status-scope min-w-0">
        {status && (
          <div data-document-status-fallback className="mb-4 flex min-w-0 justify-end">
            {status}
          </div>
        )}
        <div className="space-y-4">{children}</div>
      </div>
    </DocumentStatusContext>
  )
}

export function DocumentStatusSlot({ header = false }: { header?: boolean }) {
  const status = useContext(DocumentStatusContext)
  if (!status) return null
  return (
    <div
      data-document-status-slot={header ? "header" : "form"}
      className="ml-auto max-w-full min-w-0"
    >
      {status}
    </div>
  )
}
