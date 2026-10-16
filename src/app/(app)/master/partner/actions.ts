"use server"

import { and, eq, ne } from "drizzle-orm"
import { z } from "zod"

import { checkbox } from "@/lib/form-fields"
import { partnerFieldsSchema, type PartnerFields } from "@/modules/inventory/lib/partner"
import { AppError, defineAction, defineFormAction } from "@/server/actions/define-action"
import type { Transaction } from "@/server/db/audit"
import { deleteUnlessUsed } from "@/server/db/delete-record"
import { refCodeIsUsable } from "@/server/db/ref-code-checks"
import { partners } from "@/server/db/schema"
import { importFileSchema, readImportFile } from "@/server/master-io/common"
import {
  importPartnerRows,
  PARTNER_COLUMNS,
  RETIRED_PARTNER_COLUMNS,
} from "@/modules/inventory/server/master-io/partners"

// Partner (PRD bagian 5.1): hanya Administrator (izin master:write). Kode partner dibuat database
// dan tidak ditampilkan (RM-03). NITKU NPWP dihitung otomatis bila dikosongkan.

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
      .select({ name: partners.name })
      .from(partners)
      .where(and(eq(partners.nitku, input.nitku), saved ? ne(partners.id, saved.id) : undefined))
    if (other) errors.push(`NITKU ${input.nitku} sudah dipakai partner ${other.name}.`)
  }
  return errors
}

export const createPartner = defineFormAction({
  name: "createPartner",
  permission: "master:write",
  schema: partnerFieldsSchema,
  successMessage: "Partner ditambahkan.",
  handler: async ({ input, tx }) => {
    const errors = await partnerErrors(tx, input)
    if (errors.length) throw new AppError(errors)

    const [row] = await tx.insert(partners).values(input).returning({ id: partners.id })
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
      .select({ id: partners.id, countryCode: partners.countryCode })
      .from(partners)
      .where(eq(partners.id, id))
    if (!saved) throw new AppError("Partner tidak ditemukan.")
    const errors = await partnerErrors(tx, values, saved)
    if (errors.length) throw new AppError(errors)

    await tx.update(partners).set(values).where(eq(partners.id, id))
    return { id }
  },
})

// Import partner dari Excel/CSV (backlog M1-07), dengan aturan yang sama seperti importProducts.
export const importPartners = defineFormAction({
  name: "importPartners",
  permission: "master:write",
  schema: importFileSchema,
  handler: async ({ input, tx }) =>
    importPartnerRows(
      tx,
      await readImportFile(input.file, PARTNER_COLUMNS, "identityNumber", RETIRED_PARTNER_COLUMNS),
    ),
})

// Hapus partner (backlog M1-08): hanya partner yang belum dipakai, sama seperti deleteProduct.
export const deletePartner = defineAction({
  name: "deletePartner",
  permission: "master:write",
  schema: z.object({ id: z.uuid("Partner tidak valid.") }),
  successMessage: "Partner dihapus.",
  handler: ({ input, tx }) => deleteUnlessUsed(tx, partners, partners.id, input.id, "Partner"),
})
