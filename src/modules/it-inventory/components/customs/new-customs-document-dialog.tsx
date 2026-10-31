"use client"

import { Dialog } from "@base-ui/react/dialog"
import { Plus, X } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  CUSTOMS_ENTITY_CHOICES,
  type CustomsEntity,
} from "@/modules/it-inventory/lib/customs-entity"

export function NewCustomsDocumentDialog() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [entity, setEntity] = useState<CustomsEntity | null>(null)
  const [path, setPath] = useState<string | null>(null)
  const choice = CUSTOMS_ENTITY_CHOICES.find((item) => item.name === entity)

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          setEntity(null)
          setPath(null)
        }
      }}
    >
      <Dialog.Trigger render={<Button />}>
        <Plus aria-hidden />
        Buat
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl bg-popover p-5 text-popover-foreground shadow-xl ring-1 ring-foreground/10 outline-none sm:p-6">
          <div className="mb-5 flex items-start justify-between gap-4 border-b pb-4">
            <Dialog.Title className="text-lg font-semibold">Dokumen baru</Dialog.Title>
            <Dialog.Close render={<Button variant="ghost" size="icon-sm" aria-label="Tutup" />}>
              <X aria-hidden />
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">
            Pilih entitas lalu jenis dokumen untuk membuka form dokumen BC baru.
          </Dialog.Description>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="customs-entity" className="text-control font-medium">
                Entitas
              </label>
              <Select
                value={entity}
                onValueChange={(value) => {
                  setEntity(value as CustomsEntity | null)
                  setPath(null)
                }}
              >
                <SelectTrigger id="customs-entity" className="w-full">
                  <SelectValue placeholder="Pilih entitas" />
                </SelectTrigger>
                <SelectContent>
                  {CUSTOMS_ENTITY_CHOICES.map((item) => (
                    <SelectItem key={item.name} value={item.name}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="customs-kind" className="text-control font-medium">
                Jenis dokumen
              </label>
              <Select value={path} onValueChange={setPath} disabled={!choice}>
                <SelectTrigger id="customs-kind" className="w-full">
                  <SelectValue placeholder={choice ? "Pilih jenis dokumen" : "Pilih entitas dulu"}>
                    {choice?.documents.find((doc) => doc.path === path)?.title}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {choice?.documents.map((doc) => (
                    <SelectItem key={doc.code} value={doc.path}>
                      {doc.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="mt-6 flex justify-end gap-2 border-t pt-4">
            <Dialog.Close render={<Button variant="outline" />}>Batal</Dialog.Close>
            <Button
              disabled={!choice?.documents.some((doc) => doc.path === path)}
              onClick={() => {
                if (!path || !choice?.documents.some((doc) => doc.path === path)) return
                setOpen(false)
                router.push(`${path}/baru`)
              }}
            >
              Lanjut
            </Button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
