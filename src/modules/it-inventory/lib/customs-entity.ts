import { CUSTOMS_DOC_CODE_LABELS, type CustomsDocCode } from "./customs"

// Pilihan dari devtask Velt-inc: entitas hanya menentukan jenis dokumen yang boleh dibuat.
// Data entitas di dalam dokumen tetap mengikuti form dan aturan masing-masing jenis.
export const CUSTOMS_ENTITY_DOCUMENTS = {
  Importir: ["20"],
  Eksportir: ["30"],
  PPJK: ["16", "20", "23", "28", "30", "33"],
  PLB: ["16", "261", "262", "27", "331", "40", "41"],
  "Importir PLB": ["28"],
  "Eksportir PLB": ["33"],
} as const satisfies Record<string, readonly CustomsDocCode[]>

export type CustomsEntity = keyof typeof CUSTOMS_ENTITY_DOCUMENTS

export const CUSTOMS_ENTITY_CHOICES = Object.entries(CUSTOMS_ENTITY_DOCUMENTS).map(
  ([name, codes]) => ({
    name: name as CustomsEntity,
    documents: codes.map((code) => ({
      code,
      title: CUSTOMS_DOC_CODE_LABELS[code],
      // Jangan impor seluruh form/spec (termasuk layout ratusan KB) ke dialog klien.
      path: `/dokumen-bc/${code === "331" ? "p3bet" : `bc${code}`}`,
    })),
  }),
)
