"use client"

import { History, ListChecks } from "lucide-react"
import { useState, type ReactNode } from "react"

import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

// Kolom kanan dokumen yang ditutup otomatis saat area isi sempit (zoom in, jendela kecil): isi
// form yang dipertahankan, status dan aktivitas jadi strip ikon. Klik ikon membuka keduanya di
// panel samping (isinya baru dirender saat dibuka).
export function DocumentRail({
  status,
  activity,
  className,
}: {
  status?: ReactNode
  activity?: ReactNode
  className?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className={className}>
      <div className="flex flex-col gap-2">
        {status && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Tampilkan status"
            title="Status"
            onClick={() => setOpen(true)}
          >
            <ListChecks />
          </Button>
        )}
        {activity && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Tampilkan aktivitas"
            title="Aktivitas"
            onClick={() => setOpen(true)}
          >
            <History />
          </Button>
        )}
      </div>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="w-full! gap-0 sm:max-w-md!">
          <SheetHeader className="border-b pr-14">
            <SheetTitle>{status ? "Status dan aktivitas" : "Aktivitas"}</SheetTitle>
            <SheetDescription className="sr-only">
              Status dokumen dan log aktivitasnya.
            </SheetDescription>
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
            {status}
            {activity}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
