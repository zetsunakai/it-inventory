import "server-only"

import { DrizzleQueryError } from "drizzle-orm/errors"
import { refresh } from "next/cache"
import { unstable_rethrow } from "next/navigation"
import { z } from "zod"

import type { ActionResult, FormState } from "@/lib/action-result"
import { hasPermission, type Permission } from "@/lib/permissions"
import { withAuditUser, type Transaction } from "@/server/db/audit"
import { requireUser, type CurrentUser } from "@/server/auth/session"

// Pola standar untuk SEMUA perubahan data (backlog M0-08):
//   1. user wajib login (dan MFA bila perannya mengharuskan)
//   2. cek izin peran
//   3. validasi input dengan Zod, semua kesalahan dikembalikan sekaligus
//   4. jalankan handler di dalam satu transaksi database
//   5. pelaku dicatat di audit log lewat app.user_id
//   6. error bisnis dan error database diterjemahkan jadi pesan untuk user
//   7. UI di-refresh setelah berhasil

type HandlerContext<Input> = {
  input: Input
  user: CurrentUser
  tx: Transaction
}

type ActionDefinition<Schema extends z.ZodType, Output> = {
  // Nama untuk log server bila terjadi error tak terduga.
  name: string
  permission: Permission
  schema: Schema
  handler: (ctx: HandlerContext<z.infer<Schema>>) => Promise<Output>
  // Pesan sukses opsional untuk ditampilkan di UI.
  successMessage?: string
}

// Kesalahan bisnis yang aman ditampilkan ke user, misalnya
// throw new AppError("Stok tidak cukup untuk produk X.")
export class AppError extends Error {
  readonly errors: string[]
  constructor(errors: string | string[]) {
    const list = Array.isArray(errors) ? errors : [errors]
    super(list.join("\n"))
    this.name = "AppError"
    this.errors = list
  }
}

async function execute<Schema extends z.ZodType, Output>(
  definition: ActionDefinition<Schema, Output>,
  rawInput: unknown,
): Promise<ActionResult<Output>> {
  const user = await requireUser()
  if (!hasPermission(user.roles, definition.permission)) {
    return { ok: false, errors: ["Anda tidak punya izin untuk melakukan aksi ini."] }
  }

  const parsed = definition.schema.safeParse(rawInput)
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((issue) => issue.message),
      fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]>,
    }
  }

  try {
    const data = await withAuditUser(user.id, (tx) =>
      definition.handler({ input: parsed.data, user, tx }),
    )
    refresh()
    return { ok: true, data, message: definition.successMessage }
  } catch (error) {
    // redirect(), notFound(), forbidden() dari handler harus diteruskan ke Next.js.
    unstable_rethrow(error)
    if (error instanceof AppError) return { ok: false, errors: error.errors }
    const databaseErrors = mapDatabaseError(error)
    if (databaseErrors) return { ok: false, errors: databaseErrors }

    console.error(`[action:${definition.name}]`, error)
    return {
      ok: false,
      errors: ["Terjadi kesalahan sistem. Coba lagi atau hubungi Administrator."],
    }
  }
}

// Aksi yang dipanggil langsung dari kode: await updateX({ ... })
export function defineAction<Schema extends z.ZodType, Output>(
  definition: ActionDefinition<Schema, Output>,
) {
  return async (input: z.input<Schema>): Promise<ActionResult<Output>> => execute(definition, input)
}

// Aksi untuk <form action> + useActionState. Field form dibaca sebagai object
// sehingga schema bisa memakai z.coerce untuk angka dan tanggal.
export function defineFormAction<Schema extends z.ZodType, Output>(
  definition: ActionDefinition<Schema, Output>,
) {
  return async (_prev: FormState<Output>, formData: FormData): Promise<ActionResult<Output>> => {
    const values = formValues(formData)
    const result = await execute(definition, values)
    return result.ok ? result : { ...result, values }
  }
}

// Field teks dari form. File diabaikan; field berawalan $ adalah milik React/Next.
function formValues(formData: FormData) {
  const values: Record<string, string> = {}
  for (const [name, value] of formData) {
    if (typeof value === "string" && !name.startsWith("$")) values[name] = value
  }
  return values
}

// Fungsi database (gerbang validasi, dll.) melapor kesalahan bisnis dengan
// RAISE EXCEPTION. Satu alasan per baris pesan, supaya bisa ditampilkan sekaligus.
type PostgresError = { code?: string; message?: string }

function mapDatabaseError(error: unknown): string[] | null {
  const cause = error instanceof DrizzleQueryError ? error.cause : error
  if (!cause || typeof cause !== "object" || !("code" in cause)) return null
  const pgError = cause as PostgresError

  switch (pgError.code) {
    case "P0001": // raise_exception dari fungsi kita sendiri
      return (pgError.message ?? "").split("\n").filter(Boolean)
    case "23505":
      return ["Data dengan nilai yang sama sudah ada."]
    case "23503":
      return ["Data ini masih dipakai oleh data lain, atau data yang dirujuk tidak ditemukan."]
    case "23514":
      return ["Data tidak memenuhi aturan validasi di database."]
    default:
      return null
  }
}
