"use client"

import { ArrowDownToLine, ArrowUpFromLine, Warehouse } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import { cn } from "@/lib/utils"
import {
  CUSTOMS_DOC_CODE_LABELS,
  CUSTOMS_FLOW_IN,
  CUSTOMS_FLOW_MAP,
  CUSTOMS_FLOW_OUT,
  type CustomsDocCode,
} from "@/modules/it-inventory/lib/customs"
import { CUSTOMS_SPECS } from "@/modules/it-inventory/lib/customs-specs"

type ChainDoc = { code: CustomsDocCode; name: string; description: string }

// Satu baris = satu rantai: dokumen pemasukan, barang yang ditimbun di kawasan, lalu dokumen
// pengeluaran yang mungkin dibuat darinya. Pasangan tetap dari DOCUMENT_FLOW_MAP hmx, jadi satu
// dokumen keluar bisa muncul di beberapa rantai. Kartu membuka daftar jenisnya; hover/fokus ke
// satu rantai menyorot seluruh jalurnya.
const OUT_DOCS = new Map<CustomsDocCode, ChainDoc>(CUSTOMS_FLOW_OUT.map((doc) => [doc.code, doc]))

const CHAINS = CUSTOMS_FLOW_IN.map((source) => ({
  source,
  targets: (CUSTOMS_FLOW_MAP[source.code] ?? []).flatMap((code) => {
    const target = OUT_DOCS.get(code)
    return target ? [target] : []
  }),
}))

export function DocumentChain() {
  const [active, setActive] = useState<CustomsDocCode | null>(null)

  return (
    <div className="flex flex-col gap-3">
      <div
        aria-hidden
        className="hidden gap-3 px-2 text-caption font-medium text-muted-foreground xl:grid xl:grid-cols-[minmax(0,18rem)_minmax(10rem,1fr)_minmax(0,1fr)]"
      >
        <span>1 · Pemasukan</span>
        <span className="text-center">2 · Penimbunan</span>
        <span>3 · Pengeluaran</span>
      </div>
      <ol className="flex flex-col gap-3">
        {CHAINS.map(({ source, targets }) => {
          const current = active === source.code
          return (
            <li
              key={source.code}
              data-chain={source.code}
              onMouseEnter={() => setActive(source.code)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(source.code)}
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                  setActive(null)
                }
              }}
              className={cn(
                "grid gap-3 rounded-2xl border border-transparent p-2 transition-colors xl:grid-cols-[minmax(0,18rem)_minmax(10rem,1fr)_minmax(0,1fr)] xl:items-center",
                current && "border-border bg-muted/40",
                active && !current && "opacity-60",
              )}
            >
              <DocCard
                doc={source}
                side="in"
                targets={targets.map((target) => CUSTOMS_DOC_CODE_LABELS[target.code])}
              />
              <span
                aria-hidden
                className="flex items-center justify-center gap-2 text-muted-foreground"
              >
                <span className="h-px flex-1 bg-border" />
                <span className="flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-caption">
                  <Warehouse className="size-3.5" />
                  Barang di kawasan
                </span>
                <span className="h-px flex-1 bg-border" />
              </span>
              <ul aria-label={`Pengeluaran dari ${source.name}`} className="flex flex-wrap gap-2">
                {targets.map((target) => (
                  <li key={target.code} className="min-w-40 flex-1">
                    <DocCard doc={target} side="out" />
                  </li>
                ))}
              </ul>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

function DocCard({
  doc,
  side,
  targets,
}: {
  doc: ChainDoc
  side: "in" | "out"
  targets?: string[]
}) {
  const Icon = side === "in" ? ArrowDownToLine : ArrowUpFromLine
  return (
    <Link
      href={CUSTOMS_SPECS[doc.code].path}
      className="flex items-start gap-3 rounded-xl border bg-card p-3 transition-colors hover:border-primary focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
        <Icon className="size-4" />
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="font-medium">{doc.name}</span>
        <span className="text-caption text-muted-foreground">{doc.description}</span>
        {targets && targets.length > 0 && (
          <span className="text-caption text-muted-foreground">
            Keluar lewat {targets.join(", ")}
          </span>
        )}
      </span>
    </Link>
  )
}
