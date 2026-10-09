// Bentuk hasil setiap server action yang dibuat lewat defineAction / defineFormAction.
// Dipakai bersama oleh server dan form di client.
export type ActionResult<T = undefined> =
  | { ok: true; data: T; message?: string }
  | {
      ok: false
      // Semua alasan kegagalan sekaligus, siap ditampilkan (PRD bagian 7.6 dan 8.4).
      errors: string[]
      // Kesalahan per field form, bila berasal dari validasi input.
      fieldErrors?: Record<string, string[]>
      // Isi form yang dikirim (hanya dari defineFormAction). React me-reset form setelah
      // action selesai, jadi form memakai nilai ini sebagai default agar ketikan user tidak hilang.
      values?: Record<string, string>
    }

// State awal untuk useActionState.
export type FormState<T = undefined> = ActionResult<T> | null

// Nilai awal sebuah field: ketikan terakhir user bila action gagal, selain itu nilai tersimpan.
export function fieldValue<T>(state: FormState<T>, name: string, saved?: string | null) {
  if (state?.ok === false && state.values && name in state.values) return state.values[name]
  return saved ?? undefined
}
