import { z } from "zod"

export const CUSTOM_FILTER_PARAM = "filter"
export const MAX_FILTER_CONDITIONS = 12
export type ListField = {
  key: string
  label: string
  type: "text" | "number" | "date" | "boolean" | "selection"
  groupable?: boolean
  options?: { value: string; label: string }[]
}

export const FILTER_OPERATORS = {
  eq: "sama dengan",
  ne: "tidak sama dengan",
  contains: "mengandung",
  not_contains: "tidak mengandung",
  gt: "lebih besar dari",
  gte: "minimal",
  lt: "lebih kecil dari",
  lte: "maksimal",
  between: "di antara",
  empty: "belum diisi",
  not_empty: "sudah diisi",
} as const
export type FilterOperator = keyof typeof FILTER_OPERATORS
export type FilterCondition = {
  field: string
  operator: FilterOperator
  value: string
  end?: string
}
export type CustomFilter = { match: "all" | "any"; conditions: FilterCondition[] }

const filterSchema = z.object({
  match: z.enum(["all", "any"]),
  conditions: z
    .array(
      z.object({
        field: z.string().max(80),
        operator: z.enum(Object.keys(FILTER_OPERATORS) as [FilterOperator, ...FilterOperator[]]),
        value: z.string().max(200),
        end: z.string().max(200).optional(),
      }),
    )
    .min(1)
    .max(MAX_FILTER_CONDITIONS),
})

export function operatorsFor(field: ListField): FilterOperator[] {
  if (field.type === "number" || field.type === "date")
    return ["eq", "ne", "gt", "gte", "lt", "lte", "between", "empty", "not_empty"]
  if (field.type === "text") return ["contains", "not_contains", "eq", "ne", "empty", "not_empty"]
  return ["eq", "ne", "empty", "not_empty"]
}

function validValue(field: ListField, value: string) {
  if (field.type === "number")
    return /^-?\d+(\.\d+)?$/.test(value) && Number.isFinite(Number(value))
  if (field.type === "date")
    return (
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      !value.startsWith("0000-") &&
      !Number.isNaN(Date.parse(value)) &&
      new Date(value).toISOString().slice(0, 10) === value
    )
  if (field.type === "boolean") return value === "true" || value === "false"
  if (field.type === "selection")
    return Boolean(field.options?.some((option) => option.value === value))
  return value.trim().length > 0
}

export function parseCustomFilter(
  raw: string | undefined | null,
  fields: readonly ListField[],
): { filter: CustomFilter | null; error?: string } {
  if (!raw) return { filter: null }
  try {
    if (raw.length > 8000) throw new Error()
    const filter = filterSchema.parse(JSON.parse(raw))
    for (const condition of filter.conditions) {
      const field = fields.find((field) => field.key === condition.field)
      if (!field || !operatorsFor(field).includes(condition.operator)) throw new Error()
      if (field.type === "number") {
        condition.value = condition.value.trim().replace(",", ".")
        if (condition.end !== undefined) condition.end = condition.end.trim().replace(",", ".")
      }
      if (["empty", "not_empty"].includes(condition.operator)) continue
      if (!validValue(field, condition.value)) throw new Error()
      if (condition.operator === "between") {
        if (!condition.end || !validValue(field, condition.end)) throw new Error()
        if (
          field.type === "number"
            ? Number(condition.value) > Number(condition.end)
            : condition.value > condition.end
        )
          throw new Error()
      }
    }
    return { filter }
  } catch {
    return {
      filter: null,
      error: "Filter kustom tidak valid. Periksa kondisi atau hapus filter untuk melanjutkan.",
    }
  }
}

export type ListGroupMetadata = {
  _groupKey: string | null
  _groupLabel: string | null
  _groupCount: number
}
export function groupMetadata(row: unknown): Partial<ListGroupMetadata> {
  if (!row || typeof row !== "object" || !("_groupKey" in row) || typeof row._groupKey !== "string")
    return {}
  if (!("_groupLabel" in row) || typeof row._groupLabel !== "string" || !("_groupCount" in row))
    return {}
  return {
    _groupKey: row._groupKey,
    _groupLabel: row._groupLabel,
    _groupCount: Number(row._groupCount),
  }
}
