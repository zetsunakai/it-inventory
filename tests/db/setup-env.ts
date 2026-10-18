import { TEST_DATABASE_URL } from "../test-env"

// Dijalankan sebelum setiap file tes, sebelum file itu mengimpor @/server/db,
// supaya koneksi aplikasi mengarah ke database tes.
//
// Gerbang dokumen BC (M4-02) dimatikan untuk koneksi ini: tes inventory memvalidasi penerimaan dan
// pengiriman tanpa dokumen BC. Tes gerbang membuka koneksi sendiri lewat TEST_DATABASE_URL
// (gerbang aktif), lihat tests/db/customs-gate.test.ts.
const url = new URL(TEST_DATABASE_URL)
url.searchParams.set("options", "-c app.customs_gate=off")
process.env.DATABASE_URL = url.toString()
