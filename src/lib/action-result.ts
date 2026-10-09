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
    }

// State awal untuk useActionState.
export type FormState<T = undefined> = ActionResult<T> | null
