"use client"

import { CircleAlert, CircleCheck } from "lucide-react"
import { useEffect, useRef, useState, useTransition } from "react"

import {
  cancelInterwarehouse,
  confirmInterwarehouse,
  settleInterwarehouse,
} from "@/app/(app)/inventory/antar-gudang/actions"
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
import type { InterwarehouseStatus } from "@/lib/inventory"

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
  const [result, setResult] = useState<ActionResult<unknown> | null>(null)
  const [pending, startTransition] = useTransition()
  const [lossOpen, setLossOpen] = useState(false)
  const [reason, setReason] = useState("")
  const messageRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (result) messageRef.current?.focus()
  }, [result])

  function run(action: () => Promise<ActionResult<unknown>>, close?: () => void) {
    startTransition(async () => {
      const next = await action()
      close?.()
      setResult(next)
    })
  }

  const message =
    result?.ok &&
    (result.message ??
      (result.data && typeof result.data === "object"
        ? (result.data as { message?: string }).message
        : null))
  const cancellable = status === "draft" || status === "confirmed"
  if (!cancellable && !canSettle && !result) return null

  return (
    <div className="space-y-3">
      {result && (
        <div
          ref={messageRef}
          tabIndex={-1}
          role={result.ok ? "status" : "alert"}
          className={
            result.ok
              ? "flex gap-2 rounded-lg bg-success-soft px-3 py-2.5 text-sm outline-none"
              : "flex gap-2 rounded-lg bg-destructive-soft px-3 py-2.5 text-sm text-destructive outline-none"
          }
        >
          {result.ok ? (
            <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
          ) : (
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          )}
          {result.ok ? (
            <p>{message}</p>
          ) : (
            <ul className="list-disc space-y-0.5 pl-4">
              {result.errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          )}
        </div>
      )}
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
                    disetujui Manajer di halaman Scrap.
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
          <Button
            variant="ghost"
            disabled={pending}
            onClick={() => run(() => cancelInterwarehouse({ id }))}
            className="text-destructive pointer-coarse:h-11"
          >
            Batalkan permintaan
          </Button>
        )}
      </div>
    </div>
  )
}
