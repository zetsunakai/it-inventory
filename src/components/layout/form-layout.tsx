import type { ReactNode } from "react"

import { DiscardButton } from "./record-modes"

// Template form standar ala hmx-002 (UF-03 urutan field, UF-04 ukuran; ukuran ada di globals.css):
//   <form className={FORM_CLASS}>           halaman: satu lebar, kartu berjarak 16px
//     <FormActions danger={…}>              baris aksi di ATAS: Simpan dulu, aksi sekunder, Buang
//       Simpan… <p role="status" />          (otomatis dari RecordModes); aksi berbahaya di kanan
//     </FormActions>
//     <FormErrors />
//     <FormSection title="...">             kartu: judul + garis, isi grid 12 kolom
//       <FormField span={6|12|...} />       field: label 20px, kontrol 40px selebar kolom
//       <FormColumns>                       dua kolom tetap: kiri siapa/di mana, kanan
//         <FormColumn>…</FormColumn>        kapan/rujukan
//       </FormColumns>
//     </FormSection>
//   </form>
// Jangan menulis grid, lebar kolom, atau max-w-* sendiri di form; tambahkan span di sini bila kurang.

export const FORM_CLASS = "form-page"

export function FormActions({
  children,
  danger,
}: {
  children: ReactNode
  // Aksi berbahaya (Hapus, Batalkan), dipisah di kanan baris aksi.
  danger?: ReactNode
}) {
  return (
    <div className="form-actions">
      {children}
      <DiscardButton />
      {danger && <div className="ml-auto flex flex-wrap gap-2">{danger}</div>}
    </div>
  )
}

// Dua kolom dengan isi tetap per kolom (bukan mengalir per baris): kiri siapa/di mana, kanan
// kapan/rujukan. Di HP kolom kiri dulu, lalu kanan. Mengisi satu baris penuh kartu.
export function FormColumns({ children }: { children: ReactNode }) {
  return <div className="grid items-start gap-x-6 gap-y-4 md:grid-cols-2">{children}</div>
}

export function FormColumn({ children }: { children: ReactNode }) {
  return <div className="flex min-w-0 flex-col gap-4">{children}</div>
}
