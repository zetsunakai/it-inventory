"use server"

import { companyProfileSchema } from "@/lib/company"
import { AppError, defineFormAction } from "@/server/actions/define-action"
import { refCodeIsUsable } from "@/server/db/ref-code-checks"
import { company } from "@/server/db/schema"

// Simpan profil perusahaan (PRD bagian 5.1). Hanya Administrator (izin master:write).
// Baris pertama dibuat, berikutnya selalu memperbarui baris yang sama.
export const saveCompanyProfile = defineFormAction({
  name: "saveCompanyProfile",
  permission: "master:write",
  schema: companyProfileSchema,
  successMessage: "Profil perusahaan disimpan.",
  handler: async ({ input, tx }) => {
    const [current] = await tx.select({ officeCode: company.supervisingOfficeCode }).from(company)
    const officeCode = input.supervisingOfficeCode
    if (!(await refCodeIsUsable(tx, "customs_office", officeCode, current?.officeCode))) {
      throw new AppError(`Kantor pabean dengan kode ${officeCode} tidak ditemukan.`)
    }

    const values = { ...input, id: true }
    await tx.insert(company).values(values).onConflictDoUpdate({ target: company.id, set: values })
  },
})
