"use server"

import { and, eq, isNull } from "drizzle-orm"

import { companyProfileSchema } from "@/lib/company"
import { AppError, defineFormAction } from "@/server/actions/define-action"
import { company, refCodes } from "@/server/db/schema"

// Simpan profil perusahaan (PRD bagian 5.1). Hanya Administrator (izin master:write).
// Baris pertama dibuat, berikutnya selalu memperbarui baris yang sama.
export const saveCompanyProfile = defineFormAction({
  name: "saveCompanyProfile",
  permission: "master:write",
  schema: companyProfileSchema,
  successMessage: "Profil perusahaan disimpan.",
  handler: async ({ input, tx }) => {
    const [office] = await tx
      .select({ active: refCodes.active })
      .from(refCodes)
      .where(
        and(
          eq(refCodes.type, "customs_office"),
          eq(refCodes.code, input.supervisingOfficeCode),
          isNull(refCodes.parentCode),
        ),
      )
    const [current] = await tx.select({ officeCode: company.supervisingOfficeCode }).from(company)
    // Kantor yang diarsipkan tidak boleh dipilih, kecuali memang sudah tersimpan sebelumnya.
    const officeUnchanged = current?.officeCode === input.supervisingOfficeCode
    if (!office || (!office.active && !officeUnchanged)) {
      throw new AppError(
        `Kantor pabean dengan kode ${input.supervisingOfficeCode} tidak ditemukan.`,
      )
    }

    const values = { ...input, id: true }
    await tx.insert(company).values(values).onConflictDoUpdate({ target: company.id, set: values })
  },
})
