import type { CustomsDocCode } from "./customs"
import {
  CUSTOMS_LINE_BASE_FIELDS,
  type CustomsField,
  type CustomsFormSpec,
  type CustomsPartySpec,
} from "./customs-form"

// Isian form per jenis dokumen BC (backlog M3-05–M3-09), mengikuti models/document_XX.py dan
// views/document_XX_views.xml hmx core_it_inventory. Kunci details sama dengan aturan validasi
// (migrasi doc_validation_rules_seed).

const ENTREPRENEUR: CustomsPartySpec = {
  code: "3",
  label: "Pengusaha TPB",
  source: "company",
  permit: true,
}
const OWNER: CustomsPartySpec = { code: "7", label: "Pemilik barang", source: "company" }

const WEIGHTS: CustomsField[] = [
  { key: "grossWeight", label: "Berat kotor (kg)", kind: "qty", span: 3 },
  { key: "netWeight", label: "Berat bersih (kg)", kind: "qty", span: 3 },
]

const CURRENCY: CustomsField[] = [
  { key: "currencyCode", label: "Valuta", kind: "ref", refType: "currency", span: 6 },
  { key: "ndpbm", label: "NDPBM (kurs)", kind: "qty", span: 6 },
]

const TPB_TYPE: CustomsField = {
  key: "tpbTypeCode",
  label: "Jenis TPB",
  kind: "option",
  list: "tpbType",
  detail: true,
  span: 6,
}

// BC 2.3: impor barang untuk ditimbun di TPB (document_23 hmx).
export const BC23: CustomsFormSpec = {
  code: "23",
  title: "BC 2.3",
  description: "Impor barang dari luar negeri untuk ditimbun di kawasan berikat.",
  path: "/dokumen-bc/bc23",
  header: [
    TPB_TYPE,
    {
      key: "unloadingOfficeCode",
      label: "Kantor pabean bongkar",
      kind: "ref",
      refType: "customs_office",
      detail: true,
      span: 6,
    },
  ],
  parties: [
    ENTREPRENEUR,
    { ...OWNER, country: true },
    { code: "5", label: "Pemasok", source: "partner", country: true },
  ],
  transport: {
    fields: [
      { key: "bc11Number", label: "Nomor BC 1.1", kind: "text", mono: true, detail: true, span: 4 },
      { key: "bc11Date", label: "Tanggal BC 1.1", kind: "date", detail: true, span: 4 },
      {
        key: "bc11Pos",
        label: "Nomor pos/subpos",
        kind: "text",
        mono: true,
        detail: true,
        span: 4,
      },
      {
        key: "loadingPortCode",
        label: "Pelabuhan muat",
        kind: "ref",
        refType: "foreign_port",
        detail: true,
        span: 6,
      },
      {
        key: "transitPortCode",
        label: "Pelabuhan transit",
        kind: "ref",
        refType: "foreign_port",
        detail: true,
        span: 6,
      },
      {
        key: "unloadingPortCode",
        label: "Pelabuhan bongkar",
        kind: "ref",
        refType: "domestic_port",
        detail: true,
        span: 6,
      },
      {
        key: "tpsCode",
        label: "Tempat penimbunan sementara",
        kind: "ref",
        refType: "tps",
        detail: true,
        span: 6,
      },
    ],
  },
  containers: true,
  transaction: [
    ...CURRENCY,
    {
      key: "incotermCode",
      label: "Incoterm",
      kind: "ref",
      refType: "incoterm",
      detail: true,
      span: 6,
    },
    { key: "cifValue", label: "Nilai CIF", kind: "money", span: 6 },
    { key: "freightValue", label: "Freight", kind: "money", span: 4 },
    {
      key: "insuranceTypeCode",
      label: "Jenis asuransi",
      kind: "option",
      list: "insuranceType",
      detail: true,
      span: 4,
    },
    { key: "insuranceValue", label: "Nilai asuransi", kind: "money", span: 4 },
    { key: "additionalCost", label: "Biaya penambah", kind: "money", detail: true, span: 6 },
    { key: "deductionCost", label: "Biaya pengurang", kind: "money", detail: true, span: 6 },
    ...WEIGHTS,
  ],
  line: [
    ...CUSTOMS_LINE_BASE_FIELDS,
    { key: "originCountryCode", label: "Negara asal", kind: "ref", refType: "country", span: 6 },
    { key: "invoiceValue", label: "Harga invoice", kind: "money", span: 6 },
    { key: "cifValue", label: "Nilai CIF", kind: "money", span: 6 },
  ],
  taxes: ["BM", "PPN", "PPH"],
}

export const CUSTOMS_SPECS: Partial<Record<CustomsDocCode, CustomsFormSpec>> = {
  "23": BC23,
}
