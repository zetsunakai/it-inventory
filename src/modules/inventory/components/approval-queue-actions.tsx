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
import { approveTransfer } from "@/modules/inventory/actions/transfers"

import { RejectTransferButton } from "./reject-transfer-button"

// Antrean persetujuan di daftar scrap/penyesuaian (I-03): Manajer menyetujui (sekaligus memvalidasi,
// tanggal efektif hari ini) atau menolak dengan alasan tanpa membuka detailnya. Backdate tetap lewat
// halaman detail.
export function ApprovalQueueActions({
  id,
  number,
  noun,
  effect,
}: {
  id: string
  number: string
  noun: string
  effect: string
}) {
  const { show } = usePageMessage()
  const [pending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)

  return (
    <span className="flex gap-2">
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger render={<Button size="sm" className="pointer-coarse:h-11" />}>
          Setujui
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Setujui dan validasi {noun} {number}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {effect}, bertanggal hari ini. Setelah divalidasi, transfer terkunci; koreksi hanya
              lewat penyesuaian.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Kembali</AlertDialogCancel>
            <Button
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await approveTransfer({ id })
                  setOpen(false)
                  show(result)
                })
              }
            >
              {pending ? "Memproses…" : "Setujui dan validasi"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <RejectTransferButton id={id} number={number} noun={noun} size="sm" />
    </span>
  )
}
