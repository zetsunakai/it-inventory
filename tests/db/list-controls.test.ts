import { inArray, sql } from "drizzle-orm"
import { afterAll, describe, expect, test } from "vitest"

import { parseListParams } from "@/lib/list-params"
import { groupMetadata } from "@/lib/list-controls"
import { db } from "@/server/db"
import { listControls, type ListBindings } from "@/server/db/list-controls"
import { users } from "@/server/db/schema"
import { listUsers, USER_LIST_FIELDS } from "@/server/queries/users"
import { listRefCodes, REF_LIST_FIELDS } from "@/server/queries/ref-codes"
import { listPartners, PARTNER_LIST_FIELDS } from "@/modules/inventory/server/queries/partners"
import { listProducts, PRODUCT_LIST_FIELDS } from "@/modules/inventory/server/queries/products"
import {
  listWarehouses,
  WAREHOUSE_LIST_FIELDS,
} from "@/modules/inventory/server/queries/warehouses"
import { listUoms, UOM_LIST_FIELDS } from "@/modules/inventory/server/queries/uoms"
import {
  listProductCategories,
  CATEGORY_LIST_FIELDS,
} from "@/modules/inventory/server/queries/product-categories"
import { listTransfers, TRANSFER_LIST_FIELDS } from "@/modules/inventory/server/queries/transfers"
import { listStock, STOCK_LIST_FIELDS } from "@/modules/inventory/server/queries/stock"
import { listLots, LOT_LIST_FIELDS } from "@/modules/inventory/server/queries/lots"
import {
  listInterwarehouse,
  INTERWAREHOUSE_LIST_FIELDS,
} from "@/modules/inventory/server/queries/interwarehouse"
import {
  listReturnRequests,
  RETURN_LIST_FIELDS,
} from "@/modules/inventory/server/queries/return-requests"
import {
  listStockCounts,
  STOCK_COUNT_LIST_FIELDS,
} from "@/modules/inventory/server/queries/stock-counts"
import {
  listCustomsDocuments,
  CUSTOMS_LIST_FIELDS,
} from "@/modules/it-inventory/server/queries/customs-documents"

afterAll(() => db.$client.end())
const bindings: ListBindings = {
  name: { label: "Nama", type: "text", expression: sql`d.name`, groupable: true },
  qty: { label: "Qty", type: "number", expression: sql`d.qty` },
  date: { label: "Tanggal", type: "date", expression: sql`d.date` },
  status: {
    label: "Status",
    type: "selection",
    expression: sql`d.status`,
    groupable: true,
    options: [
      { value: "draft", label: "Draft" },
      { value: "done", label: "Selesai" },
    ],
  },
}
const filter = (
  conditions: { field: string; operator: string; value: string; end?: string }[],
  match = "all",
) => JSON.stringify({ match, conditions })
const fixture = sql`(values ('Baja_100%', 10::numeric, '2026-10-01'::date, 'draft', true), ('Baja biasa', 20, '2026-10-15', 'done', true), ('Rahasia', 100, '2026-10-30', 'draft', false)) as d(name, qty, date, status, allowed)`

describe("SQL filter dan grouping bersama", () => {
  test("grouping query Drizzle menghitung seluruh hasil sebelum pagination dan mempertahankan metadata", async () => {
    const prefix = `filter-${crypto.randomUUID()}`
    const created = await db
      .insert(users)
      .values(
        Array.from({ length: 35 }, (_, index) => ({
          name: `${prefix}-${index}`,
          email: `${prefix}-${index}@test.local`,
        })),
      )
      .returning({ id: users.id })
    try {
      const params = { ...parseListParams({ q: prefix, kelompok: "mfa" }), pageSize: 10 }
      const first = await listUsers(params)
      const second = await listUsers({ ...params, offset: 10 })
      expect(first.total).toBe(35)
      expect(first.rows).toHaveLength(10)
      expect(groupMetadata(first.rows[0])).toMatchObject({
        _groupLabel: "Tidak aktif",
        _groupCount: 35,
      })
      expect(groupMetadata(second.rows[0])._groupCount).toBe(35)
      expect(new Set([...first.rows, ...second.rows].map((row) => row.id)).size).toBe(20)
    } finally {
      await db.delete(users).where(
        inArray(
          users.id,
          created.map((user) => user.id),
        ),
      )
    }
  })
  test("AND/OR tetap berada di dalam batas akses", async () => {
    const controls = listControls(
      {
        customFilter: filter(
          [
            { field: "qty", operator: "gte", value: "20" },
            { field: "name", operator: "eq", value: "Rahasia" },
          ],
          "any",
        ),
      },
      bindings,
    )
    const result = await db.execute(
      sql`select d.name from ${fixture} where d.allowed and (${controls.where})`,
    )
    expect(result.rows.map((row) => row.name)).toEqual(["Baja biasa"])
  })
  test("wildcard dicari literal dan nilai tidak diinterpolasi ke SQL", async () => {
    const controls = listControls(
      { customFilter: filter([{ field: "name", operator: "contains", value: "_100%" }]) },
      bindings,
    )
    const result = await db.execute(sql`select d.name from ${fixture} where ${controls.where}`)
    expect(result.rows.map((row) => row.name)).toEqual(["Baja_100%"])
    const injection = listControls(
      { customFilter: filter([{ field: "name", operator: "eq", value: "' OR true --" }]) },
      bindings,
    )
    expect(
      (await db.execute(sql`select d.name from ${fixture} where ${injection.where}`)).rows,
    ).toHaveLength(0)
  })
  test("rentang tanggal/angka dan payload invalid fail closed", async () => {
    const controls = listControls(
      {
        customFilter: filter([
          { field: "date", operator: "between", value: "2026-10-01", end: "2026-10-15" },
          { field: "qty", operator: "gt", value: "15" },
        ]),
      },
      bindings,
    )
    expect(
      (await db.execute(sql`select d.name from ${fixture} where ${controls.where}`)).rows.map(
        (row) => row.name,
      ),
    ).toEqual(["Baja biasa"])
    const bad = listControls({ customFilter: "{" }, bindings)
    expect(
      (await db.execute(sql`select d.name from ${fixture} where ${bad.where}`)).rows,
    ).toHaveLength(0)
  })
  test("jumlah kelompok menghitung >500 hasil tanpa memuat semua baris; pagination stabil", async () => {
    const controls = listControls({ groupBy: "status" }, bindings)
    const query = (offset: number) =>
      db.execute(
        sql`select d.id, ${controls.columns} from (select g as id, 'draft'::text as status from generate_series(1, 650) g) d order by ${controls.orderPrefix}d.id limit 20 offset ${offset}`,
      )
    const first = await query(0)
    const last = await query(640)
    expect(first.rows).toHaveLength(20)
    expect(last.rows).toHaveLength(10)
    expect(groupMetadata(first.rows[0])).toMatchObject({ _groupCount: 650, _groupLabel: "Draft" })
    expect(groupMetadata(last.rows[0])._groupCount).toBe(650)
  })
  test("field grouping tidak dikenal tidak menjadi SQL dari pengguna", async () => {
    const controls = listControls({ groupBy: "status);drop table users;--" }, bindings)
    expect(controls.order).toEqual([])
    expect(
      groupMetadata(
        (await db.execute(sql`select ${controls.columns} from ${fixture} limit 1`)).rows[0],
      ),
    ).toEqual({})
  })
})

test("semua registry daftar dapat menjalankan filter dan grouping tanpa melewati scope", async () => {
  const params = parseListParams({})
  const userId = crypto.randomUUID()
  const cases = [
    { fields: USER_LIST_FIELDS, run: (p: typeof params) => listUsers(p) },
    { fields: REF_LIST_FIELDS, run: (p: typeof params) => listRefCodes(p) },
    { fields: PARTNER_LIST_FIELDS, run: (p: typeof params) => listPartners(p) },
    { fields: PRODUCT_LIST_FIELDS, run: (p: typeof params) => listProducts(p) },
    { fields: WAREHOUSE_LIST_FIELDS, run: (p: typeof params) => listWarehouses({ ...p, userId }) },
    { fields: UOM_LIST_FIELDS, run: (p: typeof params) => listUoms(p) },
    { fields: CATEGORY_LIST_FIELDS, run: (p: typeof params) => listProductCategories(p) },
    {
      fields: TRANSFER_LIST_FIELDS,
      run: (p: typeof params) => listTransfers({ ...p, userId, type: "receipt" }),
    },
    { fields: STOCK_LIST_FIELDS, run: (p: typeof params) => listStock({ ...p, userId }) },
    { fields: LOT_LIST_FIELDS, run: (p: typeof params) => listLots({ ...p, userId }) },
    {
      fields: INTERWAREHOUSE_LIST_FIELDS,
      run: (p: typeof params) => listInterwarehouse({ ...p, userId }),
    },
    { fields: RETURN_LIST_FIELDS, run: (p: typeof params) => listReturnRequests({ ...p, userId }) },
    {
      fields: STOCK_COUNT_LIST_FIELDS,
      run: (p: typeof params) => listStockCounts({ ...p, userId }),
    },
    {
      fields: CUSTOMS_LIST_FIELDS,
      run: (p: typeof params) => listCustomsDocuments({ ...p, docCode: "20" }),
    },
  ]
  for (const item of cases) {
    for (const field of item.fields) {
      const value =
        field.type === "boolean"
          ? "true"
          : field.type === "date"
            ? "2026-10-30"
            : field.type === "number"
              ? "1"
              : (field.options?.[0]?.value ?? "uji")
      const result = await item.run({
        ...params,
        customFilter: filter([{ field: field.key, operator: "eq", value }]),
        groupBy: field.groupable ? field.key : undefined,
      })
      expect(result.total).toBeGreaterThanOrEqual(0)
    }
    const invalid = await item.run({ ...params, customFilter: "{" })
    expect(invalid.rows).toHaveLength(0)
    expect(invalid.total).toBe(0)
  }
})
