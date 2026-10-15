import { expect, test } from "vitest"

import { cn } from "./utils"

test("ukuran teks kustom tidak terbuang saat digabung dengan warna teks", () => {
  expect(cn("text-control text-sidebar-foreground")).toBe("text-control text-sidebar-foreground")
  expect(cn("text-sm", "text-caption")).toBe("text-caption")
  expect(cn("text-control", "text-destructive")).toBe("text-control text-destructive")
})
