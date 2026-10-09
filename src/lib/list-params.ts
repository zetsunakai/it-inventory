import { z } from "zod"

// Parameter URL untuk halaman daftar: pencarian, filter, dan pagination
// dijalankan di server, jadi state-nya disimpan di URL (bisa di-bookmark dan dibagikan).

export type RawSearchParams = Record<string, string | string[] | undefined>

export const SEARCH_PARAM = "q"
export const PAGE_PARAM = "page"
export const DEFAULT_PAGE_SIZE = 20

const listSchema = z.object({
  [SEARCH_PARAM]: z.string().trim().max(100).catch(""),
  [PAGE_PARAM]: z.coerce.number().int().min(1).catch(1),
})

export type ListParams = {
  search: string
  page: number
  pageSize: number
  offset: number
}

// Nilai yang tidak valid diabaikan (kembali ke default), tidak menjadi error.
export function parseListParams(
  raw: RawSearchParams,
  { pageSize = DEFAULT_PAGE_SIZE } = {},
): ListParams {
  const parsed = listSchema.parse({
    [SEARCH_PARAM]: first(raw[SEARCH_PARAM]) ?? "",
    [PAGE_PARAM]: first(raw[PAGE_PARAM]) ?? 1,
  })
  const page = parsed[PAGE_PARAM]
  return { search: parsed[SEARCH_PARAM], page, pageSize, offset: (page - 1) * pageSize }
}

// Filter berupa pilihan tertutup: nilai di luar daftar diabaikan.
export function pickFilter<T extends string>(
  raw: RawSearchParams,
  name: string,
  allowed: readonly T[],
): T | undefined {
  const value = first(raw[name])
  return allowed.find((option) => option === value)
}

export function pageCount(total: number, pageSize: number) {
  return Math.max(1, Math.ceil(total / pageSize))
}

// Query string untuk halaman lain dengan filter yang sama. Halaman 1 tidak ditulis.
export function pageHref(raw: RawSearchParams, page: number) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(raw)) {
    const single = first(value)
    if (key !== PAGE_PARAM && single) params.set(key, single)
  }
  if (page > 1) params.set(PAGE_PARAM, String(page))
  const query = params.toString()
  return query ? `?${query}` : "?"
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

// Ada pencarian atau filter yang aktif (selain nomor halaman)?
export function hasActiveFilters(raw: RawSearchParams) {
  return Object.entries(raw).some(([key, value]) => key !== PAGE_PARAM && Boolean(first(value)))
}
