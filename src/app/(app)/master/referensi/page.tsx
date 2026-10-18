import { redirect } from "next/navigation"

import { refCodeListHref } from "@/lib/ref-codes"

// Referensi kepabeanan kini satu menu per jenis (Master data IT Inventory); tautan lama ke daftar
// gabungan diarahkan ke jenis pertama di menu.
export default function RefCodesIndexPage() {
  redirect(refCodeListHref("ceisa_unit"))
}
