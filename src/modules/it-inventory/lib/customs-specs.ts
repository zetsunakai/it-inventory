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

const DELIVERY_PRICE: CustomsField = {
  key: "deliveryPrice",
  label: "Harga penyerahan",
  kind: "money",
  span: 6,
}

// Uang muka, diskon, DPP, dan nilai jasa: dokumen dengan harga penyerahan (TLDDP).
const DOMESTIC_VALUES: CustomsField[] = [
  { key: "downPayment", label: "Uang muka", kind: "money", detail: true, span: 6 },
  { key: "discountValue", label: "Diskon", kind: "money", detail: true, span: 6 },
]

// BC 4.0: pemasukan barang dari tempat lain dalam daerah pabean (document_40 hmx).
export const BC40: CustomsFormSpec = {
  code: "40",
  title: "BC 4.0",
  description: "Pemasukan barang dari pemasok dalam negeri (TLDDP) ke kawasan berikat.",
  path: "/dokumen-bc/bc40",
  header: [TPB_TYPE],
  parties: [ENTREPRENEUR, OWNER, { code: "9", label: "Pengirim", source: "partner" }],
  transport: { fields: [] },
  containers: true,
  transaction: [
    DELIVERY_PRICE,
    { key: "serviceValue", label: "Nilai jasa", kind: "money", detail: true, span: 6 },
    ...DOMESTIC_VALUES,
    { key: "volume", label: "Volume (m3)", kind: "qty", detail: true, span: 6 },
    ...WEIGHTS,
  ],
  line: [
    ...CUSTOMS_LINE_BASE_FIELDS,
    { key: "deliveryPrice", label: "Harga penyerahan", kind: "money", span: 6 },
  ],
  taxes: ["PPN"],
}

const DELIVERY_REASON: CustomsField = {
  key: "deliveryReasonCode",
  label: "Tujuan pengeluaran",
  kind: "option",
  list: "deliveryReason",
  detail: true,
  span: 6,
}

const RECIPIENT: CustomsPartySpec = { code: "8", label: "Penerima", source: "partner" }

const DPP: CustomsField = { key: "dppValue", label: "DPP", kind: "money", detail: true, span: 6 }

// BC 2.5: pengeluaran barang dari TPB ke tempat lain dalam daerah pabean (document_25 hmx).
export const BC25: CustomsFormSpec = {
  code: "25",
  title: "BC 2.5",
  description: "Pengeluaran barang dari kawasan berikat ke pembeli dalam negeri (TLDDP).",
  path: "/dokumen-bc/bc25",
  header: [
    TPB_TYPE,
    DELIVERY_REASON,
    {
      key: "paymentTermCode",
      label: "Cara pembayaran",
      kind: "option",
      list: "paymentTerm",
      detail: true,
      span: 6,
    },
    {
      key: "transportModeCode",
      label: "Cara angkut",
      kind: "ref",
      refType: "transport_mode",
      detail: true,
      span: 6,
    },
  ],
  parties: [ENTREPRENEUR, OWNER, RECIPIENT],
  transport: null,
  containers: true,
  transaction: [
    ...CURRENCY,
    { key: "cifValue", label: "Nilai CIF", kind: "money", span: 6 },
    DELIVERY_PRICE,
    DPP,
    ...DOMESTIC_VALUES,
    ...WEIGHTS,
  ],
  line: [
    ...CUSTOMS_LINE_BASE_FIELDS,
    { key: "cifValue", label: "Nilai CIF", kind: "money", span: 6 },
    { key: "deliveryPrice", label: "Harga penyerahan", kind: "money", span: 6 },
  ],
  taxes: ["BM", "PPN", "PPH"],
}

// BC 4.1: pengeluaran kembali barang asal TLDDP dari TPB (document_41 hmx).
export const BC41: CustomsFormSpec = {
  code: "41",
  title: "BC 4.1",
  description: "Pengeluaran kembali barang asal dalam negeri dari kawasan berikat.",
  path: "/dokumen-bc/bc41",
  header: [
    TPB_TYPE,
    DELIVERY_REASON,
    {
      key: "plbWarehouseCode",
      label: "Kode gudang PLB",
      kind: "text",
      mono: true,
      detail: true,
      span: 6,
    },
  ],
  parties: [ENTREPRENEUR, OWNER, RECIPIENT],
  transport: { fields: [] },
  containers: true,
  transaction: [
    DELIVERY_PRICE,
    {
      key: "acquisitionPrice",
      label: "Harga perolehan",
      kind: "money",
      detail: true,
      span: 6,
    },
    DPP,
    { key: "serviceValue", label: "Nilai jasa", kind: "money", detail: true, span: 6 },
    ...DOMESTIC_VALUES,
    { key: "ppnRate", label: "Tarif PPN (%)", kind: "qty", detail: true, span: 3 },
    { key: "ppnValue", label: "PPN", kind: "money", detail: true, span: 3 },
    { key: "ppnbmRate", label: "Tarif PPnBM (%)", kind: "qty", detail: true, span: 3 },
    { key: "ppnbmValue", label: "PPnBM", kind: "money", detail: true, span: 3 },
    { key: "volume", label: "Volume (m3)", kind: "qty", detail: true, span: 6 },
    ...WEIGHTS,
  ],
  line: [
    ...CUSTOMS_LINE_BASE_FIELDS,
    { key: "deliveryPrice", label: "Harga penyerahan", kind: "money", span: 6 },
    {
      key: "acquisitionPrice",
      label: "Harga perolehan",
      kind: "money",
      detail: true,
      span: 6,
    },
  ],
  taxes: ["PPN", "PPNBM"],
}

export const CUSTOMS_SPECS: Partial<Record<CustomsDocCode, CustomsFormSpec>> = {
  "23": BC23,
  "40": BC40,
  "25": BC25,
  "41": BC41,
}
