import type { ReactNode } from "react"

import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

// Lebar field dalam grid 12 kolom kartu form (.form-grid, UF-04), berlaku mulai 768px; di HP
// semua field selebar kartu. 6 = setengah (bawaan), 12 = penuh (deskripsi, alamat, catatan),
// 3/4/8/9 untuk pasangan field pendek–panjang (kode + nama, nama + kode singkat).
export type FieldSpan = 3 | 4 | 6 | 8 | 9 | 12

// Satu field form: label, kontrol, petunjuk, dan pesan error dari validasi server.
// hint hanya untuk aturan yang tidak tertebak (format NITKU, arti faktor), bukan "boleh dikosongkan".
export function FormField({
  label,
  htmlFor,
  errors,
  hint,
  span = 6,
  required,
  children,
}: {
  label: string
  htmlFor: string
  errors?: string[]
  hint?: string
  span?: FieldSpan
  required?: boolean
  children: ReactNode
}) {
  return (
    <div className="form-field" data-span={span}>
      <Label htmlFor={htmlFor} className="min-h-5 text-control leading-5">
        {label}
        {required && (
          <span className="text-destructive" aria-hidden>
            {" "}
            *
          </span>
        )}
      </Label>
      {children}
      {hint && <p className="text-caption text-muted-foreground">{hint}</p>}
      {errors?.map((message) => (
        <p key={message} className="text-caption font-medium text-destructive">
          {message}
        </p>
      ))}
    </div>
  )
}

// Nilai yang tidak bisa diubah (kode, SKU, satuan stok): tampil sebagai teks beserta alasannya,
// bukan input abu-abu yang di-disable. Tingginya sama dengan kontrol supaya sejajar.
export function StaticField({
  label,
  value,
  reason,
  mono,
  span = 6,
}: {
  label: string
  value: ReactNode
  reason?: string
  mono?: boolean
  span?: FieldSpan
}) {
  return (
    <div className="form-field" data-span={span}>
      <p className="form-field-label">{label}</p>
      <p className={cn("form-field-static", mono && "font-mono")}>{value}</p>
      {reason && <p className="text-caption text-muted-foreground">{reason}</p>}
    </div>
  )
}

// Kartu kelompok field (mis. "Data produk", "Data kepabeanan"): judul + garis pemisah, lalu grid
// 12 kolom. Di dalam notebook (Tabs) bingkainya hilang. Aksi kelompok (mis. Tambah baris) di kanan
// judul.
export function FormSection({
  title,
  description,
  actions,
  children,
}: {
  // Tanpa judul (grup tanpa nama di form dokumen BC hmx) bagian kepala tidak tampil.
  title?: string
  description?: string
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <fieldset className="form-sheet">
      {title && <legend className="sr-only">{title}</legend>}
      {(title || actions) && (
        <div className="form-sheet-header">
          <div aria-hidden className="min-w-0">
            {title && <p className="form-sheet-title">{title}</p>}
            {description && <p className="form-sheet-description">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
      )}
      <div className="form-grid">{children}</div>
    </fieldset>
  )
}

// Kartu mode baca (RecordModes): bingkai dan grid sama dengan FormSection, isinya StaticField
// dengan span yang sama seperti form-nya, supaya letak field tidak bergeser saat pindah ke Edit.
export function ViewSection({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <section className="form-sheet" aria-label={title}>
      <div className="form-sheet-header">
        <div aria-hidden className="min-w-0">
          <p className="form-sheet-title">{title}</p>
          {description && <p className="form-sheet-description">{description}</p>}
        </div>
      </div>
      <div className="form-grid">{children}</div>
    </section>
  )
}
