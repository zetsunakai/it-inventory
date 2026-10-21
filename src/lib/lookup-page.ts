// Batas lookup tetap 20; satu hasil ekstra hanya untuk mendeteksi halaman berikutnya.
export function lookupPage(params: URLSearchParams) {
  const raw = params.get("page") ?? "1"
  const page = /^\d+$/.test(raw) ? Math.min(5000, Math.max(1, Number(raw))) : 1
  return { offset: (page - 1) * 20, limit: 20 }
}

export function lookupResponse<T>(items: T[], limit: number) {
  return { items: items.slice(0, limit), hasMore: items.length > limit }
}
