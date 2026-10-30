import type { CustomsDocCode } from "./customs"
import type {
  CustomsBlock,
  CustomsField,
  CustomsFieldItem,
  CustomsFormSpec,
  CustomsLayout,
  CustomsListBlock,
} from "./customs-form"
import {
  CUSTOMS_FACILITY_DOMAINS,
  CUSTOMS_PRODUCT_CATEGORY_DOMAINS,
  CUSTOMS_TAX_PAYMENT_FIELDS,
} from "./customs-form"
import { CUSTOMS_LAYOUTS } from "./customs-layouts.generated"

export const CUSTOMS_SOURCE_DOC_CODES: Partial<Record<CustomsDocCode, CustomsDocCode[]>> = {
  "28": ["16", "27"],
  "33": ["40", "27"],
  "331": ["16", "33"],
}

// These HMX fields remain in the stored line contract for compatibility, but are not
// part of the Equip3 O2M item editor for these BC types.
const HMX_ONLY_LINE_FIELDS: Partial<Record<CustomsDocCode, ReadonlySet<string>>> = {
  "16": new Set(["customsValue"]),
  "20": new Set(["productCategoryCode", "cifRupiah", "valueAdded", "rawMaterialOriginCode"]),
  "261": new Set(["specification"]),
  "262": new Set(["specification"]),
  "27": new Set(["customsValue", "acquisitionPrice"]),
  "30": new Set([
    "restrictedGoodsDeclarationCode",
    "insuranceValue",
    "specification",
    "invoiceValue",
    "freightValue",
    "customsValue",
    "productConditionCode",
  ]),
  "33": new Set([
    "restrictedGoodsDeclarationCode",
    "insuranceValue",
    "specification",
    "originLocationCode",
    "invoiceValue",
    "freightValue",
    "customsValue",
    "productConditionCode",
    "exportTypeCode",
  ]),
}

const EQUIP3_LINE_FIELD_MOVES: Partial<Record<CustomsDocCode, [string, string][]>> = {
  "16": [["cifValue", "productCategoryCode"]],
  "20": [
    ["unitPrice", "packageTypeCode"],
    ["cifValue", "insuranceValue"],
  ],
  "25": [
    ["productCategoryCode", "productUseCodeCode"],
    ["unitPrice", "netWeight"],
  ],
  "261": [
    ["product", "itemCode"],
    ["fobValue", "packageTypeCode"],
    ["volume", "fobValue"],
    ["netWeight", "volume"],
    ["unitPrice", "netWeight"],
  ],
  "262": [
    ["product", "itemCode"],
    ["fobValue", "packageTypeCode"],
    ["volume", "fobValue"],
    ["netWeight", "volume"],
    ["unitPrice", "netWeight"],
  ],
  "27": [
    ["product", "hsCode"],
    ["itemCode", "product"],
    ["specification", "itemSize"],
    ["productCategoryCode", "netWeight"],
  ],
  "28": [
    ["product", "itemCode"],
    ["specification", "itemSize"],
    ["netWeight", "packageTypeCode"],
    ["originCountryCode", "valueAdded"],
  ],
  "30": [
    ["product", "itemCode"],
    ["itemSize", "itemType"],
    ["unitPrice", "packageTypeCode"],
    ["fobValue", "unitPrice"],
    ["volume", "fobValue"],
    ["netWeight", "volume"],
    ["exportTypeCode", "netWeight"],
  ],
  "33": [
    ["product", "itemCode"],
    ["itemSize", "itemType"],
    ["netWeight", "packageTypeCode"],
    ["productCategoryCode", "netWeight"],
    ["fobValue", "productCategoryCode"],
    ["volume", "fobValue"],
    ["unitPrice", "volume"],
  ],
  "331": [
    ["noAju", "documentTypeCode"],
    ["product", "itemCode"],
    ["originCountryCode", "specification"],
  ],
  "41": [["product", "itemCode"]],
}

const EQUIP3_REQUIRED_LINE_FIELDS: Partial<Record<CustomsDocCode, ReadonlySet<string>>> = {
  "20": new Set([
    "hsCode",
    "description",
    "brand",
    "productConditionCode",
    "originCountryCode",
    "qty",
    "ceisaUnitCode",
    "packageTypeCode",
    "fobValue",
    "freightValue",
    "insuranceValue",
    "cifValue",
  ]),
  "27": new Set(["hsCode", "description", "qty", "ceisaUnitCode", "cifValue"]),
  "41": new Set(["qty", "ceisaUnitCode"]),
}

function moveLineFieldAfter(line: CustomsFormSpec["line"], fieldKey: string, anchorKey: string) {
  const blocks = line.blocks.map((block): CustomsBlock =>
    "fields" in block ? { ...block, fields: [...block.fields] } : block,
  )
  let fieldItem: CustomsField | undefined
  for (const block of blocks) {
    if (!("fields" in block)) continue
    const index = block.fields.findIndex((item) => !("group" in item) && item.key === fieldKey)
    if (index >= 0) {
      fieldItem = block.fields[index] as CustomsField
      block.fields.splice(index, 1)
      break
    }
  }
  if (!fieldItem) return line
  for (const block of blocks) {
    if (!("fields" in block)) continue
    const index = block.fields.findIndex((item) =>
      "group" in item
        ? item.fields.some((field) => field.key === anchorKey)
        : item.key === anchorKey,
    )
    if (index >= 0) {
      block.fields.splice(index + 1, 0, fieldItem)
      return { ...line, blocks }
    }
  }
  return line
}

// Kelengkapan field BC 2.0 dibandingkan ceisa.import.documents Equip3. Tidak menambah
// field wajib, rumus pungutan, atau alur kirim CEISA; hanya memperluas kontrak form yang sama.
function completeBc20Layout(layout: CustomsLayout): CustomsLayout {
  return {
    ...layout,
    parties: [...layout.parties, { code: "4", label: "PPJK", source: "partner" }],
    tabs: layout.tabs.map((tab) => {
      if (tab.key === "entitas")
        return {
          ...tab,
          blocks: [
            ...tab.blocks.map((block): CustomsBlock => {
              if (!("fields" in block) || !block.role || !["1", "7", "11"].includes(block.role))
                return block
              const additions: CustomsField[] = [
                ...(block.role === "1"
                  ? [
                      {
                        key: "nib",
                        label: "NIB importir",
                        store: "party" as const,
                        role: block.role,
                        kind: "text" as const,
                      },
                    ]
                  : []),
                {
                  key: "countryCode",
                  label: `Negara ${block.role === "1" ? "importir" : block.role === "7" ? "pemilik" : "pemusatan"}`,
                  store: "party",
                  role: block.role,
                  kind: "ref",
                  refType: "country",
                },
              ]
              return { ...block, fields: [...block.fields, ...additions] }
            }),
            {
              title: "PPJK",
              role: "4",
              fields: [
                {
                  key: "identityTypeCode",
                  label: "Jenis identitas PPJK",
                  store: "party",
                  role: "4",
                  kind: "option",
                  list: "identityType",
                },
                {
                  key: "identityNumber",
                  label: "Nomor identitas PPJK",
                  store: "party",
                  role: "4",
                  kind: "text",
                },
                { key: "name", label: "Nama PPJK", store: "party", role: "4", kind: "text" },
                { key: "address", label: "Alamat PPJK", store: "party", role: "4", kind: "text" },
                {
                  key: "countryCode",
                  label: "Negara PPJK",
                  store: "party",
                  role: "4",
                  kind: "ref",
                  refType: "country",
                },
              ],
            },
          ],
        }
      if (tab.key === "transaksi")
        return {
          ...tab,
          blocks: [
            ...tab.blocks.map((block): CustomsBlock =>
              "fields" in block
                ? {
                    ...block,
                    fields: block.fields.flatMap<CustomsFieldItem>((field) =>
                      !("group" in field) && field.key === "voluntaryDeclarationValue"
                        ? [
                            {
                              key: "voluntaryDeclarationFlag",
                              label: "Menggunakan Voluntary Declaration",
                              store: "details",
                              kind: "option",
                              list: "voluntaryDeclaration",
                            },
                            field,
                          ]
                        : [field],
                    ),
                  }
                : block,
            ),
            {
              title: "Bank devisa",
              list: "bankAccounts",
              columns: [
                { key: "bankCode", label: "Bank devisa", kind: "option", list: "bankDevisa" },
              ],
            },
          ],
        }
      if (tab.key === "pungutan")
        return {
          ...tab,
          blocks: tab.blocks.map((block): CustomsBlock =>
            "list" in block && block.list === "taxes"
              ? {
                  ...block,
                  columns: [
                    // tax_value Equip3 adalah teks bebas, bukan pilihan jenis atau nominal total.
                    { key: "taxValue", label: "Nilai Pungutan", kind: "text" },
                    ...CUSTOMS_TAX_PAYMENT_FIELDS.map((field): CustomsField => ({
                      ...field,
                      kind: "money",
                    })),
                  ],
                }
              : block,
          ),
        }
      if (tab.key === "pernyataan")
        return {
          ...tab,
          blocks: [
            ...tab.blocks,
            {
              title: "Persetujuan pengiriman",
              fields: [
                {
                  key: "disclaimer",
                  label: "Setuju pengiriman dokumen",
                  store: "details",
                  kind: "option",
                  list: "submissionConsent",
                },
              ],
            },
          ],
        }
      return tab
    }),
  }
}

// Form per jenis dokumen BC (backlog M3-05–M3-09, D-01–D-08, D-09): tab, grup, field, dan label
// dari form hmx core_it_inventory (customs-layouts.generated.ts); di sini hanya judul, deskripsi,
// dan path menunya.

const spec = (
  code: CustomsDocCode,
  title: string,
  description: string,
  path: string,
): CustomsFormSpec => {
  // Tambahan BC 2.0 dari Equip3 berada di lapisan adaptasi, bukan mengedit hasil generator HMX.
  const imported = CUSTOMS_LAYOUTS[code] as CustomsLayout
  const layout = code === "20" ? completeBc20Layout(imported) : imported

  const sourceFields: Partial<Record<CustomsDocCode, CustomsField[]>> = {
    "33": [
      {
        key: "beacukaiOfficeCode",
        store: "lineDetails",
        label: "Kode Kantor Asal",
        kind: "ref",
        refType: "customs_office",
      },
      {
        key: "documentTypeCode",
        store: "lineDetails",
        label: "Dokumen Asal",
        kind: "ref",
        refType: "document_type",
        readOnly: true,
      },
      {
        key: "noAju",
        store: "lineDetails",
        label: "Nomor Pengajuan Asal",
        kind: "text",
        readOnly: true,
      },
      {
        key: "noRegister",
        store: "lineDetails",
        label: "Nomor Daftar Asal",
        kind: "text",
        readOnly: true,
      },
      {
        key: "registerDate",
        store: "lineDetails",
        label: "Tanggal Daftar Asal",
        kind: "date",
        readOnly: true,
      },
      {
        key: "sourceSequence",
        store: "lineDetails",
        label: "Seri Barang Asal",
        kind: "qty",
        readOnly: true,
      },
    ],
  }

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
  const sourcedLine =
    (sourceFields[code]?.length ?? 0) > 0
      ? {
          ...importedLine,
          blocks: importedLine.blocks.map((block, index) =>
            index === 0 && "fields" in block
              ? { ...block, fields: [...(sourceFields[code] ?? []), ...block.fields] }
              : block,
          ),
        }
      : importedLine
  const line =
    code === "28"
      ? {
          ...sourcedLine,
          blocks: [
            ...sourcedLine.blocks,
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
      : sourcedLine
  const readonlySourceKeys = new Set([
    "documentTypeCode",
    "noAju",
    "noRegister",
    "registerDate",
    "sourceSequence",
  ])
  const lineWithReadonlySource = CUSTOMS_SOURCE_DOC_CODES[code]
    ? {
        ...line,
        blocks: line.blocks.map((block) =>
          "fields" in block
            ? {
                ...block,
                fields: block.fields.map((item) =>
                  "group" in item
                    ? {
                        ...item,
                        fields: item.fields.map((field) =>
                          readonlySourceKeys.has(field.key) ? { ...field, readOnly: true } : field,
                        ),
                      }
                    : readonlySourceKeys.has(item.key)
                      ? { ...item, readOnly: true }
                      : item,
                ),
              }
            : block,
        ),
      }
    : line

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
    "25": [{ key: "unitPrice", store: "line", label: "Harga Satuan FOB", kind: "qty" }],
    "27": [
      { key: "specification", store: "line", label: "Spesifikasi Lain", kind: "text", long: true },
    ],
    "30": [{ key: "volume", store: "lineDetails", label: "Volume", kind: "qty" }],
    "331": [
      {
        key: "originCountryCode",
        store: "line",
        label: "Negara Asal Barang",
        kind: "ref",
        refType: "country",
      },
    ],
    "20": [
      { key: "unitPrice", store: "line", label: "Harga Satuan", kind: "qty" },
      { key: "cifValue", store: "line", label: "Harga CIF", kind: "money" },
    ],
    "16": [{ key: "cifValue", store: "line", label: "Harga CIF", kind: "money" }],
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
  const lastFieldBlockIndex = lineWithReadonlySource.blocks.findLastIndex(
    (block) => "fields" in block,
  )
  const completedLine =
    additions.length === 0 || lastFieldBlockIndex < 0
      ? lineWithReadonlySource
      : {
          ...lineWithReadonlySource,
          blocks: lineWithReadonlySource.blocks.map((block, index) =>
            index === lastFieldBlockIndex && "fields" in block
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

  const displayLine = HMX_ONLY_LINE_FIELDS[code]
    ? {
        ...normalizedLine,
        blocks: normalizedLine.blocks.map((block) =>
          "fields" in block
            ? {
                ...block,
                fields: block.fields.flatMap<CustomsFieldItem>((item): CustomsFieldItem[] => {
                  if ("group" in item) {
                    return [
                      {
                        ...item,
                        fields: item.fields.filter(
                          (field) => !HMX_ONLY_LINE_FIELDS[code]?.has(field.key),
                        ),
                      },
                    ]
                  }
                  return HMX_ONLY_LINE_FIELDS[code]?.has(item.key) ? [] : [item]
                }),
              }
            : block,
        ),
      }
    : normalizedLine
  const optionDomains: Partial<Record<CustomsDocCode, Record<string, readonly string[]>>> = {
    "25": { productCategoryCode: CUSTOMS_PRODUCT_CATEGORY_DOMAINS["25"] },
    "40": { taxFacilitiesFeeCode: CUSTOMS_FACILITY_DOMAINS["40"] },
  }
  const activeOptionDomains = optionDomains[code]
  const requiredLineFields = EQUIP3_REQUIRED_LINE_FIELDS[code]
  const domainLine =
    activeOptionDomains || requiredLineFields
      ? {
          ...displayLine,
          blocks: displayLine.blocks.map((block) =>
            "fields" in block
              ? {
                  ...block,
                  fields: block.fields.map((item) =>
                    "group" in item
                      ? {
                          ...item,
                          fields: item.fields.map((field) => ({
                            ...field,
                            ...(activeOptionDomains?.[field.key]
                              ? { codes: activeOptionDomains[field.key] }
                              : {}),
                            ...(requiredLineFields?.has(field.key) ? { required: true } : {}),
                          })),
                        }
                      : {
                          ...item,
                          ...(activeOptionDomains?.[item.key]
                            ? { codes: activeOptionDomains[item.key] }
                            : {}),
                          ...(requiredLineFields?.has(item.key) ? { required: true } : {}),
                        },
                  ),
                }
              : block,
          ),
        }
      : displayLine
  const orderedLine = (EQUIP3_LINE_FIELD_MOVES[code] ?? []).reduce(
    (current, [fieldKey, anchorKey]) => moveLineFieldAfter(current, fieldKey, anchorKey),
    domainLine,
  )

  return { code, title, description, path, ...layout, line: orderedLine }
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
