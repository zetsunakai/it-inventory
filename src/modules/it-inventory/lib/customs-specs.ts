import type { CustomsDocCode } from "./customs"
import type { CustomsField, CustomsFormSpec, CustomsLayout, CustomsListBlock } from "./customs-form"
import { CUSTOMS_LAYOUTS } from "./customs-layouts.generated"

// Form per jenis dokumen BC (backlog M3-05–M3-09, D-01–D-08, D-09): tab, grup, field, dan label
// dari form hmx core_it_inventory (customs-layouts.generated.ts); di sini hanya judul, deskripsi,
// dan path menunya.

const spec = (
  code: CustomsDocCode,
  title: string,
  description: string,
  path: string,
): CustomsFormSpec => {
  const layout = CUSTOMS_LAYOUTS[code] as CustomsLayout

  // Equip3's P3BET line form does not bind product_id, but the IT Inventory line
  // contract requires productId. Make product selection explicit in this BC's
  // add/edit wizard instead of relying on a transfer to fill it implicitly.
  const importedLine =
    code === "331"
      ? {
          ...layout.line,
          blocks: layout.line.blocks.map((block, index) =>
            index === 0 && "fields" in block && Array.isArray(block.fields)
              ? {
                  ...block,
                  fields: [
                    {
                      key: "product",
                      label: "Produk",
                      kind: "product" as const,
                      required: true,
                      span: 12 as const,
                    },
                    ...block.fields,
                  ],
                }
              : block,
          ),
        }
      : layout.line
  const line =
    code === "28"
      ? {
          ...importedLine,
          blocks: [
            ...importedLine.blocks,
            {
              title: "Voluntary Declaration",
              list: "vdEntries",
              columns: [
                {
                  key: "valuationTypeCode",
                  label: "Jenis Nilai VD",
                  kind: "option",
                  list: "valuationType",
                },
                { key: "dueDate", label: "Tanggal Jatuh Tempo", kind: "date" },
                { key: "amount", label: "Nilai VD", kind: "money" },
              ],
            } satisfies CustomsListBlock,
          ],
        }
      : importedLine

  // Equip3 O2M catalog gaps (PRD 24 Oct 2026): these values are scalar line
  // bindings in the source forms but were absent from the imported HMX fieldset.
  const equip3Fields: Partial<Record<CustomsDocCode, CustomsField[]>> = {
    "33": [
      {
        key: "productCategoryCode",
        store: "lineDetails",
        label: "Kategori Barang",
        kind: "option",
        list: "productCategory",
      },
      { key: "volume", store: "lineDetails", label: "Volume", kind: "qty" },
    ],
    "331": [
      {
        key: "originCountryCode",
        store: "line",
        label: "Negara Asal Barang",
        kind: "ref",
        refType: "country",
      },
    ],
    "20": [{ key: "unitPrice", store: "line", label: "Harga Satuan", kind: "qty" }],
    "261": [
      { key: "fobValue", store: "line", label: "Harga FOB", kind: "money" },
      { key: "volume", store: "lineDetails", label: "Volume", kind: "qty" },
      { key: "unitPrice", store: "line", label: "Harga Satuan FOB", kind: "qty" },
    ],
    "262": [
      { key: "fobValue", store: "line", label: "Harga FOB", kind: "money" },
      { key: "volume", store: "lineDetails", label: "Volume", kind: "qty" },
      { key: "unitPrice", store: "line", label: "Harga Satuan FOB", kind: "qty" },
    ],
    "28": [
      {
        key: "specification",
        store: "line",
        label: "Spesifikasi Lain",
        kind: "text",
        long: true,
      },
      { key: "netWeight", store: "line", label: "Berat Bersih (Kg)", kind: "qty" },
    ],
  }
  const additions = equip3Fields[code] ?? []
  const completedLine =
    additions.length === 0
      ? line
      : {
          ...line,
          blocks: line.blocks.map((block, index) =>
            index === line.blocks.length - 1 && "fields" in block
              ? { ...block, fields: [...block.fields, ...additions] }
              : block,
          ),
        }
  let volumeSeen = false
  const normalizedLine =
    code === "27"
      ? {
          ...completedLine,
          blocks: completedLine.blocks.map((block) => {
            if (!("fields" in block)) return block
            return {
              ...block,
              fields: block.fields.filter((item) => {
                if ("group" in item || item.key !== "volume") return true
                if (volumeSeen) return false
                volumeSeen = true
                item.label = "Volume (m³)"
                return true
              }),
            }
          }),
        }
      : completedLine

  return { code, title, description, path, ...layout, line: normalizedLine }
}

export const BC23 = spec(
  "23",
  "BC 2.3",
  "Impor barang dari luar negeri untuk ditimbun di kawasan berikat.",
  "/dokumen-bc/bc23",
)
export const BC40 = spec(
  "40",
  "BC 4.0",
  "Pemasukan barang dari pemasok dalam negeri (TLDDP) ke kawasan berikat.",
  "/dokumen-bc/bc40",
)
export const BC25 = spec(
  "25",
  "BC 2.5",
  "Pengeluaran barang dari kawasan berikat ke pembeli dalam negeri (TLDDP).",
  "/dokumen-bc/bc25",
)
export const BC41 = spec(
  "41",
  "BC 4.1",
  "Pengeluaran kembali barang asal dalam negeri dari kawasan berikat.",
  "/dokumen-bc/bc41",
)
export const BC30 = spec(
  "30",
  "BC 3.0",
  "Ekspor barang dari kawasan berikat ke luar negeri (PEB).",
  "/dokumen-bc/bc30",
)
export const BC20 = spec(
  "20",
  "BC 2.0",
  "Impor barang dari luar negeri untuk dipakai (PIB).",
  "/dokumen-bc/bc20",
)
export const BC261 = spec(
  "261",
  "BC 2.6.1",
  "Pengeluaran sementara barang dari kawasan berikat ke dalam negeri dengan jaminan, mis. untuk diperbaiki atau disubkontrakkan.",
  "/dokumen-bc/bc261",
)
export const BC262 = spec(
  "262",
  "BC 2.6.2",
  "Pemasukan kembali barang yang sebelumnya dikeluarkan sementara dengan BC 2.6.1.",
  "/dokumen-bc/bc262",
)
export const BC27 = spec(
  "27",
  "BC 2.7",
  "Pengiriman barang dari kawasan berikat ke tempat penimbunan berikat lain.",
  "/dokumen-bc/bc27",
)
export const BC16 = spec(
  "16",
  "BC 1.6",
  "Pemasukan barang dari luar negeri untuk ditimbun di pusat logistik berikat (PLB).",
  "/dokumen-bc/bc16",
)
export const BC28 = spec(
  "28",
  "BC 2.8",
  "Pengeluaran barang impor dari pusat logistik berikat untuk dipakai di dalam negeri.",
  "/dokumen-bc/bc28",
)
export const BC33 = spec(
  "33",
  "BC 3.3",
  "Ekspor barang melalui atau dari pusat logistik berikat (PLB).",
  "/dokumen-bc/bc33",
)
export const P3BET = spec(
  "331",
  "P3BET",
  "Pemberitahuan penggabungan dan pemecahan barang ekspor serta transhipment dari pusat logistik berikat.",
  "/dokumen-bc/p3bet",
)

export const CUSTOMS_SPECS: Record<CustomsDocCode, CustomsFormSpec> = {
  "23": BC23,
  "40": BC40,
  "25": BC25,
  "41": BC41,
  "30": BC30,
  "20": BC20,
  "261": BC261,
  "262": BC262,
  "27": BC27,
  "16": BC16,
  "28": BC28,
  "33": BC33,
  "331": P3BET,
}
