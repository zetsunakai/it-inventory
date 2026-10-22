import "server-only"

import { eq, inArray, sql } from "drizzle-orm"

import type { InventoryCategory, UsageType } from "@/modules/inventory/lib/inventory"
import {
  DEMO_SCENARIOS,
  PENDING_EXPORT_SHORTFALL,
  demoScenario,
  type DemoPartner,
  type DemoScenario,
  type DemoScenarioKey,
  type DemoUom,
} from "@/modules/inventory/lib/demo-scenarios"
import { AppError } from "@/server/actions/app-error"
import { db } from "@/server/db"
import type { Transaction } from "@/server/db/audit"
import {
  interwarehouseTransferLines,
  interwarehouseTransfers,
  locations,
  partners,
  products,
  returnRequestLines,
  returnRequests,
  stockMoves,
  transferLines,
  transfers,
  uoms,
  warehouses,
} from "@/server/db/schema"

// Data demo inventory mode pure backend (seperti generator demo hmx-002 tanpa AI): satu dari 10
// studi kasus industri kawasan berikat (lib/demo-scenarios.ts) dijalankan sebagai alur 45 hari.
// Semua lewat alur nyata: transfer dibuat lalu dikonfirmasi/divalidasi oleh fungsi database yang
// sama dengan tombol di aplikasi, tidak ada saldo atau status Selesai yang ditulis langsung.
// Riwayat divalidasi sebagai proses sistem (tanggal efektif mundur hanya untuk sistem/Manajer,
// I-06); scrap dan penyesuaian disetujui Administrator yang menekan tombol. Bisa berulang: master
// studi kasus dibuat sekali lalu dipakai ulang, setiap putaran menambah satu siklus dengan nomor
// batch dan referensi baru. Saldo tetap konsisten karena setiap putaran memasukkan bahan sebelum
// memakainya pada tanggal yang sama.

// Di server produksi data demo hanya untuk server demo (DEMO_DATA_ENABLED=true).
export function inventoryDemoAllowed() {
  return process.env.NODE_ENV !== "production" || process.env.DEMO_DATA_ENABLED === "true"
}

const runScope = (key: DemoScenarioKey) => `inventory_demo:${key}`

// Jumlah putaran yang sudah dibuat per studi kasus (untuk dialog tombol).
export async function inventoryDemoRuns(): Promise<Partial<Record<DemoScenarioKey, number>>> {
  const { rows } = await db.execute<{ scope: string; last: number }>(sql`
    select scope, last_value as last from number_sequences
    where scope like 'inventory_demo:%' and period = 'all'`)
  return Object.fromEntries(
    DEMO_SCENARIOS.flatMap((scenario) => {
      const row = rows.find((entry) => entry.scope === runScope(scenario.key))
      return row ? [[scenario.key, row.last]] : []
    }),
  )
}

export type DemoSummary = {
  scenario: DemoScenarioKey
  // Putaran ke berapa untuk studi kasus ini (1 = pertama, master ikut dibuat).
  run: number
  transfers: number
}

type PartnerRole = keyof DemoScenario["partners"]
type LocationKey = "material" | "local" | "waste" | "finished"
// Kunci produk: kunci bahan, "packaging", "finishedA", "finishedB", atau "scrap".
type Line = [product: string, qty: number]

// Hari ini dikurangi `daysAgo`, pukul 10.00 WIB.
function dayAt(daysAgo: number) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date())
  const date = new Date(`${today}T10:00:00+07:00`)
  date.setUTCDate(date.getUTCDate() - daysAgo)
  return date.toISOString()
}

function dateOnly(daysFromToday: number) {
  const date = new Date(`${dayAt(0).slice(0, 10)}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + daysFromToday)
  return date.toISOString().slice(0, 10)
}

const pad = (value: number) => String(value).padStart(2, "0")

// Master per studi kasus: gudang bahan baku dan barang jadi, empat lokasi, produk, dan partner.
function masterPlan(scenario: DemoScenario, index: number) {
  const p = scenario.prefix
  const title = scenario.title.toLowerCase()
  const productList: {
    key: string
    sku: string
    name: string
    category: InventoryCategory
    uom: DemoUom
    hs: string
  }[] = [
    ...scenario.materials.map((entry) => ({ ...entry, category: "raw_material" as const })),
    { key: "packaging", ...scenario.packaging, uom: "PCS", category: "raw_material" },
    { key: "finishedA", ...scenario.finished[0], category: "finished_good" },
    { key: "finishedB", ...scenario.finished[1], category: "finished_good" },
    { key: "scrap", ...scenario.scrap, uom: "KG", category: "scrap" },
  ]
  const roles = Object.keys(scenario.partners) as PartnerRole[]
  const locationPlan: Record<
    LocationKey,
    { code: string; name: string; warehouse: "raw" | "finished" }
  > = {
    material: { code: `${p}-GBB-IMP`, name: "Rak bahan impor", warehouse: "raw" },
    local: { code: `${p}-GBB-LOK`, name: "Rak bahan lokal dan kemasan", warehouse: "raw" },
    waste: { code: `${p}-GBB-WASTE`, name: "Area sisa produksi", warehouse: "raw" },
    finished: { code: `${p}-GBJ-A`, name: "Rak barang jadi", warehouse: "finished" },
  }
  return {
    warehouses: {
      raw: { code: `${p}-GBB`, name: `Gudang Bahan Baku (demo ${title})` },
      finished: { code: `${p}-GBJ`, name: `Gudang Barang Jadi (demo ${title})` },
    },
    locations: locationPlan,
    products: productList,
    partners: roles.map((role, position) => {
      const [name, address, country] = scenario.partners[role] as DemoPartner
      // NPWP 16 digit fiktif untuk partner Indonesia (format saja, unik per studi kasus dan peran).
      const npwp =
        country === "ID" ? `09${pad(index + 1)}${"0".repeat(10)}${pad(position + 1)}` : null
      return {
        role,
        code: `${p}-${role.endsWith("Vendor") ? "V" : "C"}-${pad(position + 1)}`,
        name,
        address,
        countryCode: country,
        npwp,
      }
    }),
  }
}

export async function generateInventoryDemo(
  tx: Transaction,
  adminId: string,
  scenarioKey: DemoScenarioKey,
): Promise<DemoSummary> {
  const scenario = demoScenario(scenarioKey)
  const plan = masterPlan(
    scenario,
    DEMO_SCENARIOS.findIndex((entry) => entry.key === scenarioKey),
  )
  const {
    rows: [{ run }],
  } = await tx.execute<{ run: number }>(
    sql`select next_number(${runScope(scenarioKey)}, 'all') as run`,
  )
  // Nomor putaran dua digit di nomor batch dan referensi, mis. KM-2601, INV-GRM-0101.
  const tag = pad(run)
  const ref = (kind: string, suffix: string) => `${kind}-${scenario.prefix}-${tag}${suffix}`
  const [batchA, batchB] = scenario.batch.map((code) => `${code}-26${tag}`)

  // Lokasi virtual dan satuan dari seed utama.
  const base = await tx
    .select({ id: locations.id, code: locations.code })
    .from(locations)
    .where(inArray(locations.code, ["VENDOR", "CUSTOMER", "SCRAP", "PENYESUAIAN", "TRANSIT"]))
  const baseId = (code: string) => {
    const row = base.find((entry) => entry.code === code)
    if (!row) {
      throw new AppError(`Lokasi ${code} dari seed utama belum ada. Jalankan npm run db:seed.`)
    }
    return row.id
  }
  const vendor = baseId("VENDOR")
  const customer = baseId("CUSTOMER")
  const scrap = baseId("SCRAP")
  const adjustment = baseId("PENYESUAIAN")
  const transit = baseId("TRANSIT")
  const unitRows = await tx
    .select({ id: uoms.id, code: uoms.code })
    .from(uoms)
    .where(inArray(uoms.code, [...new Set(plan.products.map((entry) => entry.uom))]))
  const unit = (code: string) => {
    const row = unitRows.find((entry) => entry.code === code)
    if (!row) {
      throw new AppError(`Satuan ${code} dari seed utama belum ada. Jalankan npm run db:seed.`)
    }
    return row.id
  }

  // ----- Master ----- (dibuat sekali; putaran berikutnya memakai yang sudah ada, dicari lewat
  // kodenya; satu insert per tabel untuk yang belum ada)
  const idOf = (rows: { id: string; code: string | null }[], code: string) =>
    rows.find((row) => row.code === code)!.id

  const warehouseList = Object.values(plan.warehouses)
  const warehouseRows = await tx
    .select({ id: warehouses.id, code: warehouses.code })
    .from(warehouses)
    .where(
      inArray(
        warehouses.code,
        warehouseList.map((entry) => entry.code),
      ),
    )
  const newWarehouses = warehouseList.filter(
    (entry) => !warehouseRows.some((row) => row.code === entry.code),
  )
  if (newWarehouses.length) {
    warehouseRows.push(
      ...(await tx
        .insert(warehouses)
        .values(newWarehouses.map((entry) => ({ ...entry, address: scenario.location })))
        .returning({ id: warehouses.id, code: warehouses.code })),
    )
  }
  const warehouseId = {
    raw: idOf(warehouseRows, plan.warehouses.raw.code),
    finished: idOf(warehouseRows, plan.warehouses.finished.code),
  }

  const locationList = Object.values(plan.locations)
  const locationRows = await tx
    .select({ id: locations.id, code: locations.code })
    .from(locations)
    .where(
      inArray(
        locations.code,
        locationList.map((entry) => entry.code),
      ),
    )
  const newLocations = locationList.filter(
    (entry) => !locationRows.some((row) => row.code === entry.code),
  )
  if (newLocations.length) {
    locationRows.push(
      ...(await tx
        .insert(locations)
        .values(
          newLocations.map((entry) => ({
            code: entry.code,
            name: entry.name,
            type: "internal" as const,
            warehouseId: warehouseId[entry.warehouse],
          })),
        )
        .returning({ id: locations.id, code: locations.code })),
    )
  }
  const location: Record<LocationKey, string> = {
    material: idOf(locationRows, plan.locations.material.code),
    local: idOf(locationRows, plan.locations.local.code),
    waste: idOf(locationRows, plan.locations.waste.code),
    finished: idOf(locationRows, plan.locations.finished.code),
  }
  if (newWarehouses.length) {
    await tx
      .update(warehouses)
      .set({
        stockLocationId: sql`case ${warehouses.id}
          when ${warehouseId.raw}::uuid then ${location.material}::uuid
          else ${location.finished}::uuid end`,
      })
      .where(inArray(warehouses.id, [warehouseId.raw, warehouseId.finished]))
  }

  const productRows = await tx
    .select({ id: products.id, code: products.sku })
    .from(products)
    .where(
      inArray(
        products.sku,
        plan.products.map((entry) => entry.sku),
      ),
    )
  const newProducts = plan.products.filter(
    (entry) => !productRows.some((row) => row.code === entry.sku),
  )
  if (newProducts.length) {
    productRows.push(
      ...(await tx
        .insert(products)
        .values(
          newProducts.map((entry) => ({
            sku: entry.sku,
            name: entry.name,
            category: entry.category,
            uomId: unit(entry.uom),
            hsCode: entry.hs,
          })),
        )
        .returning({ id: products.id, code: products.sku })),
    )
  }
  const product = Object.fromEntries(
    plan.products.map((entry) => [
      entry.key,
      { id: idOf(productRows, entry.sku), uomId: unit(entry.uom) },
    ]),
  ) as Record<string, { id: string; uomId: string }>

  const partnerRows = await tx
    .select({ id: partners.id, code: partners.code })
    .from(partners)
    .where(
      inArray(
        partners.code,
        plan.partners.map((entry) => entry.code),
      ),
    )
  const newPartners = plan.partners.filter(
    (entry) => !partnerRows.some((row) => row.code === entry.code),
  )
  if (newPartners.length) {
    partnerRows.push(
      ...(await tx
        .insert(partners)
        .values(
          newPartners.map((entry) => ({
            code: entry.code,
            name: entry.name,
            address: entry.address,
            countryCode: entry.countryCode,
            identityType: entry.npwp ? ("npwp16" as const) : ("other" as const),
            identityNumber: entry.npwp ?? entry.code,
            nitku: entry.npwp ? `${entry.npwp}000000` : null,
          })),
        )
        .returning({ id: partners.id, code: partners.code })),
    )
  }
  const partner = Object.fromEntries(
    plan.partners.map((entry) => [entry.role, idOf(partnerRows, entry.code)]),
  ) as Record<PartnerRole, string>

  // ----- Transaksi -----
  let transferCount = 0

  // Transfer + baris permintaan + pergerakannya (satu pergerakan per baris), seperti form.
  async function createTransfer(values: {
    type: "receipt" | "delivery" | "scrap" | "adjustment"
    from: string
    to: string
    lines: Line[]
    partner?: PartnerRole
    reference?: string
    reason?: string
    usageType?: UsageType
    scheduledDate?: string
  }) {
    const lines = values.lines.filter(([, qty]) => qty > 0)
    const [row] = await tx
      .insert(transfers)
      .values({
        type: values.type,
        sourceLocationId: values.from,
        destinationLocationId: values.to,
        partnerId: values.partner ? partner[values.partner] : null,
        reference: values.reference ?? null,
        reason: values.reason ?? null,
        usageType: values.usageType ?? null,
        scheduledDate: values.scheduledDate ?? null,
      })
      .returning({ id: transfers.id })
    const lineRows = await tx
      .insert(transferLines)
      .values(
        lines.map(([key, qty], position) => ({
          transferId: row.id,
          position,
          productId: product[key].id,
          inputQty: String(qty),
          inputUomId: product[key].uomId,
        })),
      )
      .returning({ id: transferLines.id, position: transferLines.position })
    await tx.insert(stockMoves).values(
      lines.map(([key, qty], position) => ({
        transferId: row.id,
        lineId: lineRows.find((line) => line.position === position)!.id,
        position,
        productId: product[key].id,
        inputQty: String(qty),
        inputUomId: product[key].uomId,
        sourceLocationId: values.from,
        destinationLocationId: values.to,
      })),
    )
    transferCount++
    return row.id
  }

  // Validasi bertanggal mundur sebagai proses sistem (app.user_id kosong), lalu pelaku
  // dikembalikan ke Administrator. Scrap/penyesuaian disetujui Administrator lebih dulu.
  async function validateOn(transferId: string, daysAgo: number, approve = false) {
    if (approve) {
      await tx
        .update(transfers)
        .set({ approvedAt: new Date(dayAt(daysAgo)), approvedBy: adminId })
        .where(eq(transfers.id, transferId))
    }
    await tx.execute(sql`select set_config('app.user_id', '', true)`)
    await tx.execute(sql`select validate_transfer(${transferId}, ${dayAt(daysAgo)}::timestamptz)`)
    await tx.execute(sql`select set_config('app.user_id', ${adminId}, true)`)
  }

  async function done(values: Parameters<typeof createTransfer>[0], daysAgo: number) {
    const id = await createTransfer(values)
    await validateOn(id, daysAgo, values.type === "scrap" || values.type === "adjustment")
    return id
  }

  // Retur dari transfer Selesai: permintaan → Konfirmasi → transfer retur divalidasi.
  async function returned(
    originId: string,
    type: "vendor" | "customer",
    [key, qty]: Line,
    reason: string,
    locationKey: LocationKey,
    partnerRole: PartnerRole,
    daysAgo: number,
  ) {
    const [request] = await tx
      .insert(returnRequests)
      .values({
        type,
        originId,
        partnerId: partner[partnerRole],
        locationId: location[locationKey],
        reason,
      })
      .returning({ id: returnRequests.id })
    await tx.insert(returnRequestLines).values({
      returnRequestId: request.id,
      position: 0,
      productId: product[key].id,
      qty: String(qty),
    })
    await tx.execute(sql`select confirm_return_request(${request.id})`)
    const [transfer] = await tx
      .select({ id: transfers.id })
      .from(transfers)
      .where(eq(transfers.returnRequestId, request.id))
    transferCount++
    await validateOn(transfer.id, daysAgo)
  }

  // Kemasan ke gudang barang jadi lewat transit: Konfirmasi membuat kaki keluar; kaki masuk dibuat
  // database setelah kaki keluar Selesai.
  async function interwarehouse(
    qty: number,
    reference: string,
    outDaysAgo: number,
    inDaysAgo?: number,
  ) {
    const [request] = await tx
      .insert(interwarehouseTransfers)
      .values({
        sourceLocationId: location.local,
        destinationLocationId: location.finished,
        transitLocationId: transit,
        reference,
      })
      .returning({ id: interwarehouseTransfers.id })
    await tx.insert(interwarehouseTransferLines).values({
      interwarehouseId: request.id,
      position: 0,
      productId: product.packaging.id,
      inputQty: String(qty),
      inputUomId: product.packaging.uomId,
    })
    await tx.execute(sql`select confirm_interwarehouse(${request.id})`)
    const leg = async (code: "itw_out" | "itw_in") => {
      const [row] = await tx
        .select({ id: transfers.id })
        .from(transfers)
        .where(
          sql`${transfers.interwarehouseId} = ${request.id} and ${transfers.movementCode} = ${code}`,
        )
      return row.id
    }
    transferCount += 2
    await validateOn(await leg("itw_out"), outDaysAgo)
    if (inDaysAgo !== undefined) await validateOn(await leg("itw_in"), inDaysAgo)
  }

  // Pemakaian satu batch: satu transfer per rak (bahan impor, bahan lokal) yang dipakai.
  const imports = scenario.materials.filter((entry) => entry.source === "import")
  const locals = scenario.materials.filter((entry) => entry.source === "local")
  async function usage(batch: 0 | 1, label: string, daysAgo: number) {
    const groups = [
      {
        from: location.material,
        lines: imports.map((entry): Line => [entry.key, entry.use[batch]]),
      },
      { from: location.local, lines: locals.map((entry): Line => [entry.key, entry.use[batch]]) },
    ].filter((group) => group.lines.some(([, qty]) => qty > 0))
    for (const group of groups) {
      await done(
        {
          type: "scrap",
          usageType: "usage",
          from: group.from,
          to: scrap,
          reason: `Pemakaian produksi ${label}`,
          lines: group.lines,
        },
        daysAgo,
      )
    }
  }

  const [a, b] = scenario.finished

  // H-45 s.d. H-40: bahan baku masuk (impor calon BC 2.3, lokal calon BC 4.0), kemasan.
  const importReceipt = await done(
    {
      type: "receipt",
      from: vendor,
      to: location.material,
      partner: "importVendor",
      reference: ref("INV", "01"),
      lines: imports.map((entry) => [entry.key, entry.receive]),
    },
    45,
  )
  await done(
    {
      type: "receipt",
      from: vendor,
      to: location.local,
      partner: "localVendor",
      reference: ref("SJ", "12"),
      lines: locals.map((entry) => [entry.key, entry.receive]),
    },
    42,
  )
  await done(
    {
      type: "receipt",
      from: vendor,
      to: location.local,
      partner: "packagingVendor",
      reference: ref("SJ", "57"),
      lines: [["packaging", scenario.packaging.receive]],
    },
    40,
  )
  // H-37: bahan impor cacat dikembalikan ke pemasok.
  await returned(
    importReceipt,
    "vendor",
    [scenario.defect.material, scenario.defect.qty],
    scenario.defect.reason,
    "material",
    "importVendor",
    37,
  )

  // H-35/H-34: pemakaian bahan untuk produksi (disetujui Administrator).
  await usage(0, `${a.name.toLowerCase()} batch ${batchA}`, 35)
  await usage(1, `${b.name.toLowerCase()} batch ${batchB}`, 34)

  // H-30/H-28: hasil produksi masuk gudang barang jadi, sisa produksi ke area sisa.
  await done(
    {
      type: "adjustment",
      from: adjustment,
      to: location.finished,
      reason: `Hasil produksi batch ${batchA} dan ${batchB}`,
      lines: [
        ["finishedA", a.produce],
        ["finishedB", b.produce],
      ],
    },
    30,
  )
  await done(
    {
      type: "adjustment",
      from: adjustment,
      to: location.waste,
      reason: `Sisa produksi batch ${batchA} dan ${batchB}`,
      lines: [["scrap", scenario.scrap.produce]],
    },
    28,
  )

  // H-25/H-24: kemasan dipindah ke gudang barang jadi untuk packing ekspor.
  await interwarehouse(scenario.packaging.move, ref("PACK", "01"), 25, 24)

  // H-20: ekspor. H-15: jual lokal. H-10: retur dari pembeli lokal.
  await done(
    {
      type: "delivery",
      from: location.finished,
      to: customer,
      partner: "exportBuyer",
      reference: ref("PO", "18"),
      lines: [
        ["finishedA", a.export],
        ["finishedB", b.export],
        ["packaging", scenario.packaging.exportUse],
      ],
    },
    20,
  )
  const localSale = await done(
    {
      type: "delivery",
      from: location.finished,
      to: customer,
      partner: "localBuyer",
      reference: ref("SO", "31"),
      lines: [["finishedB", b.local]],
    },
    15,
  )
  await returned(
    localSale,
    "customer",
    ["finishedB", b.returned],
    scenario.returnReason,
    "finished",
    "localBuyer",
    10,
  )
  // H-8: barang jadi reject di-scrap. H-5: sisa produksi dijual ke pengepul.
  await done(
    {
      type: "scrap",
      usageType: "scrap",
      from: location.finished,
      to: scrap,
      reason: scenario.rejectReason,
      lines: [["finishedA", a.reject]],
    },
    8,
  )
  await done(
    {
      type: "delivery",
      from: location.waste,
      to: customer,
      partner: "collector",
      reference: ref("SO", "21"),
      lines: [["scrap", scenario.scrap.sold]],
    },
    5,
  )
  // H-1: kemasan tambahan dikirim ke gudang barang jadi, masih di perjalanan.
  await interwarehouse(scenario.packaging.inTransit, ref("PACK", "02"), 1)

  // ----- Pekerjaan yang masih berjalan hari ini -----
  // Kontainer bahan impor berikutnya tiba, menunggu dibongkar (Siap).
  const container = await createTransfer({
    type: "receipt",
    from: vendor,
    to: location.material,
    partner: "importVendor",
    reference: ref("INV", "02"),
    scheduledDate: dateOnly(0),
    lines: [[scenario.pendingImport.material, scenario.pendingImport.qty]],
  })
  await tx.execute(sql`select confirm_transfer(${container})`)
  // Order bahan lokal berikutnya, masih Draft.
  await createTransfer({
    type: "receipt",
    from: vendor,
    to: location.local,
    partner: "localVendor",
    reference: ref("PO", "04"),
    scheduledDate: dateOnly(2),
    lines: [[scenario.pendingLocal.material, scenario.pendingLocal.qty]],
  })
  // Ekspor berikutnya melebihi sisa stok barang jadi A: Sebagian tersedia.
  const nextExport = await createTransfer({
    type: "delivery",
    from: location.finished,
    to: customer,
    partner: "exportBuyer2",
    reference: ref("PO", "81"),
    scheduledDate: dateOnly(1),
    lines: [["finishedA", a.produce - a.export - a.reject + PENDING_EXPORT_SHORTFALL]],
  })
  await tx.execute(sql`select confirm_transfer(${nextExport})`)
  // Jual lokal berikutnya, stok cukup: Siap.
  const nextLocal = await createTransfer({
    type: "delivery",
    from: location.finished,
    to: customer,
    partner: "localBuyer",
    reference: ref("SO", "12"),
    scheduledDate: dateOnly(0),
    lines: [["finishedB", b.localPending]],
  })
  await tx.execute(sql`select confirm_transfer(${nextLocal})`)
  // Bahan rusak menunggu persetujuan scrap Manajer.
  const damaged = scenario.materials.find((entry) => entry.key === scenario.damage.material)!
  const damageScrap = await createTransfer({
    type: "scrap",
    usageType: "scrap",
    from: damaged.source === "import" ? location.material : location.local,
    to: scrap,
    reason: scenario.damage.reason,
    scheduledDate: dateOnly(0),
    lines: [[damaged.key, scenario.damage.qty]],
  })
  await tx.execute(sql`select confirm_transfer(${damageScrap})`)

  return { scenario: scenarioKey, run, transfers: transferCount }
}
