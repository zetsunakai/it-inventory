"use client"

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
import { submitCustomsDocument } from "@/modules/it-inventory/actions/customs-documents"

// Tombol alur dokumen BC seperti hmx-002 (backlog H-01): Draft di-Submit, Submitted final.
// Hapus dan Duplikat ada di halaman daftar (pilih baris). Hasilnya tampil lewat pesan halaman.
export function SubmitCustomsButton({
  id,
  number,
}: {
  id: string
  // Nomor urut dokumen, mis. IT/23/00001.
  number: string
}) {
  const { show } = usePageMessage()
  const [pending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
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
                setOpen(false)
                show(result)
              })
            }
          >
            {pending ? "Memproses…" : "Submit"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
