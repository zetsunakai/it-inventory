import { expect, type Locator } from "@playwright/test"

// Isi input setelah React selesai hidrasi. Input hasil SSR sudah terlihat sebelum event handler
// terpasang; bila langsung diketik (terutama saat server sedang sibuk), ketikan tidak memicu
// pencarian di komponen seperti SearchSelect. React menempelkan props-nya ke elemen DOM saat
// hidrasi, jadi itu tanda input sudah interaktif.
export async function waitInteractive(locator: Locator) {
  await expect
    .poll(() =>
      locator.evaluate((element) =>
        Object.keys(element).some((key) => key.startsWith("__reactProps")),
      ),
    )
    .toBe(true)
}

export async function fillInteractive(locator: Locator, value: string) {
  await waitInteractive(locator)
  await locator.fill(value)
}
