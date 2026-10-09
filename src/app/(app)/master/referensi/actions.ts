"use server"

import { and, eq, sql } from "drizzle-orm"
import { z } from "zod"

import { checkbox, requiredText } from "@/lib/form-fields"
import { REF_CODE_PARENT_TYPES, REF_CODE_TYPE_LABELS, REF_CODE_TYPES } from "@/lib/ref-codes"
import { AppError, defineFormAction } from "@/server/actions/define-action"
import type { Transaction } from "@/server/db/audit"
import { refCodes } from "@/server/db/schema"

// Tambah dan ubah referensi kepabeanan. Hanya Administrator (izin ref:write, PRD bagian 5.2).
// Jenis dan kode tidak bisa diubah setelah dibuat, karena dipakai sebagai acuan oleh data lain.
// Referensi tidak dihapus; yang tidak dipakai lagi diarsipkan.

export const createRefCode = defineFormAction({
  name: "createRefCode",
  permission: "ref:write",
  schema: z
    .object({
      type: z.enum(REF_CODE_TYPES, "Jenis referensi wajib dipilih."),
      code: requiredText("Kode", 50),
      name: requiredText("Nama", 200),
      parentCode: z.string().trim().optional(),
    })
    .superRefine((input, ctx) => {
      const parentType = REF_CODE_PARENT_TYPES[input.type]
      if (parentType && !input.parentCode) {
        ctx.addIssue({
          code: "custom",
          path: ["parentCode"],
          message: `${REF_CODE_TYPE_LABELS[parentType]} wajib dipilih untuk ${REF_CODE_TYPE_LABELS[input.type]}.`,
        })
      }
    }),
  successMessage: "Referensi ditambahkan.",
  handler: async ({ input, tx }) => {
    const parentType = REF_CODE_PARENT_TYPES[input.type]
    const parentCode = parentType ? input.parentCode! : null
    const errors: string[] = []

    if (parentType && !(await exists(tx, parentType, parentCode!, null))) {
      errors.push(`${REF_CODE_TYPE_LABELS[parentType]} dengan kode ${parentCode} tidak ditemukan.`)
    }
    if (await exists(tx, input.type, input.code, parentCode)) {
      errors.push(
        `Kode ${input.code} sudah ada di ${REF_CODE_TYPE_LABELS[input.type]}` +
          (parentType ? ` untuk ${REF_CODE_TYPE_LABELS[parentType]} ${parentCode}.` : "."),
      )
    }
    if (errors.length) throw new AppError(errors)

    const [row] = await tx
      .insert(refCodes)
      .values({ type: input.type, code: input.code, name: input.name, parentCode })
      .returning({ id: refCodes.id, type: refCodes.type, code: refCodes.code })
    return row
  },
})

export const updateRefCode = defineFormAction({
  name: "updateRefCode",
  permission: "ref:write",
  schema: z.object({
    id: z.uuid("Referensi tidak valid."),
    name: requiredText("Nama", 200),
    // Checkbox hanya terkirim saat dicentang.
    active: checkbox,
  }),
  successMessage: "Perubahan disimpan.",
  handler: async ({ input, tx }) => {
    const [row] = await tx
      .update(refCodes)
      .set({ name: input.name, active: input.active })
      .where(eq(refCodes.id, input.id))
      .returning({ id: refCodes.id })
    if (!row) throw new AppError("Referensi tidak ditemukan.")
  },
})

async function exists(
  tx: Transaction,
  type: (typeof REF_CODE_TYPES)[number],
  code: string,
  parentCode: string | null,
) {
  const [row] = await tx
    .select({ id: refCodes.id })
    .from(refCodes)
    .where(
      and(
        eq(refCodes.type, type),
        eq(refCodes.code, code),
        parentCode === null
          ? sql`${refCodes.parentCode} is null`
          : eq(refCodes.parentCode, parentCode),
      ),
    )
  return Boolean(row)
}
