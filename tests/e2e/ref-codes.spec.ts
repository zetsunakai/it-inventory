import { expect, test } from "@playwright/test"

import { ACCOUNTS, ADMIN_STATE_FILE } from "./accounts"
import { login } from "./login"

// Referensi kepabeanan (backlog M1-01): seed terpasang, cari lewat kode atau nama,
// hanya Administrator yang bisa mengubah.

test.describe("Auditor", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login")
    await login(page, ACCOUNTS.auditor)
    await expect(page).toHaveURL(/\/$/)
  })

  test("melihat data seed dan mencari lewat kode atau nama, tanpa tombol ubah", async ({
    page,
  }) => {
    await page.goto("/master/referensi")
    await expect(page.getByRole("link", { name: "Tambah referensi" })).toHaveCount(0)

    await page.getByRole("searchbox", { name: "Cari kode atau nama" }).fill("IDJKT")
    await expect(page.getByRole("cell", { name: "Jakarta - Java" })).toBeVisible()

    await page.getByRole("searchbox", { name: "Cari kode atau nama" }).fill("tanjung priok")
    await expect(page.getByRole("cell", { name: "KPU Tanjung Priok" })).toBeVisible()
    await expect(
      page.getByRole("row").filter({ hasText: "KPU Tanjung Priok" }).getByRole("link"),
    ).toHaveCount(0)
  })

  test("tidak bisa membuka halaman tambah referensi", async ({ page }) => {
    await page.goto("/master/referensi/baru")
    await expect(page.getByRole("heading", { name: "Akses ditolak" })).toBeVisible()
  })
})

test.describe("Administrator", () => {
  test.use({ storageState: ADMIN_STATE_FILE })

  test("form tambah menampilkan semua kesalahan sekaligus", async ({ page }) => {
    await page.goto("/master/referensi/baru")
    await page.getByRole("button", { name: "Simpan" }).click()

    const errors = page.getByRole("alert").filter({ hasText: "wajib" })
    await expect(errors).toContainText("Jenis referensi wajib dipilih.")
    await expect(errors).toContainText("Kode wajib diisi.")
    await expect(errors).toContainText("Nama wajib diisi.")
  })

  test("menambah TPS dengan kantor pabean dari pilihan [kode] nama, lalu mengarsipkannya", async ({
    page,
  }) => {
    // Kode unik per run, karena di CI tes bisa diulang tanpa reset database.
    const code = `E2E${Date.now().toString(36).slice(-5).toUpperCase()}`

    await page.goto("/master/referensi/baru")
    await page.getByLabel("Jenis").click()
    await page.getByRole("option", { name: "TPS" }).click()

    const office = page.getByLabel("Kantor pabean")
    await office.fill("priok")
    await page.getByRole("option", { name: "[040300] KPU Tanjung Priok" }).click()
    await expect(office).toHaveValue("[040300] KPU Tanjung Priok")

    await page.getByLabel("Kode").fill(code)
    await page.getByLabel("Nama").fill("TPS Uji E2E")
    await page.getByRole("button", { name: "Simpan" }).click()

    // Kembali ke daftar, tersaring ke referensi yang baru dibuat.
    await expect(page).toHaveURL(new RegExp(`/master/referensi\\?jenis=tps&q=${code}$`))
    const row = page.getByRole("row").filter({ hasText: code })
    await expect(row).toContainText("TPS Uji E2E")
    await expect(row).toContainText("Kantor pabean 040300")
    await expect(row).not.toContainText("Arsip")

    // Muncul di pencarian untuk pilihan baru.
    const search = (q: string) =>
      page.request
        .get(`/api/ref-codes?type=tps&parent=040300&q=${q}`)
        .then((response) => response.json())
    expect((await search(code)).items).toEqual([
      { code, name: "TPS Uji E2E", parentCode: "040300" },
    ])

    // Kode yang sama di kantor yang sama ditolak.
    await page.goto("/master/referensi/baru")
    await page.getByLabel("Jenis").click()
    await page.getByRole("option", { name: "TPS" }).click()
    await page.getByLabel("Kantor pabean").fill("040300")
    await page.getByRole("option", { name: "[040300] KPU Tanjung Priok" }).click()
    await page.getByLabel("Kode").fill(code)
    await page.getByLabel("Nama").fill("Duplikat")
    await page.getByRole("button", { name: "Simpan" }).click()
    await expect(
      page.getByRole("alert").filter({ hasText: `Kode ${code} sudah ada di TPS` }),
    ).toBeVisible()

    // Arsipkan: tetap ada di daftar, tapi tidak bisa dipilih untuk data baru.
    await page.goto(`/master/referensi?jenis=tps&q=${code}`)
    await page.getByRole("row").filter({ hasText: code }).getByRole("link").first().click()
    await page.getByRole("checkbox", { name: "Aktif" }).uncheck()
    await page.getByRole("button", { name: "Simpan" }).click()
    await expect(page.getByRole("status")).toHaveText("Perubahan disimpan.")

    await page.goto(`/master/referensi?jenis=tps&q=${code}`)
    await expect(page.getByRole("row").filter({ hasText: code })).toContainText("Arsip")
    expect((await search(code)).items).toEqual([])
  })
})

test("API pencarian menolak request tanpa sesi", async ({ request }) => {
  const response = await request.get("/api/ref-codes?type=country&q=ID", { maxRedirects: 0 })
  expect(response.status()).toBe(401)
})
