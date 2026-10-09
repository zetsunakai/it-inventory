"use server"

import { and, eq, ne } from "drizzle-orm"
import { z } from "zod"

import { checkbox, requiredText } from "@/lib/form-fields"
import { partnerFieldsSchema, type PartnerFields } from "@/lib/partner"
import { AppError, defineFormAction } from "@/server/actions/define-action"
import type { Transaction } from "@/server/db/audit"
import { refCodeIsUsable } from "@/server/db/ref-code-checks"
import { partners } from "@/server/db/schema"

// Partner (PRD bagian 5.1): hanya Administrator (izin master:write). Kode partner tidak bisa
// diubah (trigger partners_guard). NITKU NPWP dihitung otomatis bila dikosongkan.

async function partnerErrors(
  tx: Transaction,
  input: PartnerFields,
  saved?: { id: string; countryCode: string },
) {
  const errors: string[] = []
  if (!(await refCodeIsUsable(tx, "country", input.countryCode, saved?.countryCode))) {
    errors.push(`Negara dengan kode ${input.countryCode} tidak ditemukan.`)
  }
  if (input.nitku) {
    const [other] = await tx
      .select({ code: partners.code })
      .from(partners)
      .where(and(eq(partners.nitku, input.nitku), saved ? ne(partners.id, saved.id) : undefined))
    if (other) errors.push(`NITKU ${input.nitku} sudah dipakai partner ${other.code}.`)
  }
  return errors
}

export const createPartner = defineFormAction({
  name: "createPartner",
  permission: "master:write",
  schema: z.object({ code: requiredText("Kode partner", 30) }).and(partnerFieldsSchema),
  successMessage: "Partner ditambahkan.",
  handler: async ({ input, tx }) => {
    const errors = await partnerErrors(tx, input)
    const [existing] = await tx
      .select({ id: partners.id })
      .from(partners)
      .where(eq(partners.code, input.code))
    if (existing) errors.unshift(`Kode partner ${input.code} sudah dipakai.`)
    if (errors.length) throw new AppError(errors)

    const [row] = await tx
      .insert(partners)
      .values(input)
      .returning({ id: partners.id, code: partners.code })
    return row
  },
})

export const updatePartner = defineFormAction({
  name: "updatePartner",
  permission: "master:write",
  schema: z
    .object({ id: z.uuid("Partner tidak valid."), active: checkbox })
    .and(partnerFieldsSchema),
  successMessage: "Perubahan disimpan.",
  handler: async ({ input: { id, ...values }, tx }) => {
    const [saved] = await tx
      .select({ id: partners.id, code: partners.code, countryCode: partners.countryCode })
      .from(partners)
      .where(eq(partners.id, id))
    if (!saved) throw new AppError("Partner tidak ditemukan.")
    const errors = await partnerErrors(tx, values, saved)
    if (errors.length) throw new AppError(errors)

    await tx.update(partners).set(values).where(eq(partners.id, id))
    return { id, code: saved.code }
  },
})
