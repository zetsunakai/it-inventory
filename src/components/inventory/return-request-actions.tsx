"use client"

import { useState, useTransition } from "react"

import { cancelReturnRequest, confirmReturnRequest } from "@/app/(app)/inventory/retur/actions"
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
import type { ActionResult } from "@/lib/action-result"
import type { ReturnRequestStatus } from "@/lib/inventory"
import { usePageMessage } from "@/components/layout/page-message"

// Aksi permintaan retur sesuai statusnya (backlog R-11): Konfirmasi saat Draft, Batal selama
// belum ada barang yang diretur.
export function ReturnRequestActions({
  id,
  number,
  status,
  cancellable,
}: {
  id: string
  number: string
  status: ReturnRequestStatus
  cancellable: boolean
}) {
  const { show } = usePageMessage()
  const [pending, startTransition] = useTransition()
  const [cancelOpen, setCancelOpen] = useState(false)

  function run(action: () => Promise<ActionResult<unknown>>, close?: () => void) {
    startTransition(async () => {
      const next = await action()
      close?.()
      show(next)
    })
  }

  if (status !== "draft" && !cancellable) return null

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
