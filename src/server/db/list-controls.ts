import "server-only"

import { and, asc, or, sql, type SQL, type SQLWrapper } from "drizzle-orm"

import { parseCustomFilter, type ListField, type FilterCondition } from "@/lib/list-controls"
import type { ListParams } from "@/lib/list-params"
import { containsPattern } from "@/server/db/sql-helpers"

type Binding = Omit<ListField, "key"> & { expression: SQLWrapper }
export type ListBindings = Record<string, Binding>
export function listFields(bindings: ListBindings): ListField[] {
  return Object.entries(bindings).map(([key, field]) => ({
    key,
    label: field.label,
    type: field.type,
    groupable: field.groupable,
    options: field.options,
  }))
}

function conditionSql(condition: FilterCondition, field: Binding): SQL {
  const expression = field.expression
  const empty =
    field.type === "text"
      ? sql`(${expression} is null or ${expression}::text = '')`
      : sql`${expression} is null`
  const value = (raw: string) =>
    field.type === "number"
      ? sql`${raw}::numeric`
      : field.type === "date"
        ? sql`${raw}::date`
        : field.type === "boolean"
          ? sql`${raw}::boolean`
          : sql`${raw}`
  const column =
    field.type === "text" || field.type === "selection"
      ? sql`${expression}::text`
      : sql`${expression}`
  switch (condition.operator) {
    case "empty":
      return empty
    case "not_empty":
      return sql`not (${empty})`
    case "contains":
      return sql`${column} ilike ${containsPattern(condition.value)}`
    case "not_contains":
      return sql`(${column} is null or ${column} not ilike ${containsPattern(condition.value)})`
    case "eq":
      return sql`${column} = ${value(condition.value)}`
    case "ne":
      return sql`(${column} is null or ${column} <> ${value(condition.value)})`
    case "gt":
      return sql`${column} > ${value(condition.value)}`
    case "gte":
      return sql`${column} >= ${value(condition.value)}`
    case "lt":
      return sql`${column} < ${value(condition.value)}`
    case "lte":
      return sql`${column} <= ${value(condition.value)}`
    case "between":
      return sql`${column} between ${value(condition.value)} and ${value(condition.end!)}`
  }
}

// Kondisi kustom selalu di-AND dengan scope/ACL/filter cepat milik query pemanggil.
// Nama field dan ekspresi SQL berasal dari registry server, bukan dari URL pengguna.
export function listControls(
  params: Pick<ListParams, "customFilter" | "groupBy">,
  bindings: ListBindings,
) {
  const fields = listFields(bindings)
  const { filter, error } = parseCustomFilter(params.customFilter, fields)
  const clauses =
    filter?.conditions.map((condition) => conditionSql(condition, bindings[condition.field])) ?? []
  const where = error ? sql`false` : filter?.match === "any" ? or(...clauses) : and(...clauses)
  const group = params.groupBy ? bindings[params.groupBy] : undefined
  const expression = group?.groupable ? group.expression : undefined
  const key = expression
    ? sql<string>`coalesce(to_jsonb(${expression})::text, 'null')`
    : sql<null>`null::text`
  const options =
    group?.options ??
    (group?.type === "boolean"
      ? [
          { value: "true", label: "Ya" },
          { value: "false", label: "Tidak" },
        ]
      : [])
  const label =
    group && expression
      ? sql<string>`coalesce(nullif(${
          options.length
            ? sql`case ${expression}::text ${sql.join(
                options.map((option) => sql`when ${option.value} then ${option.label}`),
                sql` `,
              )} else ${expression}::text end`
            : sql`${expression}::text`
        }, ''), 'Tidak diisi')`
      : sql<null>`null::text`
  const selection = {
    _groupKey: key,
    _groupLabel: label,
    _groupCount: expression
      ? sql<number>`count(*) over (partition by ${expression})::int`
      : sql<number>`0::int`,
  }
  return {
    where,
    selection,
    order: expression ? [asc(expression)] : [],
    // Untuk query SQL manual, nama alias sengaja sama dengan hasil query Drizzle.
    columns: sql`${selection._groupKey} as "_groupKey", ${selection._groupLabel} as "_groupLabel", ${selection._groupCount} as "_groupCount"`,
    orderPrefix: expression ? sql`${expression} asc nulls last, ` : sql``,
  }
}
