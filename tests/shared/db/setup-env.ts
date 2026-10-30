import { TEST_DATABASE_URL } from "../test-env"

// Dijalankan sebelum setiap file tes, sebelum file itu mengimpor @/server/db,
// supaya koneksi aplikasi mengarah ke database tes.
process.env.DATABASE_URL = TEST_DATABASE_URL
