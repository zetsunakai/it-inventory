"use client"

import { CircleAlert, CircleCheck } from "lucide-react"
import { useState, useTransition } from "react"

import {
  approveStockCount,
  cancelStockCount,
  reopenStockCount,
} from "@/app/(app)/inventory/opname/actions"
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
import type { StockCountStatus } from "@/lib/inventory"

// Keputusan Manajer atas sesi opname: setujui selisih, kembalikan ke penghitungan, atau batalkan.
export function CountActions({
  id,
  number,
  status,
  differing,
  cutOff,
}: {
  id: string
  number: string
  status: StockCountStatus
  differing: number
  cutOff: string
}) {
  const [result, setResult] = useState<ActionResult<unknown> | null>(null)
  const [pending, startTransition] = useTransition()
  const [approveOpen, setApproveOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)

  function run(action: () => Promise<ActionResult<unknown>>, close?: () => void) {
    startTransition(async () => {
      const next = await action()
      close?.()
      setResult(next)
    })
  }

  const open = status === "counting" || status === "review"
  if (!open && !result) return null

  return (
    <div className="space-y-3">
      {result && (
        <div
          role={result.ok ? "status" : "alert"}
          className={
            result.ok
              ? "flex gap-2 rounded-lg bg-success-soft px-3 py-2.5 text-sm"
              : "flex gap-2 rounded-lg bg-destructive-soft px-3 py-2.5 text-sm text-destructive"
          }
        >
          {result.ok ? (
            <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
          ) : (
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          )}
          <div className="space-y-0.5">
            {result.ok ? (
              <p>{result.message}</p>
            ) : (
              result.errors.map((message) => <p key={message}>{message}</p>)
            )}
          </div>
        </div>
      )}
      {open && (
        <div className="flex flex-wrap gap-2">
          {status === "review" && (
            <>
              <AlertDialog open={approveOpen} onOpenChange={setApproveOpen}>
                <AlertDialogTrigger render={<Button className="pointer-coarse:h-11" />}>
                  Setujui hasil opname
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Setujui opname {number}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      {differing
                        ? `${differing} baris berselisih dicatat sebagai penyesuaian dengan tanggal efektif cut-off ${cutOff}. Stok langsung diperbarui.`
                        : "Tidak ada selisih; sesi ditutup tanpa penyesuaian."}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={pending}>Kembali</AlertDialogCancel>
                    <Button
                      disabled={pending}
                      onClick={() =>
                        run(
                          () => approveStockCount({ id }),
                          () => setApproveOpen(false),
                        )
                      }
                    >
                      {pending ? "Menyetujui…" : "Setujui"}
                    </Button>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <Button
                variant="outline"
                disabled={pending}
                onClick={() => run(() => reopenStockCount({ id }))}
                className="pointer-coarse:h-11"
              >
                Kembalikan ke penghitungan
              </Button>
            </>
          )}
          <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
            <AlertDialogTrigger
              render={<Button variant="ghost" className="text-destructive pointer-coarse:h-11" />}
            >
              Batalkan sesi
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Batalkan opname {number}?</AlertDialogTitle>
                <AlertDialogDescription>
                  Hasil hitung tidak dipakai dan stok tidak berubah. Sesi tidak bisa dibuka lagi.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={pending}>Kembali</AlertDialogCancel>
                <Button
                  variant="destructive"
                  disabled={pending}
                  onClick={() =>
                    run(
                      () => cancelStockCount({ id }),
                      () => setCancelOpen(false),
                    )
                  }
                >
                  Batalkan sesi
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  )
}
