import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { expect, test } from "vitest"

import { Tabs, TabsList, TabsTrigger } from "./tabs"

function markup(label: string) {
  return renderToStaticMarkup(
    createElement(
      Tabs,
      { defaultValue: "test" },
      createElement(
        TabsList,
        { equalWidth: true },
        createElement(TabsTrigger, { value: "test" }, label),
      ),
    ),
  )
}

test("label tab tampil utuh dan boleh membungkus tanpa ellipsis", () => {
  for (const label of ["Header", "Kemasan & Peti Kemas", "Dokumen tambahan impor"]) {
    const html = markup(label)
    expect(html).toContain("whitespace-normal")
    expect(html).not.toContain("truncate")
    expect(html).not.toContain("line-clamp")
    expect(html).toContain(label.replaceAll("&", "&amp;"))
  }
})

test("tab rata memakai ukuran normal dan layout responsif tanpa scroll", () => {
  const html = markup("Kemasan & Peti Kemas")
  expect(html).toContain("repeat(var(--tabs-count),minmax(0,1fr))")
  expect(html).not.toContain("overflow-x-auto")
  expect(html).toContain("px-3 py-2")
  expect(html).toContain("min-h-12")
  expect(html).toContain("grid-cols-2 sm:grid-cols-3")
  expect(html).not.toContain("auto-fit")
})
