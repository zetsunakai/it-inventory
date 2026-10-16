"use client"

import { useState, useTransition } from "react"

import {
  cancelInterwarehouse,
  confirmInterwarehouse,
  settleInterwarehouse,
} from "@/modules/inventory/actions/interwarehouse"
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
import type { InterwarehouseStatus } from "@/modules/inventory/lib/inventory"
import { usePageMessage } from "@/components/layout/page-message"

// Aksi permintaan transfer antar gudang sesuai statusnya (backlog R-10).
export function InterwarehouseActions({
  id,
  number,
  status,
  canSettle,
}: {
  id: string
  number: string
  status: InterwarehouseStatus
  // Masih ada barang di transit dan tidak ada transfer terbuka.
  canSettle: boolean
}) {
  const { show } = usePageMessage()
  const [pending, startTransition] = useTransition()
  const [lossOpen, setLossOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [reason, setReason] = useState("")

  function run(action: () => Promise<ActionResult<unknown>>, close?: () => void) {
    startTransition(async () => {
      const next = await action()
      close?.()
      show(next)
    })
  }

  const cancellable = status === "draft" || status === "confirmed"
  if (!cancellable && !canSettle) return null

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {status === "draft" && (
          <Button
            disabled={pending}
            onClick={() => run(() => confirmInterwarehouse({ id }))}
            className="pointer-coarse:h-11"
          >
            Konfirmasi
          </Button>
        )}
        {canSettle && (
          <>
            <Button
              disabled={pending}
              onClick={() => run(() => settleInterwarehouse({ id, mode: "return" }))}
              className="pointer-coarse:h-11"
            >
              Kembalikan sisa ke gudang asal
            </Button>
            <AlertDialog open={lossOpen} onOpenChange={setLossOpen}>
              <AlertDialogTrigger
                render={<Button variant="outline" className="pointer-coarse:h-11" />}
              >
                Catat susut transit
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Catat susut transit {number}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Sisa barang di transit dicatat sebagai scrap dan baru mengurangi stok setelah
                    disetujui Manajer di halaman Pemakaian & scrap.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="space-y-1.5">
                  <Label htmlFor="loss-reason">Alasan</Label>
                  <Textarea
                    id="loss-reason"
                    rows={2}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                  />
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={pending}>Batal</AlertDialogCancel>
                  <Button
                    disabled={pending}
                    onClick={() =>
                      run(
                        () => settleInterwarehouse({ id, mode: "loss", reason }),
                        () => setLossOpen(false),
                      )
                    }
                  >
                    Catat susut
                  </Button>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
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
                <AlertDialogTitle>Batalkan permintaan {number}?</AlertDialogTitle>
                <AlertDialogDescription>
                  Transfer keluar yang belum Selesai ikut dibatalkan dan stok yang dipesan dilepas.
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
                      () => cancelInterwarehouse({ id }),
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
