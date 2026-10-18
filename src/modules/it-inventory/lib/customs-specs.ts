import type { FieldSpan } from "@/components/form-field"

import type { CustomsDocCode } from "./customs"
import {
  CUSTOMS_LINE_BASE_FIELDS,
  type CustomsField,
  type CustomsFormSpec,
  type CustomsOptionList,
  type CustomsPartySpec,
} from "./customs-form"

// Isian form per jenis dokumen BC (backlog M3-05–M3-09 dan D-01–D-08), mengikuti
// models/document_XX.py dan views/document_XX_views.xml hmx core_it_inventory. Kunci details sama
// dengan aturan validasi (migrasi doc_validation_rules_seed dan customs_doc_codes_all).

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

// Data BC 1.1 (manifes) untuk dokumen pemasukan dari luar negeri.
const BC11: CustomsField[] = [
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
]

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
      ...BC11,
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

// BC 3.0: pemberitahuan ekspor barang (document_30 hmx).
export const BC30: CustomsFormSpec = {
  code: "30",
  title: "BC 3.0",
  description: "Ekspor barang dari kawasan berikat ke luar negeri (PEB).",
  path: "/dokumen-bc/bc30",
  header: [
    {
      key: "exportCategoryCode",
      label: "Kategori ekspor",
      kind: "option",
      list: "exportCategory",
      detail: true,
      span: 6,
    },
    {
      key: "paymentTermCode",
      label: "Cara pembayaran",
      kind: "option",
      list: "paymentTerm",
      detail: true,
      span: 6,
    },
    {
      key: "estimatedExportDate",
      label: "Perkiraan tanggal ekspor",
      kind: "date",
      detail: true,
      span: 6,
    },
  ],
  parties: [
    { code: "2", label: "Eksportir", source: "company" },
    { code: "6", label: "Pembeli", source: "partner", country: true },
    { code: "8", label: "Penerima", source: "partner", country: true },
  ],
  transport: {
    fields: [
      {
        key: "loadingPortCode",
        label: "Pelabuhan muat",
        kind: "ref",
        refType: "domestic_port",
        detail: true,
        span: 6,
      },
      {
        key: "destinationPortCode",
        label: "Pelabuhan tujuan",
        kind: "ref",
        refType: "foreign_port",
        detail: true,
        span: 6,
      },
      {
        key: "destinationCountryCode",
        label: "Negara tujuan",
        kind: "ref",
        refType: "country",
        detail: true,
        span: 6,
      },
      {
        key: "tpsCode",
        label: "Tempat penimbunan",
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
    { key: "fobValue", label: "Nilai FOB", kind: "money", span: 6 },
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
    ...WEIGHTS,
  ],
  line: [
    ...CUSTOMS_LINE_BASE_FIELDS,
    { key: "fobValue", label: "Nilai FOB", kind: "money", span: 6 },
    { key: "originCountryCode", label: "Negara asal", kind: "ref", refType: "country", span: 6 },
  ],
  taxes: null,
}

// ---------------------------------------------------------------------------------------------
// Jenis di luar MVP (jadwal PRD fase 2 dan 3). Form dan aturan validasinya sudah ada; gerbang
// transfer dan alokasi dokumen asal belum memakai jenis ini.

const ref = (
  key: string,
  label: string,
  refType: Extract<CustomsField, { kind: "ref" }>["refType"],
  span: FieldSpan = 6,
): CustomsField => ({ key, label, kind: "ref", refType, detail: true, span })

const option = (
  key: string,
  label: string,
  list: CustomsOptionList,
  span: FieldSpan = 6,
): CustomsField => ({ key, label, kind: "option", list, detail: true, span })

const detailMoney = (key: string, label: string, span: FieldSpan = 6): CustomsField => ({
  key,
  label,
  kind: "money",
  detail: true,
  span,
})

const PLB_WAREHOUSE: CustomsField = {
  key: "plbWarehouseCode",
  label: "Kode gudang PLB",
  kind: "text",
  mono: true,
  detail: true,
  span: 6,
}

const CLOSE_PU: CustomsField = {
  key: "closePuNumber",
  label: "Nomor tutup PU",
  kind: "text",
  mono: true,
  detail: true,
  span: 6,
}

const CUSTOMS_VALUE = detailMoney("customsValue", "Nilai pabean")
const CIF: CustomsField = { key: "cifValue", label: "Nilai CIF", kind: "money", span: 6 }
const INCOTERM = ref("incotermCode", "Incoterm", "incoterm")
const PAYMENT_TERM = option("paymentTermCode", "Cara pembayaran", "paymentTerm")
const PROCEDURE_TYPE = option("procedureTypeCode", "Jenis PIB", "procedureType")
const IMPORT_TYPE = option("importTypeCode", "Jenis impor", "importType")
const SUPERVISORY_OFFICE = ref(
  "supervisoryOfficeCode",
  "Kantor pabean pengawasan",
  "customs_office",
)
const LOADING_OFFICE = ref("loadingOfficeCode", "Kantor pabean muat", "customs_office")

// Pelabuhan dan tempat timbun barang yang datang dari luar negeri (BC 2.0, BC 1.6).
const ARRIVAL: CustomsField[] = [
  CLOSE_PU,
  { key: "estimatedArrivalDate", label: "Perkiraan tiba", kind: "date", detail: true, span: 6 },
  ...BC11,
  ref("loadingPortCode", "Pelabuhan muat", "foreign_port"),
  ref("transitPortCode", "Pelabuhan transit", "foreign_port"),
  ref("unloadingPortCode", "Pelabuhan bongkar", "domestic_port"),
  ref("tpsCode", "Tempat penimbunan sementara", "tps"),
]

const IMPORT_LINE: CustomsField[] = [
  ...CUSTOMS_LINE_BASE_FIELDS,
  { key: "originCountryCode", label: "Negara asal", kind: "ref", refType: "country", span: 6 },
  { key: "invoiceValue", label: "Harga invoice", kind: "money", span: 6 },
  { key: "cifValue", label: "Nilai CIF", kind: "money", span: 6 },
]

const SENDER_ABROAD: CustomsPartySpec = {
  code: "9",
  label: "Pengirim",
  source: "partner",
  country: true,
}
const SELLER_ABROAD: CustomsPartySpec = {
  code: "10",
  label: "Penjual",
  source: "partner",
  country: true,
}

// BC 2.0: pemberitahuan impor barang untuk dipakai (document_20 hmx).
export const BC20: CustomsFormSpec = {
  code: "20",
  title: "BC 2.0",
  description: "Impor barang dari luar negeri untuk dipakai (PIB).",
  path: "/dokumen-bc/bc20",
  header: [IMPORT_TYPE, PROCEDURE_TYPE, PAYMENT_TERM],
  parties: [
    { code: "1", label: "Importir", source: "company" },
    OWNER,
    { code: "11", label: "Pemusatan", source: "company" },
    SENDER_ABROAD,
    SELLER_ABROAD,
  ],
  transport: {
    fields: [...ARRIVAL, ref("destinationPortCode", "Pelabuhan tujuan", "domestic_port")],
  },
  containers: true,
  transaction: [
    ...CURRENCY,
    option("tradeTransactionTypeCode", "Jenis transaksi", "tradeTransactionType"),
    INCOTERM,
    detailMoney("goodsValue", "Harga barang"),
    CIF,
    { key: "freightValue", label: "Freight", kind: "money", span: 4 },
    option("insuranceTypeCode", "Jenis asuransi", "insuranceType", 4),
    { key: "insuranceValue", label: "Nilai asuransi", kind: "money", span: 4 },
    detailMoney("additionalCost", "Biaya penambah"),
    detailMoney("deductionCost", "Biaya pengurang"),
    CUSTOMS_VALUE,
    detailMoney("voluntaryDeclarationValue", "Voluntary declaration"),
    ...WEIGHTS,
  ],
  line: IMPORT_LINE,
  taxes: ["BM", "PPN", "PPH"],
}

const TEMPORARY_TRANSACTION: CustomsField[] = [...CURRENCY, CIF, CUSTOMS_VALUE, ...WEIGHTS]

const TEMPORARY_LINE: CustomsField[] = [
  ...CUSTOMS_LINE_BASE_FIELDS,
  { key: "cifValue", label: "Nilai CIF", kind: "money", span: 6 },
]

// BC 2.6.1: pengeluaran sementara barang dari TPB dengan jaminan (document_261 hmx).
export const BC261: CustomsFormSpec = {
  code: "261",
  title: "BC 2.6.1",
  description:
    "Pengeluaran sementara barang dari kawasan berikat ke dalam negeri dengan jaminan, mis. untuk diperbaiki atau disubkontrakkan.",
  path: "/dokumen-bc/bc261",
  header: [option("temporaryReasonCode", "Tujuan pengiriman", "temporaryReason"), PLB_WAREHOUSE],
  parties: [ENTREPRENEUR, RECIPIENT, OWNER],
  transport: { fields: [] },
  containers: true,
  transaction: TEMPORARY_TRANSACTION,
  line: TEMPORARY_LINE,
  taxes: null,
}

// BC 2.6.2: pemasukan kembali barang yang dikeluarkan dengan BC 2.6.1 (document_262 hmx).
export const BC262: CustomsFormSpec = {
  code: "262",
  title: "BC 2.6.2",
  description: "Pemasukan kembali barang yang sebelumnya dikeluarkan sementara dengan BC 2.6.1.",
  path: "/dokumen-bc/bc262",
  header: [option("temporaryReasonCode", "Tujuan pemasukan", "temporaryReason"), PLB_WAREHOUSE],
  parties: [ENTREPRENEUR, { code: "9", label: "Pengirim", source: "partner" }, OWNER],
  transport: { fields: [] },
  containers: true,
  transaction: TEMPORARY_TRANSACTION,
  line: TEMPORARY_LINE,
  taxes: ["BM", "PPN", "PPNBM", "PPH"],
}

// BC 2.7: pengeluaran barang dari TPB ke TPB lain (document_27 hmx). Kantor pabean di header
// adalah kantor asal.
export const BC27: CustomsFormSpec = {
  code: "27",
  title: "BC 2.7",
  description: "Pengiriman barang dari kawasan berikat ke tempat penimbunan berikat lain.",
  path: "/dokumen-bc/bc27",
  header: [
    { ...TPB_TYPE, label: "Jenis TPB asal" },
    PLB_WAREHOUSE,
    ref("destinationOfficeCode", "Kantor pabean tujuan", "customs_office"),
    option("destinationTpbTypeCode", "Jenis TPB tujuan", "tpbType"),
    { ...PLB_WAREHOUSE, key: "destinationPlbWarehouseCode", label: "Kode gudang PLB tujuan" },
    { ...DELIVERY_REASON, label: "Alasan pengiriman" },
  ],
  parties: [ENTREPRENEUR, OWNER, { ...RECIPIENT, permit: true }],
  transport: { fields: [] },
  containers: true,
  transaction: [
    ...CURRENCY,
    CIF,
    DELIVERY_PRICE,
    CUSTOMS_VALUE,
    DPP,
    ...DOMESTIC_VALUES,
    { key: "serviceValue", label: "Nilai jasa", kind: "money", detail: true, span: 6 },
    { key: "ppnRate", label: "Tarif PPN (%)", kind: "qty", detail: true, span: 3 },
    { key: "ppnValue", label: "PPN", kind: "money", detail: true, span: 3 },
    { key: "ppnbmRate", label: "Tarif PPnBM (%)", kind: "qty", detail: true, span: 3 },
    { key: "ppnbmValue", label: "PPnBM", kind: "money", detail: true, span: 3 },
    { key: "volume", label: "Volume (m3)", kind: "qty", detail: true, span: 6 },
    ...WEIGHTS,
  ],
  line: [
    ...CUSTOMS_LINE_BASE_FIELDS,
    { key: "cifValue", label: "Nilai CIF", kind: "money", span: 6 },
    { key: "deliveryPrice", label: "Harga penyerahan", kind: "money", span: 6 },
  ],
  taxes: null,
}

// Pengusaha PLB: perusahaan sebagai penyelenggara pusat logistik berikat.
const PLB_ENTREPRENEUR: CustomsPartySpec = { ...ENTREPRENEUR, label: "Pengusaha PLB" }

// BC 1.6: pemasukan barang impor ke pusat logistik berikat (document_16 hmx).
export const BC16: CustomsFormSpec = {
  code: "16",
  title: "BC 1.6",
  description: "Pemasukan barang dari luar negeri untuk ditimbun di pusat logistik berikat (PLB).",
  path: "/dokumen-bc/bc16",
  header: [
    SUPERVISORY_OFFICE,
    PLB_WAREHOUSE,
    ref("unloadingOfficeCode", "Kantor pabean bongkar", "customs_office"),
  ],
  parties: [PLB_ENTREPRENEUR, { ...OWNER, country: true }, SENDER_ABROAD, SELLER_ABROAD],
  transport: { fields: ARRIVAL },
  containers: true,
  transaction: [
    ...CURRENCY,
    option("tradeTransactionTypeCode", "Jenis transaksi", "tradeTransactionType"),
    INCOTERM,
    CIF,
    CUSTOMS_VALUE,
    ...WEIGHTS,
  ],
  line: IMPORT_LINE,
  taxes: ["BM", "PPN", "PPH"],
}

// BC 2.8: impor barang dari PLB untuk dipakai (document_28 hmx).
export const BC28: CustomsFormSpec = {
  code: "28",
  title: "BC 2.8",
  description:
    "Pengeluaran barang impor dari pusat logistik berikat untuk dipakai di dalam negeri.",
  path: "/dokumen-bc/bc28",
  header: [
    LOADING_OFFICE,
    PROCEDURE_TYPE,
    IMPORT_TYPE,
    PAYMENT_TERM,
    option("ckdIkdBlending", "CKD/IKD/blending", "yesNo"),
  ],
  parties: [
    PLB_ENTREPRENEUR,
    { code: "1", label: "Importir", source: "partner" },
    SELLER_ABROAD,
    { code: "7", label: "Pemilik barang", source: "partner", country: true },
    { code: "4", label: "PPJK", source: "partner" },
  ],
  transport: { fields: [PLB_WAREHOUSE] },
  containers: true,
  transaction: [
    ...CURRENCY,
    option("valuationTypeCode", "Jenis nilai", "valuationType"),
    INCOTERM,
    detailMoney("goodsValue", "Harga barang"),
    CIF,
    CUSTOMS_VALUE,
    ...WEIGHTS,
  ],
  line: IMPORT_LINE,
  taxes: ["BM", "PPN", "PPH"],
}

// BC 3.3: ekspor barang melalui atau dari PLB (document_33 hmx).
export const BC33: CustomsFormSpec = {
  code: "33",
  title: "BC 3.3",
  description: "Ekspor barang melalui atau dari pusat logistik berikat (PLB).",
  path: "/dokumen-bc/bc33",
  header: [
    option("exportTypeCode", "Jenis ekspor", "exportType"),
    option("exportCategoryCode", "Kategori ekspor", "exportCategory"),
    { ...PROCEDURE_TYPE, label: "Jenis BC 3.3" },
    option("tradeMethodCode", "Cara dagang", "tradeMethod"),
    PAYMENT_TERM,
    LOADING_OFFICE,
    SUPERVISORY_OFFICE,
  ],
  parties: [
    { code: "2", label: "Eksportir", source: "company" },
    PLB_ENTREPRENEUR,
    { code: "8", label: "Penerima", source: "partner", country: true },
    { code: "6", label: "Pembeli", source: "partner", country: true },
  ],
  transport: {
    fields: [
      PLB_WAREHOUSE,
      { key: "plbEntryDate", label: "Tanggal masuk ke PLB", kind: "date", detail: true, span: 6 },
      { key: "loadingDate", label: "Tanggal pemuatan", kind: "date", detail: true, span: 6 },
      ref("loadingPortCode", "Pelabuhan muat asal", "domestic_port"),
      ref("unloadingPortCode", "Pelabuhan bongkar", "foreign_port"),
      ref("destinationPortCode", "Pelabuhan tujuan", "foreign_port"),
      ref("destinationCountryCode", "Negara tujuan", "country"),
    ],
  },
  containers: true,
  transaction: [
    ...CURRENCY,
    INCOTERM,
    option("bulkTypeCode", "Barang curah", "bulkType"),
    { key: "fobValue", label: "Nilai ekspor FOB", kind: "money", span: 6 },
    detailMoney("goodsValue", "Nilai barang"),
    detailMoney("maklonValue", "Nilai maklon"),
    detailMoney("exportIncomeTaxValue", "PPh pasal 22 ekspor"),
    ...WEIGHTS,
  ],
  line: [
    ...CUSTOMS_LINE_BASE_FIELDS,
    { key: "fobValue", label: "Nilai FOB", kind: "money", span: 6 },
    { key: "originCountryCode", label: "Negara asal", kind: "ref", refType: "country", span: 6 },
  ],
  taxes: ["BK"],
}

// P3BET: penggabungan dan pemecahan barang ekspor serta transhipment dari PLB (document_331 hmx).
export const P3BET: CustomsFormSpec = {
  code: "331",
  title: "P3BET",
  description:
    "Pemberitahuan penggabungan dan pemecahan barang ekspor serta transhipment dari pusat logistik berikat.",
  path: "/dokumen-bc/p3bet",
  header: [LOADING_OFFICE, SUPERVISORY_OFFICE],
  parties: [PLB_ENTREPRENEUR, { code: "8", label: "Penerima", source: "partner", country: true }],
  transport: {
    fields: [
      CLOSE_PU,
      PLB_WAREHOUSE,
      ...BC11,
      ref("loadingPortCode", "Pelabuhan muat", "domestic_port"),
      ref("unloadingPortCode", "Pelabuhan bongkar", "foreign_port"),
      ref("destinationPortCode", "Pelabuhan tujuan", "foreign_port"),
      ref("destinationCountryCode", "Negara tujuan", "country"),
      ref("tpsCode", "Tempat penimbunan", "tps"),
      { key: "stuffingDate", label: "Tanggal stuffing", kind: "date", detail: true, span: 4 },
      { key: "stuffingPlace", label: "Tempat stuffing", kind: "text", detail: true, span: 4 },
      {
        key: "estimatedLoadingDate",
        label: "Perkiraan pemuatan",
        kind: "date",
        detail: true,
        span: 4,
      },
      { key: "callSign", label: "Call sign", kind: "text", mono: true, detail: true, span: 4 },
      { key: "sealQty", label: "Jumlah tanda pengaman", kind: "qty", detail: true, span: 4 },
      option("sealTypeCode", "Jenis tanda pengaman", "sealType", 4),
    ],
  },
  containers: true,
  transaction: WEIGHTS,
  line: CUSTOMS_LINE_BASE_FIELDS,
  taxes: null,
}

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
