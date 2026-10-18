import Link from "next/link"
import type { ReactNode } from "react"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"

import { ColumnMenu, GroupToggle } from "./data-table-client"
import {
  RowCheckbox,
  RowSelection,
  SelectAllCheckbox,
  type BulkDeleteAction,
} from "./data-table-selection"

export type DataTableColumn<Row> = {
  header: string
  cell: (row: Row) => ReactNode
  // Angka dan aksi rata kanan; teks rata kiri.
  align?: "left" | "right"
  className?: string
  // Kolom opsional (RU-22): user bisa menyembunyikan/menampilkannya; "hide" = tersembunyi dulu.
  optional?: "show" | "hide"
}

export type DataTableGroup<Row> = {
  key: (row: Row) => string
  label: (row: Row) => ReactNode
}

const columnId = (header: string) =>
  header
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")

// Pilih baris lalu Hapus (data master, M1-08). id = id data untuk action, label = penandanya di
// konfirmasi dan pesan tolak (kode/SKU/nama).
export type DataTableBulkDelete<Row> = {
  action: BulkDeleteAction
  noun: string
  id: (row: Row) => string
  label: (row: Row) => string
}

export type DataTableEmpty = {
  title: string
  description?: string
  action?: ReactNode
  // Halaman daftar ala hmx (listEmptyState): tabel diisi baris kosong sampai sekian baris, dan
  // pesan kosong hanya untuk pembaca layar.
  minRows?: number
}

// Tabel untuk halaman daftar (skill ui-it-inventory, pola hmx RU-22): header 48px, baris 44px,
// angka rata kanan, seluruh baris bisa diklik ke detail lewat rowHref, kolom opsional (perlu id),
// dan pengelompokan baris (group). Data sudah dicari, difilter, dan dipotong per halaman di server.
export function DataTable<Row>({
  id,
  columns,
  rows,
  rowKey,
  rowHref,
  rowMuted,
  group,
  bulkDelete,
  empty = { title: "Tidak ada data." },
}: {
  // Wajib bila ada kolom opsional (kunci penyimpanan pilihan kolom).
  id?: string
  columns: DataTableColumn<Row>[]
  rows: Row[]
  rowKey: (row: Row) => string
  // Tautan detail; kolom pertama menjadi link yang menutupi seluruh baris.
  rowHref?: (row: Row) => string
  // Baris yang diredupkan, misalnya data yang diarsipkan.
  rowMuted?: (row: Row) => boolean
  group?: DataTableGroup<Row>
  // Hanya untuk peran yang boleh menghapus.
  bulkDelete?: DataTableBulkDelete<Row>
  empty?: DataTableEmpty
}) {
  const optional = id ? columns.filter((column) => column.optional) : []
  const span = columns.length + (optional.length ? 1 : 0) + (bulkDelete ? 1 : 0)
  const groups = group ? [...Map.groupBy(rows, (row) => group.key(row)).values()] : [rows]
  const fillers = Math.max((empty.minRows ?? 0) - rows.length, 0)
  // Halaman daftar (listEmptyState): lebar kolom tetap seperti list view hmx, dibagi rata ke kolom
  // yang didefinisikan; lebar per kolom dari halaman diabaikan dan isi panjang dipotong (…).
  const fixed = Boolean(empty.minRows)
  const fixedCell = fixed && "w-auto min-w-0 truncate"
  const fillerRows = Array.from({ length: fillers }, (_, index) => (
    <TableRow key={`kosong-${index}`} aria-hidden className="hover:bg-transparent">
      <TableCell colSpan={span} className="h-11" />
    </TableRow>
  ))

  const renderRow = (row: Row) => {
    const href = rowHref?.(row)
    return (
      <TableRow
        key={rowKey(row)}
        className={cn(
          href && "relative cursor-pointer",
          rowMuted?.(row) && "text-muted-foreground",
        )}
      >
        {bulkDelete && (
          <TableCell className="relative z-10 w-10 py-3 pr-0 pl-4">
            <RowCheckbox id={bulkDelete.id(row)} label={bulkDelete.label(row)} />
          </TableCell>
        )}
        {columns.map((column, index) => (
          <TableCell
            key={column.header}
            data-col={column.optional ? columnId(column.header) : undefined}
            className={cn(
              "px-4 py-3",
              column.align === "right" && "text-right",
              // Kontrol lain di baris tetap bisa diklik di atas link baris.
              href && index > 0 && "[&_a]:relative [&_a]:z-10 [&_button]:relative [&_button]:z-10",
              column.className,
              fixedCell,
            )}
          >
            {href && index === 0 ? (
              <Link
                href={href}
                className="outline-none after:absolute after:inset-0 after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset"
              >
                {column.cell(row)}
              </Link>
            ) : (
              column.cell(row)
            )}
          </TableCell>
        ))}
        {optional.length > 0 && <TableCell className="w-10" />}
      </TableRow>
    )
  }

  const table = (
    <div id={id} className="overflow-hidden rounded-lg border bg-card">
      {/* Kolom opsional yang tersembunyi dulu, sebelum pilihan user di browser terbaca. */}
      {optional.some((column) => column.optional === "hide") && (
        <style>
          {optional
            .filter((column) => column.optional === "hide")
            .map((column) => `#${id} [data-col="${columnId(column.header)}"]{display:none}`)
            .join("")}
        </style>
      )}
      <Table className={cn(fixed && "min-w-[600px] table-fixed")}>
        <TableHeader className="bg-muted/60">
          <TableRow className="hover:bg-transparent">
            {bulkDelete && (
              <TableHead className="h-12 w-10 pr-0 pl-4">
                {rows.length > 0 && <SelectAllCheckbox />}
              </TableHead>
            )}
            {columns.map((column) => (
              <TableHead
                key={column.header}
                data-col={column.optional ? columnId(column.header) : undefined}
                className={cn(
                  "h-12 px-4 text-control font-semibold text-foreground",
                  column.align === "right" && "text-right",
                  column.className,
                  fixedCell,
                )}
              >
                {column.header}
              </TableHead>
            ))}
            {optional.length > 0 && (
              <TableHead className="h-12 w-10 px-1 text-right">
                <ColumnMenu
                  tableId={id!}
                  columns={optional.map((column) => ({
                    id: columnId(column.header),
                    label: column.header,
                    hidden: column.optional === "hide",
                  }))}
                />
              </TableHead>
            )}
          </TableRow>
        </TableHeader>
        {rows.length === 0 && empty.minRows ? (
          <TableBody>
            <TableRow className="sr-only">
              <TableCell colSpan={span} role="status">
                {empty.title}
              </TableCell>
            </TableRow>
            {fillerRows}
          </TableBody>
        ) : rows.length === 0 ? (
          <TableBody>
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={span} className="px-3 py-10 text-center whitespace-normal">
                <p className="font-medium">{empty.title}</p>
                {empty.description && (
                  <p className="mt-1 text-control text-muted-foreground">{empty.description}</p>
                )}
                {empty.action && <div className="mt-4 flex justify-center">{empty.action}</div>}
              </TableCell>
            </TableRow>
          </TableBody>
        ) : (
          groups.map((groupRows) => (
            <TableBody
              key={group ? group.key(groupRows[0]) : "semua"}
              className="data-collapsed:[&>tr:not(:first-child)]:hidden"
            >
              {group && (
                <TableRow className="bg-muted/40 hover:bg-muted/60">
                  <TableCell colSpan={span} className="px-4 py-2.5">
                    <GroupToggle label={group.label(groupRows[0])} count={groupRows.length} />
                  </TableCell>
                </TableRow>
              )}
              {groupRows.map(renderRow)}
            </TableBody>
          ))
        )}
        {rows.length > 0 && fillers > 0 && <TableBody className="border-t">{fillerRows}</TableBody>}
      </Table>
    </div>
  )

  if (!bulkDelete) return table
  return (
    <RowSelection
      rows={rows.map((row) => ({ id: bulkDelete.id(row), label: bulkDelete.label(row) }))}
      action={bulkDelete.action}
      noun={bulkDelete.noun}
    >
      {table}
    </RowSelection>
  )
}
