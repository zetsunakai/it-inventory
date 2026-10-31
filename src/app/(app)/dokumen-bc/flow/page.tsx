import { redirect } from "next/navigation"

// Tautan lama tetap berfungsi, tetapi rantai dokumen tidak lagi ditampilkan.
export default function DocumentChainPage() {
  redirect("/dokumen-bc")
}
