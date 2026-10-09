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

export type DataTableColumn<Row> = {
  header: string
  cell: (row: Row) => ReactNode
  // Angka dan aksi rata kanan; teks rata kiri.
  align?: "left" | "right"
  className?: string
}

export type DataTableEmpty = {
  title: string
  description?: string
  action?: ReactNode
}

// Tabel untuk halaman daftar (skill ui-it-inventory): padat, angka rata kanan, dan seluruh baris
// bisa diklik ke detail lewat rowHref. Data sudah dicari, difilter, dan dipotong per halaman
// di server; komponen ini hanya menampilkan.
export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  rowHref,
  rowMuted,
  empty = { title: "Tidak ada data." },
}: {
  columns: DataTableColumn<Row>[]
  rows: Row[]
  rowKey: (row: Row) => string
  // Tautan detail; kolom pertama menjadi link yang menutupi seluruh baris.
  rowHref?: (row: Row) => string
  // Baris yang diredupkan, misalnya data yang diarsipkan.
  rowMuted?: (row: Row) => boolean
  empty?: DataTableEmpty
}) {
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <Table>
        <TableHeader className="bg-muted/60">
          <TableRow className="hover:bg-transparent">
            {columns.map((column) => (
              <TableHead
                key={column.header}
                className={cn(
                  "h-9 px-3 text-xs font-medium text-muted-foreground",
                  column.align === "right" && "text-right",
                  column.className,
                )}
              >
                {column.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell
                colSpan={columns.length}
                className="px-3 py-10 text-center whitespace-normal"
              >
                <p className="font-medium">{empty.title}</p>
                {empty.description && (
                  <p className="mt-1 text-sm text-muted-foreground">{empty.description}</p>
                )}
                {empty.action && <div className="mt-4 flex justify-center">{empty.action}</div>}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => {
              const href = rowHref?.(row)
              return (
                <TableRow
                  key={rowKey(row)}
                  className={cn(
                    href && "relative cursor-pointer",
                    rowMuted?.(row) && "text-muted-foreground",
                  )}
                >
                  {columns.map((column, index) => (
                    <TableCell
                      key={column.header}
                      className={cn(
                        "px-3 py-1.5",
                        column.align === "right" && "text-right",
                        // Kontrol lain di baris tetap bisa diklik di atas link baris.
                        href &&
                          index > 0 &&
                          "[&_a]:relative [&_a]:z-10 [&_button]:relative [&_button]:z-10",
                        column.className,
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
                </TableRow>
              )
            })
          )}
        </TableBody>
      </Table>
    </div>
  )
}
