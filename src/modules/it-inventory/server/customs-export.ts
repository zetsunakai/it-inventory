import "server-only"

import ExcelJS from "exceljs"
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib"

import {
  CUSTOMS_DOC_CODE_LABELS,
  CUSTOMS_DOCUMENT_STATUS_LABELS,
  type CustomsDocumentStatus,
} from "@/modules/it-inventory/lib/customs"
import {
  OWNER_CODE,
  customsFieldValue,
  customsLineFields,
  formatCustomsValue,
  isFieldGroup,
  isListBlock,
  type CustomsAttachmentDraft,
  type CustomsDocumentDraft,
  type CustomsField,
  type CustomsFieldItem,
  type CustomsFieldKind,
  type CustomsFormSpec,
  type CustomsListBlock,
} from "@/modules/it-inventory/lib/customs-form"

import type { CustomsDocumentRow } from "./queries/customs-documents"

// Export draft dokumen BC ke PDF dan Excel (backlog M3-13, PRD 7.6) untuk membantu input manual
// ke portal CEISA selama MVP. Isinya semua bagian dokumen, urut seperti tab form.

export type ExportDocument = {
  number: string
  ajuNumber: string | null
  ajuDate: string | null
  status: CustomsDocumentStatus
  registrationNumber: string | null
  registrationDate: string | null
  companyName: string
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
  const fieldPairs = (items: CustomsFieldItem[]): [string, string][] =>
    items.map((item) =>
      isFieldGroup(item)
        ? [
            item.group,
            item.fields.map((field) => show(field, customsFieldValue(draft, field))).join(" "),
          ]
        : [item.label, show(item, customsFieldValue(draft, item))],
    )
  const cell = (column: CustomsField, row: Record<string, unknown>) => {
    if (column.kind === "file") {
      return (row as unknown as CustomsAttachmentDraft).file?.fileName ?? "—"
    }
    return show(column, row[column.key] as string | undefined)
  }
  const table = (columns: CustomsField[], rows: Record<string, unknown>[]): Table => ({
    columns: ["Seri", ...columns.map((column) => column.label)],
    rows: rows.map((row, index) => [String(index + 1), ...columns.map((c) => cell(c, row))]),
  })

  // Header seperti form hmx (H-03): nomor urut, transfer yang dipilih, No. Aju, No. Daftar,
  // Tgl. Daftar, Perusahaan.
  const topValue = (field: CustomsField) => {
    switch (field.key) {
      case "number":
        return doc.number
      case "company":
        return doc.companyName || "—"
      case "transfers":
        return draft.transfers.map((transfer) => transfer.number).join(", ") || "—"
      default:
        return show(field, customsFieldValue(draft, field))
    }
  }
  const sections: ExportSection[] = [
    {
      title: "Dokumen",
      fields: [
        ["Jenis dokumen", `${spec.title} (${spec.code})`],
        ...spec.top.map((field): [string, string] => [field.label, topValue(field)]),
        ["Status", CUSTOMS_DOCUMENT_STATUS_LABELS[doc.status]],
      ],
    },
  ]
  for (const tab of spec.tabs) {
    const fields = tab.blocks.flatMap((block) =>
      isListBlock(block)
        ? []
        : fieldPairs(block.fields).map(([label, value]): [string, string] => [
            block.title && block.title !== tab.label ? `${block.title} · ${label}` : label,
            value,
          ]),
    )
    if (fields.length) sections.push({ title: tab.label, fields })
    for (const block of tab.blocks) {
      if (!isListBlock(block)) continue
      if (block.list === "lines") {
        sections.push(...lineSections(spec, draft, show))
        continue
      }
      const rows: Record<string, unknown>[] =
        block.list === "owners"
          ? draft.parties
              .filter((party) => party.entityTypeCode === OWNER_CODE)
              .map((party) => ({ ...party, ...party.details }))
          : block.list === "attachments"
            ? draft.attachments
            : block.list === "vdEntries"
              ? []
              : draft[block.list]
      sections.push({ title: block.title, table: table(block.columns, rows) })
    }
  }
  return sections
}

// Barang (kolom form Barang hmx dan jumlah dalam satuan stok), lalu Dokumen Lartas dan Voluntary
// Declaration per barang bila ada.
function lineSections(
  spec: CustomsFormSpec,
  draft: CustomsDocumentDraft,
  show: (field: CustomsFieldKind, value: string | undefined) => string,
): ExportSection[] {
  const fields = customsLineFields(spec)
  const sections: ExportSection[] = [
    {
      title: "Barang",
      table: {
        columns: [
          "Seri",
          "Product code",
          ...fields.map((f) => f.label),
          "Jumlah dalam Satuan Stok",
        ],
        rows: draft.lines.map((line, index) => [
          String(index + 1),
          line.product?.sku ?? "—",
          ...fields.map((field) => show(field, customsFieldValue(draft, field, line))),
          show({ kind: "qty" }, line.stockQty),
        ]),
      },
    },
  ]
  const lartas = spec.line.lartas
  if (lartas) {
    sections.push({
      title: lartas.title,
      table: {
        columns: ["Seri barang", ...lartas.columns.map((column) => column.label)],
        rows: draft.lines.flatMap((line, index) =>
          line.attachments.map((row) => [
            String(index + 1),
            ...lartas.columns.map((column) =>
              column.kind === "file"
                ? (row.file?.fileName ?? "—")
                : show(column, (row as unknown as Record<string, string>)[column.key]),
            ),
          ]),
        ),
      },
    })
  }
  const vd = spec.line.blocks.find(
    (block): block is CustomsListBlock => isListBlock(block) && block.list === "vdEntries",
  )
  if (vd) {
    sections.push({
      title: "Voluntary Declaration",
      table: {
        columns: ["Seri barang", ...vd.columns.map((column) => column.label)],
        rows: draft.lines.flatMap((line, index) =>
          line.vdEntries.map((row) => [
            String(index + 1),
            ...vd.columns.map((column) => show(column, row[column.key])),
          ]),
        ),
      },
    })
  }
  return sections
}

const DRAFT_NOTE = "Draft untuk input manual ke portal CEISA, bukan dokumen resmi."

// Excel: satu sheet per bagian; isian sebagai pasangan label–nilai, baris berulang sebagai tabel.
export async function customsExportExcel(spec: CustomsFormSpec, doc: ExportDocument) {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = "IT Inventory"
  const names = new Set<string>()
  for (const section of customsExportSections(spec, doc)) {
    // Nama sheet maksimal 31 karakter dan harus unik.
    let name = section.title.slice(0, 31)
    for (let index = 2; names.has(name); index++) name = `${section.title.slice(0, 27)} (${index})`
    names.add(name)
    const sheet = workbook.addWorksheet(name)
    sheet.addRow([`${spec.title} ${doc.number} · ${section.title}`]).font = { bold: true }
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

// Rekap daftar BC menggunakan kolom dan urutan yang sama dengan list view.
export async function customsListExport(
  spec: CustomsFormSpec | null,
  rows: CustomsDocumentRow[],
  format: "pdf" | "xlsx",
) {
  const columns = [
    "Nomor",
    ...(!spec ? ["Jenis dokumen"] : []),
    "No. Aju",
    "No. Daftar",
    "Tgl. Daftar",
    "Kantor Pabean Pengawasan",
    "Status",
  ]
  const values = rows.map((row) => [
    row.number,
    ...(!spec ? [CUSTOMS_DOC_CODE_LABELS[row.docCode]] : []),
    row.ajuNumber ?? "—",
    row.registrationNumber ?? "—",
    date(row.registrationDate),
    row.officeName ?? row.officeCode ?? "—",
    CUSTOMS_DOCUMENT_STATUS_LABELS[row.status],
  ])
  if (format === "xlsx") {
    const workbook = new ExcelJS.Workbook()
    workbook.creator = "IT Inventory"
    const sheet = workbook.addWorksheet(spec?.title ?? "Daftar dokumen")
    sheet.addRow(columns).font = { bold: true }
    values.forEach((row) => sheet.addRow(row))
    sheet.columns.forEach((column) => {
      column.width = 26
    })
    sheet.views = [{ state: "frozen", ySplit: 1 }]
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: Math.max(1, rows.length + 1), column: columns.length },
    }
    return Buffer.from(await workbook.xlsx.writeBuffer())
  }
  const pdf = await PDFDocument.create()
  pdf.setTitle(spec ? `Daftar ${spec.title}` : "Daftar dokumen")
  pdf.setCreator("IT Inventory")
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const writer = new PdfWriter(pdf, regular, bold)
  writer.text(spec ? `Daftar ${spec.title}` : "Daftar dokumen", { font: bold, size: 14 })
  writer.text(`${rows.length} dokumen`, { size: 9 })
  if (!rows.length) writer.text("Tidak ada dokumen.")
  for (const row of values) {
    writer.gap(10)
    writer.rule()
    columns.forEach((column, index) => writer.field(column, row[index]))
  }
  return pdf.save()
}

// PDF A4: judul, catatan draft, lalu setiap bagian. Tabel ditulis per baris sebagai label: nilai
// supaya muat di kertas tegak. Font standar PDF hanya Latin-1; karakter lain diganti "?".
export async function customsExportPdf(spec: CustomsFormSpec, doc: ExportDocument) {
  const pdf = await PDFDocument.create()
  pdf.setTitle(`${spec.title} ${doc.number}`)
  pdf.setCreator("IT Inventory")
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const writer = new PdfWriter(pdf, regular, bold)

  writer.text(`${spec.title} ${doc.number}`, { font: bold, size: 14 })
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
