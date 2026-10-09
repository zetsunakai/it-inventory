import { z } from "zod"

import { requiredText } from "./form-fields"
import { digitsOnly, headOfficeNitku, npwp16, npwpIdentityType } from "./npwp"

// Profil perusahaan (PRD bagian 5.1). Dipakai bersama oleh form dan server.

export const FACILITY_TYPES = ["kawasan_berikat", "plb", "kite"] as const
export type FacilityType = (typeof FACILITY_TYPES)[number]

export const FACILITY_TYPE_LABELS: Record<FacilityType, string> = {
  kawasan_berikat: "Kawasan Berikat (KB)",
  plb: "Pusat Logistik Berikat (PLB)",
  kite: "Kemudahan Impor Tujuan Ekspor (KITE)",
}

// Input dari form. NPWP, NITKU, dan NIB boleh ditulis dengan titik/strip/spasi;
// yang disimpan hanya angkanya. NITKU kosong = kantor pusat (NPWP 16 digit + 000000).
export const companyProfileSchema = z
  .object({
    name: requiredText("Nama perusahaan", 200),
    address: requiredText("Alamat", 500),
    npwp: z
      .string()
      .transform(digitsOnly)
      .refine((value) => npwp16(value) !== null, "NPWP harus 15 atau 16 digit."),
    nitku: z.string().transform(digitsOnly),
    nib: z
      .string()
      .transform(digitsOnly)
      .refine((value) => value.length === 13, "NIB harus 13 digit."),
    facilityType: z.enum(FACILITY_TYPES, "Jenis fasilitas wajib dipilih."),
    permitNumber: requiredText("Nomor izin fasilitas", 100),
    permitDate: z.iso.date("Tanggal izin fasilitas wajib diisi."),
    supervisingOfficeCode: z.string().trim().min(1, "Kantor pabean pengawas wajib dipilih."),
  })
  .transform((input) => ({
    ...input,
    npwp: npwp16(input.npwp) ?? input.npwp,
    nitku: input.nitku || (headOfficeNitku(input.npwp) ?? ""),
  }))
  .superRefine((input, ctx) => {
    if (input.nitku.length !== 22) {
      ctx.addIssue({ code: "custom", path: ["nitku"], message: "NITKU harus 22 digit." })
    } else if (!input.nitku.startsWith(input.npwp)) {
      ctx.addIssue({
        code: "custom",
        path: ["nitku"],
        message: "NITKU harus diawali NPWP 16 digit perusahaan.",
      })
    }
  })

export type CompanyProfileInput = z.output<typeof companyProfileSchema>

export type CompanyProfile = CompanyProfileInput & { updatedAt: Date }

// Data perusahaan sebagai entitas Pengusaha TPB / Pemilik barang di dokumen BC (PRD bagian 7.2).
// Nomor identitas memakai NITKU, sesuai aturan CEISA untuk jenis identitas NPWP 15/16 digit.
export type CustomsParty = {
  name: string
  address: string
  identityType: "5" | "6"
  identityNumber: string
  nib: string
  permitNumber: string
  permitDate: string
}

export function companyAsCustomsParty(profile: CompanyProfileInput): CustomsParty {
  return {
    name: profile.name,
    address: profile.address,
    // NPWP disimpan 16 digit, jadi selalu jenis 6.
    identityType: npwpIdentityType(profile.npwp) ?? "6",
    identityNumber: profile.nitku,
    nib: profile.nib,
    permitNumber: profile.permitNumber,
    permitDate: profile.permitDate,
  }
}
