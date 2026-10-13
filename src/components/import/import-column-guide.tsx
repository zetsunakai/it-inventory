import { DataTable, type DataTableColumn } from "@/components/data-table/data-table"
import type { ImportColumn } from "@/lib/import"

const REQUIRED_LABEL = { always: "Wajib", new: "Wajib untuk data baru" } as const

const COLUMNS: DataTableColumn<ImportColumn>[] = [
  {
    header: "Kolom",
    cell: (column) => (
      <span className="flex flex-col">
        <span className="font-medium text-foreground">{column.header}</span>
        {column.required && (
          <span className="text-xs text-muted-foreground">{REQUIRED_LABEL[column.required]}</span>
        )}
      </span>
    ),
  },
  { header: "Isi", cell: (column) => column.description, className: "w-full whitespace-normal" },
]

// Daftar kolom yang dikenali file import, sama urutannya dengan file export.
export function ImportColumnGuide({ columns }: { columns: readonly ImportColumn[] }) {
  return (
    <section className="space-y-3" aria-labelledby="import-columns">
      <div>
        <h2 id="import-columns" className="text-base font-semibold">
          Kolom file
        </h2>
        <p className="text-sm text-muted-foreground">
          Judul kolom ada di baris pertama. Kolom yang tidak ada di file tidak mengubah data yang
          sudah tersimpan, jadi file boleh hanya berisi kolom kode dan kolom yang ingin diubah.
        </p>
      </div>
      <DataTable columns={COLUMNS} rows={[...columns]} rowKey={(column) => column.key} />
    </section>
  )
}
