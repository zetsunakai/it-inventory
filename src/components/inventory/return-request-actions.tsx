"use client"

import { CircleAlert, CircleCheck } from "lucide-react"
import { useEffect, useRef, useState, useTransition } from "react"

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
  const [result, setResult] = useState<ActionResult<unknown> | null>(null)
  const [pending, startTransition] = useTransition()
  const [cancelOpen, setCancelOpen] = useState(false)
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

  if (status !== "draft" && !cancellable && !result) return null

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
            <p>{result.message}</p>
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
    </div>
  )
}
