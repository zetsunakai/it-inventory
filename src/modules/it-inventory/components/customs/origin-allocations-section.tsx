import { Section } from "@/components/layout/section"
import { CUSTOMS_DOC_CODE_LABELS, type CustomsDocCode } from "@/modules/it-inventory/lib/customs"
import { getDocumentAllocations } from "@/modules/it-inventory/server/queries/customs-transfers"

import { OriginAllocationEditor } from "./origin-allocation-editor"

// Alokasi dokumen asal dokumen keluar (backlog M4-05, PRD 8.5): satu editor per baris barang.
export async function OriginAllocationsSection({
  documentId,
  origins,
  editable,
}: {
  documentId: string
  // Jenis dokumen asal yang boleh, mis. BC 2.3 dan 4.0.
  origins: readonly CustomsDocCode[]
  editable: boolean
}) {
  const lines = await getDocumentAllocations(documentId)
  return (
    <Section
      title="Alokasi dokumen asal"
      description={`Setiap barang keluar diambil dari saldo ${origins
        .map((code) => CUSTOMS_DOC_CODE_LABELS[code])
        .join(" atau ")} yang Terdaftar. Alokasi lengkap wajib sebelum dokumen bisa diajukan.`}
    >
      {lines.length === 0 ? (
        <p className="text-control text-muted-foreground">
          Simpan barang dokumen dulu, lalu alokasikan dokumen asalnya di sini.
        </p>
      ) : (
        <div className="space-y-3">
          {lines.map((line) => (
            <OriginAllocationEditor key={line.lineId} line={line} editable={editable} />
          ))}
        </div>
      )}
    </Section>
  )
}
