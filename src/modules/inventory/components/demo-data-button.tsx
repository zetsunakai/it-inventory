"use client"

import { DatabaseZap } from "lucide-react"
import { useState, useTransition } from "react"

import { usePageMessage } from "@/components/layout/page-message"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { createInventoryDemo } from "@/modules/inventory/actions/demo"
import { DEMO_SCENARIOS, type DemoScenarioKey } from "@/modules/inventory/lib/demo-scenarios"

// Tombol data demo inventory di dashboard (Administrator): pilih satu dari 10 studi kasus, lalu
// satu putaran transaksi 45 hari ditambahkan. Bisa ditekan berulang. Hasilnya lewat pesan halaman.
export function DemoDataButton({ runs }: { runs: Partial<Record<DemoScenarioKey, number>> }) {
  const { show } = usePageMessage()
  const [pending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<DemoScenarioKey>(DEMO_SCENARIOS[0].key)

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger render={<Button variant="outline" disabled={pending} />}>
        <DatabaseZap />
        Data demo
      </AlertDialogTrigger>
      <AlertDialogContent className="sm:max-w-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle>Buat data demo inventory</AlertDialogTitle>
          <AlertDialogDescription>
            Pilih studi kasus kawasan berikat. Setiap klik menambah satu putaran transaksi 45 hari
            terakhir; gudang, produk berkode HS, dan partner studi kasus itu dibuat sekali. Data
            lain tidak diubah atau dihapus.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <fieldset className="grid max-h-[50dvh] gap-2 overflow-y-auto sm:grid-cols-2">
          <legend className="sr-only">Studi kasus</legend>
          {DEMO_SCENARIOS.map((scenario) => {
            const done = runs[scenario.key] ?? 0
            return (
              <label
                key={scenario.key}
                className={cn(
                  "flex cursor-pointer gap-3 rounded-lg border p-3 text-control transition-colors hover:bg-accent has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
                  selected === scenario.key && "border-primary bg-accent",
                )}
              >
                <input
                  type="radio"
                  name="demo-scenario"
                  value={scenario.key}
                  checked={selected === scenario.key}
                  onChange={() => setSelected(scenario.key)}
                  className="mt-1 accent-primary"
                />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="font-medium text-foreground">{scenario.title}</span>
                  <span className="text-caption text-muted-foreground">
                    {scenario.location}
                    {done ? ` · sudah ${done} putaran` : ""}
                  </span>
                  <span className="text-caption text-muted-foreground">{scenario.story}</span>
                </span>
              </label>
            )
          })}
        </fieldset>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Batal</AlertDialogCancel>
          <Button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await createInventoryDemo({ scenario: selected })
                setOpen(false)
                const title = DEMO_SCENARIOS.find((scenario) => scenario.key === selected)?.title
                show(
                  result.ok
                    ? {
                        ...result,
                        message: `Data demo ${title}: putaran ke-${result.data.run}, ${result.data.transfers} transfer ditambahkan.`,
                      }
                    : result,
                )
              })
            }
          >
            {pending ? "Membuat…" : "Buat data demo"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
