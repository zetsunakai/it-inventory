"use client"

import type { ReactNode } from "react"

import { RelationalTable } from "./relational-table"

export type ReadColumn = {
  id: string
  label: string
  required?: boolean
  numeric?: boolean
  optional?: boolean
  hidden?: boolean
  width?: number
  footer?: ReactNode
}
export type ReadRow = {
  details?: ReactNode
  key: string
  values: Record<string, string>
  cells: Record<string, ReactNode>
}

// Hanya data dan slot React yang melintasi batas server/client, bukan callback dari server.
export function RelationalViewClient({
  id,
  label,
  columns,
  rows,
  hasDetails,
}: {
  id: string
  label: string
  columns: ReadColumn[]
  hasDetails?: boolean
  rows: ReadRow[]
}) {
  return (
    <RelationalTable
      id={id}
      label={label}
      readOnly
      details={hasDetails ? (row) => row.details : undefined}
      rows={rows}
      rowKey={(row) => row.key}
      columns={columns.map(({ footer, ...column }) => ({
        ...column,
        value: (row: ReadRow) => row.values[column.id] ?? "",
        render: (row: ReadRow) => row.cells[column.id] ?? "—",
        ...(footer !== undefined ? { footer: () => footer } : {}),
      }))}
    />
  )
}
