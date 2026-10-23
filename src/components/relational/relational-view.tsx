import type { ReactNode } from "react"
import type { RelationColumn } from "./relational-table"
import { RelationalViewClient } from "./relational-view-client"

// Tabel mode baca memakai renderer, preferensi kolom, dan pembagian lebar yang sama dengan edit.
export function RelationalView<Row>({
  id,
  label,
  rows,
  columns,
  rowKey,
  details,
}: {
  id: string
  label: string
  rows: Row[]
  columns: RelationColumn<Row>[]
  rowKey: (row: Row, index: number) => string
  details?: (row: Row, index: number) => ReactNode
}) {
  return (
    <RelationalViewClient
      id={id}
      label={label}
      hasDetails={Boolean(details)}
      columns={columns.map(({ id, label, required, numeric, optional, hidden, width, footer }) => ({
        id,
        label,
        required,
        numeric,
        optional,
        hidden,
        width,
        ...(footer ? { footer: footer(rows) } : {}),
      }))}
      rows={rows.map((row, index) => ({
        key: rowKey(row, index),
        details: details?.(row, index),
        values: Object.fromEntries(columns.map((column) => [column.id, column.value(row, index)])),
        cells: Object.fromEntries(
          columns.map((column) => [
            column.id,
            column.render?.(row, index) ?? (column.value(row, index) || "—"),
          ]),
        ),
      }))}
    />
  )
}
