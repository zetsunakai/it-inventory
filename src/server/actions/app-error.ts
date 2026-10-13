// Kesalahan bisnis yang aman ditampilkan ke user, misalnya
// throw new AppError("Stok tidak cukup untuk produk X.")
// File sendiri (tanpa ketergantungan ke Next.js dan database) supaya bisa dipakai juga oleh modul
// yang dites tanpa database, seperti pembaca spreadsheet.
export class AppError extends Error {
  readonly errors: string[]
  constructor(errors: string | string[]) {
    const list = Array.isArray(errors) ? errors : [errors]
    super(list.join("\n"))
    this.name = "AppError"
    this.errors = list
  }
}
