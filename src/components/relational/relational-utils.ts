// Metadata lokal ikut object spread saat field diedit, tetapi diabaikan JSON.stringify.
export const RELATION_KEY = Symbol("relation-row")

type Identified = { [RELATION_KEY]?: string }

export function relationKey(row: object): string {
  const key = (row as Identified)[RELATION_KEY]
  if (!key) throw new Error("Baris relasi belum memiliki identitas")
  return key
}

export function identifyRelations<T>(value: T, path = "row"): T {
  if (Array.isArray(value)) {
    return value.map((entry, index) => identifyRelations(entry, `${path}-${index}`)) as T
  }
  if (value && typeof value === "object") {
    return {
      ...Object.fromEntries(
        Object.entries(value).map(([key, entry]) => [
          key,
          identifyRelations(entry, `${path}-${key}`),
        ]),
      ),
      [RELATION_KEY]: (value as Identified)[RELATION_KEY] ?? path,
    } as T
  }
  return value
}

export function newRelation<T>(row: T): T {
  return identifyRelations(row, crypto.randomUUID())
}

// Tampilan total tidak memakai floating point; koma dan titik adalah pemisah desimal input.
export function sumDecimals(values: string[]): string {
  const valid = values
    .map((value) => value.trim().replace(",", "."))
    .filter((value) => /^-?\d+(\.\d+)?$/.test(value))
  const scale = Math.max(0, ...valid.map((value) => value.split(".")[1]?.length ?? 0))
  const sum = valid.reduce((total, value) => {
    const negative = value.startsWith("-")
    const [integer, fraction = ""] = value.replace(/^-/, "").split(".")
    const units = BigInt(integer + fraction.padEnd(scale, "0"))
    return total + (negative ? -units : units)
  }, BigInt(0))
  const digits = (sum < BigInt(0) ? -sum : sum).toString().padStart(scale + 1, "0")
  const result = scale ? `${digits.slice(0, -scale)}.${digits.slice(-scale)}` : digits
  return `${sum < BigInt(0) ? "-" : ""}${result}`
}
