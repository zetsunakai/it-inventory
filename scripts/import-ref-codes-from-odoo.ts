// Membuat ulang CSV seed referensi kepabeanan dari modul Odoo lama.
//
//   npx tsx scripts/import-ref-codes-from-odoo.ts <modul equip3_manuf_it_inventory> <odoo/addons/base/data>
//
// Hasilnya ditulis ke src/server/db/seed-data/ref-codes/<type>.csv (kolom code,name[,parent_code]),
// lalu dibaca oleh `npm run db:seed`. Jalankan hanya bila sumber data berubah, lalu commit CSV-nya.
// Nama negara dan valuta diambil dari data CLDR (Intl.DisplayNames) dalam bahasa Indonesia,
// karena Odoo hanya punya nama berbahasa Inggris.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"

import { parse } from "csv-parse/sync"
import { stringify } from "csv-stringify/sync"

import { REF_CODE_TYPES, type RefCodeType } from "../src/lib/ref-codes"

type Row = { code: string; name: string; parent_code?: string }

const OUT_DIR = path.join(import.meta.dirname, "../src/server/db/seed-data/ref-codes")

const [moduleDir, baseDataDir] = process.argv.slice(2)
if (!moduleDir || !baseDataDir) {
  console.error(
    "Pakai: npx tsx scripts/import-ref-codes-from-odoo.ts <modul equip3_manuf_it_inventory> <odoo/addons/base/data>",
  )
  process.exit(1)
}

const data = (file: string) => path.join(moduleDir, "data", file)

// Kode negara lama di UN/LOCODE yang tidak dikenal CLDR.
const COUNTRY_FALLBACK_NAMES: Record<string, string> = {
  AN: "Antillen Belanda",
  CS: "Serbia dan Montenegro",
  XZ: "Perairan internasional",
}

const sources: Record<RefCodeType, () => Row[]> = {
  document_type: () => odooRecords(data("document_type.xml")),
  customs_office: () => odooRecords(data("beacukai_office_data.xml")),
  domestic_port: () =>
    csvRows(data("files/national_ports.csv")).map((row) => ({ code: row.code, name: row.name })),
  // UN/LOCODE: dua huruf pertama adalah kode negara.
  foreign_port: () =>
    csvRows(data("files/overseas_ports.csv")).map((row) => ({
      code: row.code,
      name: row.name,
      parent_code: row.code.slice(0, 2),
    })),
  tps: () =>
    csvRows(data("files/storehouse_location.csv")).map((row) => ({
      code: row.code,
      name: row.nama,
      parent_code: row.office,
    })),
  country: () => countries(),
  currency: () => currencies(),
  package_type: () => odooRecords(data("package_type.xml")),
  container_size: () => odooRecords(data("container_data.xml")),
  container_type: () => odooRecords(data("container_type.xml")),
  facility: () => odooRecords(data("facilities_data.xml")),
  levy_type: () => odooRecords(data("tax_type.xml")),
  incoterm: () => odooRecords(data("incoterm_data.xml")),
  transport_mode: () => transportModes(),
  entity_type: () => odooRecords(data("entitas_type.xml")),
  response: () => odooRecords(data("respons_data.xml")),
}

function main() {
  mkdirSync(OUT_DIR, { recursive: true })
  for (const type of REF_CODE_TYPES) {
    const rows = clean(type, sources[type]())
    const columns = rows.some((row) => row.parent_code)
      ? ["code", "name", "parent_code"]
      : ["code", "name"]
    writeFileSync(path.join(OUT_DIR, `${type}.csv`), stringify(rows, { header: true, columns }))
    console.log(`${type}: ${rows.length} baris`)
  }
}

// Rapikan spasi, buang baris kosong, tolak kode ganda supaya seed tidak gagal diam-diam.
// Pengecualian: baris kedua dengan kode yang sama ditambah spasi di belakangnya. Di UN/LOCODE
// itu nama alternatif sebuah lokasi, di data TPS itu entri ganda. Baris tersebut dilewati.
function clean(type: RefCodeType, rows: Row[]): Row[] {
  const primaryKeys = new Set(
    rows.filter((row) => row.code === row.code.trim()).map((row) => keyOf(row)),
  )
  const seen = new Set<string>()
  const result: Row[] = []
  let skipped = 0
  for (const row of rows) {
    const code = squash(row.code)
    const name = squash(row.name)
    const parent = row.parent_code ? squash(row.parent_code) : undefined
    if (!code || !name) continue
    const key = keyOf({ code, name, parent_code: parent })
    if (row.code !== code && primaryKeys.has(key)) {
      skipped++
      continue
    }
    if (seen.has(key)) throw new Error(`${type}: kode ganda ${key}`)
    seen.add(key)
    result.push(parent ? { code, name, parent_code: parent } : { code, name })
  }
  if (skipped) console.log(`${type}: ${skipped} baris ganda berkode spasi dilewati`)
  return result.sort(
    (a, b) =>
      (a.parent_code ?? "").localeCompare(b.parent_code ?? "") || a.code.localeCompare(b.code),
  )
}

function keyOf(row: Row) {
  return `${row.parent_code?.trim() ?? ""}|${row.code.trim()}`
}

function squash(value: string) {
  return value.replace(/\s+/g, " ").trim()
}

// <record><field name="code">..</field><field name="name">..</field></record> dari data XML Odoo.
function odooRecords(file: string): Row[] {
  return records(readFileSync(file, "utf8")).map((fields) => ({
    code: fields.code ?? "",
    name: fields.name ?? "",
  }))
}

function records(xml: string) {
  return [...xml.matchAll(/<record\b[\s\S]*?<\/record>/g)].map(([record]) =>
    Object.fromEntries(
      [...record.matchAll(/<field name=["'](\w+)["'][^>]*?(?:\/>|>([\s\S]*?)<\/field>)/g)].map(
        ([, name, value]) => [name, decodeXml(value ?? "")],
      ),
    ),
  )
}

function decodeXml(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
}

function csvRows(file: string): Record<string, string>[] {
  return parse(readFileSync(file), { columns: true, bom: true, skip_empty_lines: true })
}

// Daftar kode negara dari Odoo base ditambah prefix negara yang dipakai pelabuhan luar negeri.
function countries(): Row[] {
  const xml = readFileSync(path.join(baseDataDir, "res_country_data.xml"), "utf8")
  const codes = new Set(
    records(xml)
      .map((fields) => fields.code?.toUpperCase())
      .filter(Boolean),
  )
  for (const port of sources.foreign_port()) codes.add(port.parent_code!)
  const names = new Intl.DisplayNames(["id"], { type: "region", fallback: "none" })
  return [...codes].map((code) => {
    const name = COUNTRY_FALLBACK_NAMES[code] ?? names.of(code)
    if (!name) throw new Error(`Nama negara untuk ${code} tidak ditemukan`)
    return { code, name }
  })
}

function currencies(): Row[] {
  const xml = readFileSync(path.join(baseDataDir, "res_currency_data.xml"), "utf8")
  const names = new Intl.DisplayNames(["id"], { type: "currency", fallback: "none" })
  return records(xml)
    .filter((fields) => /^[A-Z]{3}$/.test(fields.name ?? ""))
    .map((fields) => ({
      code: fields.name,
      name: names.of(fields.name) ?? fields.currency_unit_label ?? fields.name,
    }))
}

// Cara angkut di Odoo berupa pilihan tetap di model dokumen, bukan data XML.
function transportModes(): Row[] {
  const source = readFileSync(path.join(moduleDir, "models/ceisa_documents_bc23.py"), "utf8")
  const block = source.match(/transport_type_id = fields\.Selection\([\s\S]*?\]/)
  if (!block) throw new Error("Pilihan cara angkut tidak ditemukan di ceisa_documents_bc23.py")
  return [...block[0].matchAll(/\('(\w+)',\s*'([^']+)'\)/g)].map(([, code, name]) => ({
    code,
    name,
  }))
}

main()
