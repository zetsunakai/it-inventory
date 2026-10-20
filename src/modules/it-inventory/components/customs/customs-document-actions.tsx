"use client"

import { Copy, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"
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
import {
  deleteCustomsDocument,
  duplicateCustomsDocument,
  submitCustomsDocument,
} from "@/modules/it-inventory/actions/customs-documents"
import type { CustomsDocumentStatus } from "@/modules/it-inventory/lib/customs"

// Tombol alur dokumen BC seperti hmx-002 (backlog H-01): Draft bisa di-Submit atau dihapus;
// Submitted final. Hasilnya tampil lewat pesan halaman.
export function CustomsDocumentActions({
  id,
  path,
  number,
  status,
  canWrite,
  includeDuplicate = true,
}: {
  id: string
  // Path menu jenis dokumen, mis. /dokumen-bc/bc23.
  path: string
  // Nomor urut dokumen, mis. IT/23/00001.
  number: string
  status: CustomsDocumentStatus
  canWrite: boolean
  includeDuplicate?: boolean
}) {
  const router = useRouter()
  const { show } = usePageMessage()
  const [pending, startTransition] = useTransition()
  const [open, setOpen] = useState<"submit" | "delete" | null>(null)
  const draft = canWrite && status === "draft"

  return (
    <div className="flex flex-wrap gap-2">
      {draft && (
        <AlertDialog
          open={open === "submit"}
          onOpenChange={(next) => setOpen(next ? "submit" : null)}
        >
          <AlertDialogTrigger render={<Button disabled={pending} />}>Submit</AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Submit dokumen {number}?</AlertDialogTitle>
              <AlertDialogDescription>
                Isian yang sudah disimpan diperiksa lebih dulu. Setelah Submitted, dokumen beserta
                barang dan transfernya tidak bisa diubah atau dihapus.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={pending}>Kembali</AlertDialogCancel>
              <Button
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await submitCustomsDocument({ id })
                    setOpen(null)
                    show(result)
                  })
                }
              >
                {pending ? "Memproses…" : "Submit"}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
      {canWrite && includeDuplicate && <DuplicateCustomsButton id={id} path={path} />}
      {draft && (
        <AlertDialog
          open={open === "delete"}
          onOpenChange={(next) => setOpen(next ? "delete" : null)}
        >
          <AlertDialogTrigger
            render={<Button variant="ghost" className="text-destructive" disabled={pending} />}
          >
            <Trash2 aria-hidden />
            Hapus
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Hapus dokumen {number}?</AlertDialogTitle>
              <AlertDialogDescription>
                Dokumen Draft beserta barang, lampiran, dan pilihan transfernya dihapus.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={pending}>Kembali</AlertDialogCancel>
              <Button
                variant="destructive"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await deleteCustomsDocument({ id })
                    setOpen(null)
                    show(result)
                    if (result.ok) router.push(path)
                  })
                }
              >
                {pending ? "Menghapus…" : "Hapus"}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  )
}

export function DuplicateCustomsButton({
  id,
  path,
  disabled,
}: {
  id: string
  path: string
  disabled?: boolean
}) {
  const router = useRouter()
  const { show } = usePageMessage()
  const [pending, startTransition] = useTransition()
  return (
    <Button
      type="button"
      variant="outline"
      disabled={disabled || pending}
      onClick={() =>
        startTransition(async () => {
          const result = await duplicateCustomsDocument({ id })
          show(result)
          if (result.ok) router.push(`${path}/${result.data.id}`)
        })
      }
    >
      <Copy aria-hidden />
      Duplikat
    </Button>
  )
}
