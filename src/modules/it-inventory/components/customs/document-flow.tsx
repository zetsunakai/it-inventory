"use client"

import { ArrowDownToLine, ArrowUpFromLine } from "lucide-react"
import Link from "next/link"
import { useLayoutEffect, useRef, useState } from "react"

import { cn } from "@/lib/utils"
import {
  CUSTOMS_DOC_CODE_LABELS,
  CUSTOMS_FLOW_IN,
  CUSTOMS_FLOW_MAP,
  CUSTOMS_FLOW_OUT,
  type CustomsDocCode,
} from "@/modules/it-inventory/lib/customs"
import { CUSTOMS_SPECS } from "@/modules/it-inventory/lib/customs-specs"

type Side = "in" | "out"
type Key = `${Side}-${CustomsDocCode}`
type Path = { source: Key; target: Key; d: string }

const RELATIONS: [Key, Key][] = CUSTOMS_FLOW_IN.flatMap(({ code }) =>
  (CUSTOMS_FLOW_MAP[code] ?? []).map((target): [Key, Key] => [`in-${code}`, `out-${target}`]),
)

// Flow Dokumen (hx-it-inventory-document-flow hmx, H-06): dokumen masuk di kiri, dokumen keluar di
// kanan, garis = pasangan DOCUMENT_FLOW_MAP. Arahkan kursor atau fokus ke kotak untuk menyorot
// pasangannya; kotak membuka daftar dokumen jenis itu. Pasangan juga ditulis di kotak dokumen
// masuk, jadi tetap terbaca tanpa diagram (layar sempit, pembaca layar).
export function DocumentFlow() {
  const area = useRef<HTMLDivElement>(null)
  const boxes = useRef(new Map<Key, HTMLElement>())
  const [paths, setPaths] = useState<Path[]>([])
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [active, setActive] = useState<Key | null>(null)

  useLayoutEffect(() => {
    const element = area.current
    if (!element) return
    const measure = () => {
      const origin = element.getBoundingClientRect()
      setSize({ width: origin.width, height: origin.height })
      setPaths(
        RELATIONS.flatMap(([source, target]) => {
          const from = boxes.current.get(source)?.getBoundingClientRect()
          const to = boxes.current.get(target)?.getBoundingClientRect()
          // Kolom bertumpuk (layar sempit): garis tidak digambar.
          if (!from || !to || to.left <= from.right) return []
          const x1 = from.right - origin.left
          const y1 = from.top + from.height / 2 - origin.top
          const x2 = to.left - origin.left
          const y2 = to.top + to.height / 2 - origin.top
          const bend = (x2 - x1) / 2
          return [
            {
              source,
              target,
              d: `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`,
            },
          ]
        }),
      )
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const related = (key: Key) =>
    active === key ||
    RELATIONS.some(
      ([source, target]) =>
        (source === active && target === key) || (target === active && source === key),
    )
  const lit = (path: Path) => path.source === active || path.target === active

  const box = (side: Side, doc: { code: CustomsDocCode; name: string; description: string }) => {
    const key: Key = `${side}-${doc.code}`
    const Icon = side === "in" ? ArrowDownToLine : ArrowUpFromLine
    const targets = side === "in" ? (CUSTOMS_FLOW_MAP[doc.code] ?? []) : []
    return (
      <Link
        key={key}
        ref={(element) => {
          if (element) boxes.current.set(key, element)
          else boxes.current.delete(key)
        }}
        href={CUSTOMS_SPECS[doc.code].path}
        onMouseEnter={() => setActive(key)}
        onMouseLeave={() => setActive(null)}
        onFocus={() => setActive(key)}
        onBlur={() => setActive(null)}
        className={cn(
          "relative z-10 flex items-start gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-primary focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
          active && (related(key) ? "border-primary" : "opacity-60"),
        )}
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
          <Icon className="size-4" />
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="font-medium">{doc.name}</span>
          <span className="text-caption text-muted-foreground">{doc.description}</span>
          {targets.length > 0 && (
            <span className="text-caption text-muted-foreground">
              Keluar lewat {targets.map((code) => CUSTOMS_DOC_CODE_LABELS[code]).join(", ")}
            </span>
          )}
        </span>
      </Link>
    )
  }

  return (
    <div ref={area} className="relative">
      <svg
        aria-hidden
        className="pointer-events-none absolute inset-0"
        width={size.width}
        height={size.height}
      >
        {paths.map((path) => (
          <path
            key={`${path.source}>${path.target}`}
            d={path.d}
            fill="none"
            className={cn(
              "transition-colors",
              lit(path) ? "stroke-primary" : "stroke-muted-foreground/35",
              active && !lit(path) && "opacity-40",
            )}
            strokeWidth={lit(path) ? 2 : 1.5}
          />
        ))}
      </svg>
      <div className="grid gap-6 md:grid-cols-[minmax(0,20rem)_minmax(6rem,1fr)_minmax(0,20rem)]">
        <section aria-labelledby="flow-in" className="flex flex-col gap-3">
          <h2 id="flow-in" className="text-caption font-medium text-muted-foreground">
            Dokumen masuk
          </h2>
          {CUSTOMS_FLOW_IN.map((doc) => box("in", doc))}
        </section>
        <div aria-hidden className="hidden md:block" />
        <section aria-labelledby="flow-out" className="flex flex-col gap-3">
          <h2 id="flow-out" className="text-caption font-medium text-muted-foreground">
            Dokumen keluar
          </h2>
          {CUSTOMS_FLOW_OUT.map((doc) => box("out", doc))}
        </section>
      </div>
    </div>
  )
}
