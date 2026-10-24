"use client"

import { History } from "lucide-react"
import { usePathname } from "next/navigation"
import { useState, type ReactNode } from "react"

import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

// Saat area form sempit, Aktivitas dibuka lewat ikon ke panel di sisi kanan.
type DocumentRailProps = {
  activity?: ReactNode
  className?: string
}

export function DocumentRail(props: DocumentRailProps) {
  const pathname = usePathname()
  return <CollapsibleDocumentRail key={pathname} {...props} />
}

function CollapsibleDocumentRail({ activity, className }: DocumentRailProps) {
  const [open, setOpen] = useState(false)
  return (
    <div className={className}>
      <div className="flex flex-col gap-2">
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
        <SheetContent className="w-full! gap-0 duration-300 ease-out motion-reduce:transition-none sm:max-w-md!">
          <SheetHeader className="border-b pr-14">
            <SheetTitle>Aktivitas</SheetTitle>
            <SheetDescription className="sr-only">Log aktivitas dokumen.</SheetDescription>
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">{activity}</div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
