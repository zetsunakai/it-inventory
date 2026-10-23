import type { RelationColumn } from "./relational-table"

export function relationColumns<Row>(
  fields: readonly {
    id: string
    label: string
    required?: boolean
    numeric?: boolean
    optional?: boolean
    hidden?: boolean
  }[],
  columns: RelationColumn<Row>[],
): RelationColumn<Row>[] {
  return fields.map((field) => {
    const column = columns.find((column) => column.id === field.id)
    if (!column) throw new Error(`Kolom ${field.id} belum didefinisikan.`)
    return { ...column, ...field }
  })
}
