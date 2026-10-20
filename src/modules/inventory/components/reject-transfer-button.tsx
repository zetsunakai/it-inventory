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
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { rejectTransfer } from "@/modules/inventory/actions/transfers"

// Tolak scrap/penyesuaian (I-03): Manajer wajib menulis alasan; alasannya tampil di detail dan log
// aktivitas. Dipakai di header detail dan di antrean persetujuan daftar.
export function RejectTransferButton({
  id,
  number,
  noun,
  size,
}: {
  id: string
  number: string
  noun: string
  size?: "sm"
}) {
  const { show } = usePageMessage()
  const [pending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState("")
  const fieldId = `reject-reason-${id}`

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setReason("")
      }}
    >
      <AlertDialogTrigger
        render={<Button variant="outline" size={size} className="pointer-coarse:h-11" />}
      >
        Tolak
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Tolak {noun} {number}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Stok tidak berubah dan pesanan stoknya dilepas. Pembuatnya bisa mengembalikan ke Draft
            untuk diperbaiki, lalu mengonfirmasi lagi.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor={fieldId}>Alasan penolakan</Label>
          <Textarea
            id={fieldId}
            value={reason}
            maxLength={500}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Kembali</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={pending || !reason.trim()}
            onClick={() =>
              startTransition(async () => {
                const result = await rejectTransfer({ id, reason })
                if (result.ok) setOpen(false)
                show(result)
              })
            }
          >
            {pending ? "Memproses…" : "Tolak"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
