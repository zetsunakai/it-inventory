"use client"

import { useState, useTransition } from "react"

import {
  cancelReturnRequest,
  closeReturnRequest,
  confirmReturnRequest,
} from "@/app/(app)/inventory/retur/actions"
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
import type { ActionResult } from "@/lib/action-result"
import type { ReturnRequestStatus } from "@/lib/inventory"
import { usePageMessage } from "@/components/layout/page-message"

// Aksi permintaan retur sesuai statusnya (backlog R-11, I-02): Konfirmasi saat Draft, Batal selama
// belum ada barang yang diretur, Tutup tanpa pengganti setelah barangnya diretur.
export function ReturnRequestActions({
  id,
  number,
  status,
  cancellable,
  closable = false,
}: {
  id: string
  number: string
  status: ReturnRequestStatus
  cancellable: boolean
  closable?: boolean
}) {
  const { show } = usePageMessage()
  const [pending, startTransition] = useTransition()
  const [cancelOpen, setCancelOpen] = useState(false)
  const [closeOpen, setCloseOpen] = useState(false)
  const [closeReason, setCloseReason] = useState("")

  function run(action: () => Promise<ActionResult<unknown>>, close?: () => void) {
    startTransition(async () => {
      const next = await action()
      close?.()
      show(next)
    })
  }

  if (status !== "draft" && !cancellable && !closable) return null

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {status === "draft" && (
          <Button
            disabled={pending}
            onClick={() => run(() => confirmReturnRequest({ id }))}
            className="pointer-coarse:h-11"
          >
            Konfirmasi
          </Button>
        )}
        {closable && (
          <AlertDialog open={closeOpen} onOpenChange={setCloseOpen}>
            <AlertDialogTrigger
              render={
                <Button variant="outline" disabled={pending} className="pointer-coarse:h-11" />
              }
            >
              Tutup tanpa pengganti
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Tutup {number} tanpa pengganti?</AlertDialogTitle>
                <AlertDialogDescription>
                  Barang yang sudah diretur tetap tercatat. Transfer pengganti yang belum Selesai
                  dibatalkan dan permintaan menjadi Selesai.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="space-y-1.5">
                <Label htmlFor="close-reason">Alasan</Label>
                <Textarea
                  id="close-reason"
                  value={closeReason}
                  onChange={(event) => setCloseReason(event.target.value)}
                  placeholder="Mis. vendor mengganti dengan nota kredit"
                />
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={pending}>Kembali</AlertDialogCancel>
                <Button
                  disabled={pending || !closeReason.trim()}
                  onClick={() =>
                    run(
                      () => closeReturnRequest({ id, reason: closeReason }),
                      () => setCloseOpen(false),
                    )
                  }
                >
                  Tutup tanpa pengganti
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
        {cancellable && (
          <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
            <AlertDialogTrigger
              render={
                <Button
                  variant="ghost"
                  disabled={pending}
                  className="text-destructive pointer-coarse:h-11"
                />
              }
            >
              Batalkan permintaan
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Batalkan permintaan retur {number}?</AlertDialogTitle>
                <AlertDialogDescription>
                  Transfer retur yang belum Selesai ikut dibatalkan dan stok yang dipesan dilepas.
                  Permintaan yang sudah Batal tidak bisa dibuka lagi.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={pending}>Kembali</AlertDialogCancel>
                <Button
                  variant="destructive"
                  disabled={pending}
                  onClick={() =>
                    run(
                      () => cancelReturnRequest({ id }),
                      () => setCancelOpen(false),
                    )
                  }
                >
                  Batalkan permintaan
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </>
  )
}
