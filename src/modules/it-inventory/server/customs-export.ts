import "server-only"

import ExcelJS from "exceljs"
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib"

import { formatDecimal } from "@/lib/decimal"
import {
  CUSTOMS_DOCUMENT_STATUS_LABELS,
  type CustomsDocumentStatus,
} from "@/modules/it-inventory/lib/customs"
import {
  CUSTOMS_STATEMENT_FIELDS,
  customsOptionLabel,
  formatCustomsValue,
  type CustomsDocumentDraft,
  type CustomsField,
  type CustomsFieldKind,
  type CustomsFormSpec,
} from "@/modules/it-inventory/lib/customs-form"

// Export draft dokumen BC ke PDF dan Excel (backlog M3-13, PRD 7.6) untuk membantu input manual
// ke portal CEISA selama MVP. Isinya semua bagian dokumen, urut seperti tab form.

export type ExportDocument = {
  ajuNumber: string
  ajuDate: string
  status: CustomsDocumentStatus
  version: number
  registrationNumber: string | null
  registrationDate: string | null
  draft: CustomsDocumentDraft
  refLabels: Record<string, string>
}

type Table = { columns: string[]; rows: string[][] }
export type ExportSection = { title: string; fields?: [string, string][]; table?: Table }

const date = (value: string | null) => (value ? value.split("-").reverse().join("/") : "—")

export function customsExportSections(spec: CustomsFormSpec, doc: ExportDocument): ExportSection[] {
  const { draft, refLabels } = doc
  const show = (field: CustomsFieldKind, value: string | undefined) =>
    formatCustomsValue(field, value, refLabels)
  const headerValue = (field: CustomsField) =>
    field.detail ? draft.details[field.key] : (draft.header as Record<string, string>)[field.key]
  const fields = (list: CustomsField[]): [string, string][] =>
    list.map((field) => [field.label, show(field, headerValue(field))])
  const ref = (refType: Extract<CustomsFieldKind, { kind: "ref" }>["refType"], value: string) =>
    show({ kind: "ref", refType }, value)

  const sections: ExportSection[] = [
    {
      title: "Header",
      fields: [
        ["Jenis dokumen", `${spec.title} (${spec.code})`],
        ["Nomor aju", doc.ajuNumber],
        ["Tanggal aju", date(doc.ajuDate)],
        ["Status", CUSTOMS_DOCUMENT_STATUS_LABELS[doc.status]],
        ["Versi", String(doc.version)],
        ["Nomor daftar", doc.registrationNumber ?? "—"],
        ["Tanggal daftar", date(doc.registrationDate)],
        ["Kantor pabean", ref("customs_office", draft.header.customsOfficeCode)],
        ...fields(spec.header),
      ],
    },
    {
      title: "Entitas",
      table: {
        columns: ["Peran", "Nama", "Jenis identitas", "Nomor identitas", "Alamat", "Negara"],
        rows: spec.parties.map((role) => {
          const party = draft.parties.find((entry) => entry.entityTypeCode === role.code)
          return [
            `${role.label} (${role.code})`,
            party?.name || "—",
            party?.identityTypeCode
              ? `[${party.identityTypeCode}] ${customsOptionLabel("identityType", party.identityTypeCode)}`
              : "—",
            party?.identityNumber || "—",
            party?.address || "—",
            party?.countryCode ? ref("country", party.countryCode) : "—",
          ]
        }),
      },
    },
    {
      title: "Dokumen lampiran",
      table: {
        columns: ["Seri", "Jenis", "Nomor", "Tanggal", "File"],
        rows: draft.attachments.map((row, index) => [
          String(index + 1),
          ref("document_type", row.documentTypeCode),
          row.number || "—",
          date(row.date || null),
          row.file?.fileName ?? "—",
        ]),
      },
    },
  ]
  if (spec.transport) {
    sections.push({
      title: "Pengangkutan",
      fields: fields(spec.transport.fields),
      table: {
        columns: ["Seri", "Cara angkut", "Nama sarana angkut", "Voyage/flight", "Bendera"],
        rows: draft.transports.map((row, index) => [
          String(index + 1),
          ref("transport_mode", row.transportModeCode),
          row.name || "—",
          row.voyageNumber || "—",
          ref("country", row.flagCountryCode),
        ]),
      },
    })
  }
  sections.push({
    title: "Kemasan",
    table: {
      columns: ["Seri", "Jumlah", "Jenis kemasan", "Merek"],
      rows: draft.packages.map((row, index) => [
        String(index + 1),
        show({ kind: "qty" }, row.qty),
        ref("package_type", row.packageTypeCode),
        row.marks || "—",
      ]),
    },
  })
  if (spec.containers) {
    sections.push({
      title: "Peti kemas",
      table: {
        columns: ["Seri", "Nomor", "Ukuran", "Tipe", "Jenis muatan"],
        rows: draft.containers.map((row, index) => [
          String(index + 1),
          row.number,
          ref("container_size", row.sizeCode),
          ref("container_type", row.typeCode),
          show({ kind: "option", list: "containerLoad" }, row.loadTypeCode),
        ]),
      },
    })
  }
  const lineFields = spec.line
  sections.push({
    title: "Barang",
    table: {
      columns: ["Seri", "Product code", ...lineFields.map((field) => field.label)],
      rows: draft.lines.map((line, index) => [
        String(index + 1),
        line.product?.sku ?? "—",
        ...lineFields.map((field) =>
          show(
            field,
            field.detail
              ? line.details[field.key]
              : (line as unknown as Record<string, string>)[field.key],
          ),
        ),
      ]),
    },
  })
  if (spec.taxes) {
    sections.push({
      title: "Pungutan",
      table: {
        columns: ["Seri barang", "Jenis", "Tarif (%)", "Fasilitas", "Tarif fasilitas (%)", "Nilai"],
        rows: draft.lines.flatMap((line, index) =>
          line.taxes.map((tax) => [
            String(index + 1),
            ref("levy_type", tax.levyTypeCode),
            tax.rate ? formatDecimal(tax.rate.replace(",", ".")) : "—",
            show({ kind: "option", list: "taxFacility" }, tax.facilityCode),
            tax.facilityRate ? formatDecimal(tax.facilityRate.replace(",", ".")) : "—",
            show({ kind: "money" }, tax.amount),
          ]),
        ),
      },
    })
  }
  sections.push(
    { title: "Transaksi", fields: fields(spec.transaction) },
    {
      title: "Pernyataan",
      fields: [...fields(CUSTOMS_STATEMENT_FIELDS), ["Catatan", draft.header.notes || "—"]],
    },
  )
  return sections
}

const DRAFT_NOTE = "Draft untuk input manual ke portal CEISA, bukan dokumen resmi."

// Excel: satu sheet per bagian; isian sebagai pasangan label–nilai, baris berulang sebagai tabel.
export async function customsExportExcel(spec: CustomsFormSpec, doc: ExportDocument) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = "IT Inventory"
  for (const section of customsExportSections(spec, doc)) {
    const sheet = workbook.addWorksheet(section.title.slice(0, 31))
    sheet.addRow([`${spec.title} ${doc.ajuNumber} · ${section.title}`]).font = { bold: true }
    sheet.addRow([DRAFT_NOTE]).font = { italic: true }
    sheet.addRow([])
    for (const [label, value] of section.fields ?? []) {
      const row = sheet.addRow([label, value])
      row.getCell(1).font = { bold: true }
    }
    if (section.table) {
      if (section.fields?.length) sheet.addRow([])
      sheet.addRow(section.table.columns).font = { bold: true }
      for (const values of section.table.rows) sheet.addRow(values)
    }
    sheet.columns.forEach((column) => {
      column.width = 24
    })
  }
  return Buffer.from(await workbook.xlsx.writeBuffer())
}

// PDF A4: judul, catatan draft, lalu setiap bagian. Tabel ditulis per baris sebagai label: nilai
// supaya muat di kertas tegak. Font standar PDF hanya Latin-1; karakter lain diganti "?".
export async function customsExportPdf(spec: CustomsFormSpec, doc: ExportDocument) {
  const pdf = await PDFDocument.create()
  pdf.setTitle(`${spec.title} ${doc.ajuNumber}`)
  pdf.setCreator("IT Inventory")
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const writer = new PdfWriter(pdf, regular, bold)

  writer.text(`${spec.title} ${doc.ajuNumber}`, { font: bold, size: 14 })
  writer.text(spec.description, { size: 9 })
  writer.text(DRAFT_NOTE, { size: 9, color: 0.45 })
  for (const section of customsExportSections(spec, doc)) {
    writer.gap(10)
    writer.text(section.title, { font: bold, size: 11 })
    writer.rule()
    for (const [label, value] of section.fields ?? []) writer.field(label, value)
    if (section.table) {
      if (!section.table.rows.length) writer.text("Tidak ada.", { size: 9, color: 0.45 })
      for (const values of section.table.rows) {
        writer.gap(4)
        section.table.columns.forEach((column, index) => writer.field(column, values[index] ?? ""))
      }
    }
  }
  return pdf.save()
}

const PAGE = { width: 595.28, height: 841.89, margin: 40, labelWidth: 150 }

class PdfWriter {
  private page: PDFPage
  private y: number

  constructor(
    private pdf: PDFDocument,
    private regular: PDFFont,
    private bold: PDFFont,
  ) {
    this.page = pdf.addPage([PAGE.width, PAGE.height])
    this.y = PAGE.height - PAGE.margin
  }

  gap(points: number) {
    this.y -= points
  }

  rule() {
    this.ensure(6)
    this.page.drawLine({
      start: { x: PAGE.margin, y: this.y },
      end: { x: PAGE.width - PAGE.margin, y: this.y },
      thickness: 0.5,
      color: rgb(0.75, 0.75, 0.75),
    })
    this.y -= 6
  }

  text(value: string, options: { font?: PDFFont; size?: number; color?: number } = {}) {
    const font = options.font ?? this.regular
    const size = options.size ?? 9
    for (const line of this.wrap(value, font, size, PAGE.width - 2 * PAGE.margin)) {
      this.ensure(size + 3)
      this.page.drawText(line, {
        x: PAGE.margin,
        y: this.y - size,
        size,
        font,
        color: rgb(options.color ?? 0, options.color ?? 0, options.color ?? 0),
      })
      this.y -= size + 3
    }
  }

  field(label: string, value: string) {
    const size = 9
    const valueWidth = PAGE.width - 2 * PAGE.margin - PAGE.labelWidth
    const labels = this.wrap(label, this.bold, size, PAGE.labelWidth - 8)
    const values = this.wrap(value, this.regular, size, valueWidth)
    const lines = Math.max(labels.length, values.length)
    this.ensure(lines * (size + 3))
    for (let index = 0; index < lines; index++) {
      const y = this.y - size - index * (size + 3)
      if (labels[index]) {
        this.page.drawText(labels[index], { x: PAGE.margin, y, size, font: this.bold })
      }
      if (values[index]) {
        this.page.drawText(values[index], {
          x: PAGE.margin + PAGE.labelWidth,
          y,
          size,
          font: this.regular,
        })
      }
    }
    this.y -= lines * (size + 3)
  }

  private ensure(height: number) {
    if (this.y - height >= PAGE.margin) return
    this.page = this.pdf.addPage([PAGE.width, PAGE.height])
    this.y = PAGE.height - PAGE.margin
  }

  private wrap(value: string, font: PDFFont, size: number, width: number) {
    const lines: string[] = []
    for (const paragraph of latin1(value).split("\n")) {
      let current = ""
      for (const word of paragraph.split(" ")) {
        const candidate = current ? `${current} ${word}` : word
        if (font.widthOfTextAtSize(candidate, size) <= width) {
          current = candidate
          continue
        }
        if (current) lines.push(current)
        // Kata yang lebih panjang dari lebar baris dipotong per karakter.
        let rest = word
        while (font.widthOfTextAtSize(rest, size) > width) {
          let cut = rest.length - 1
          while (cut > 1 && font.widthOfTextAtSize(rest.slice(0, cut), size) > width) cut--
          lines.push(rest.slice(0, cut))
          rest = rest.slice(cut)
        }
        current = rest
      }
      lines.push(current)
    }
    return lines
  }
}

function latin1(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[–—]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/·/g, "-")
    .replace(/[^\n\x20-\x7E\xA0-\xFF]/g, "?")
}
