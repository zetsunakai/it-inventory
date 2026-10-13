"use client"

import { CircleAlert, CircleCheck } from "lucide-react"
import { useEffect, useRef, useState, useTransition } from "react"

import {
  cancelTransfer,
  markTransferReady,
  reopenTransfer,
  validateTransfer,
} from "@/app/(app)/inventory/actions"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ActionResult } from "@/lib/action-result"
import type { TransferStatus } from "@/lib/inventory"

// Aksi transfer sesuai statusnya (PRD bagian 6.3): Draft → Siap → Selesai, atau Batal.
// Semua alasan gagal dari server (mis. stok tidak cukup per produk) tampil di sini sekaligus.
export function TransferActions({
  id,
  number,
  status,
  noun,
  effect,
  canBackdate,
}: {
  id: string
  number: string
  status: TransferStatus
  noun: string
  // Akibat validasi untuk kalimat konfirmasi, mis. "Stok di lokasi tujuan bertambah".
  effect: string
  // Manajer boleh memilih tanggal efektif mundur (PRD bagian 6.4).
  canBackdate: boolean
}) {
  const [result, setResult] = useState<ActionResult<unknown> | null>(null)
  const [pending, startTransition] = useTransition()
  const [validateOpen, setValidateOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date())
  const [effectiveDate, setEffectiveDate] = useState(today)
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

  // Transfer Selesai/Batal tidak punya aksi lagi, tapi pesan hasil aksi terakhir tetap tampil.
  const open = status === "draft" || status === "ready"
  if (!open && !result) return null

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
          <div className="space-y-0.5">
            {result.ok ? (
              <p>{result.message}</p>
            ) : (
              <>
                <p className="font-medium">
                  {result.errors.length > 1
                    ? `${result.errors.length} hal perlu diselesaikan:`
                    : "Perlu diselesaikan:"}
                </p>
                <ul className="list-disc space-y-0.5 pl-4">
                  {result.errors.map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      )}

      {open && (
        <div className="flex flex-wrap gap-2">
          {status === "draft" && (
            <Button
              disabled={pending}
              onClick={() => run(() => markTransferReady({ id }))}
              className="pointer-coarse:h-11"
            >
              Tandai siap
            </Button>
          )}
          {status === "ready" && (
            <>
              <AlertDialog open={validateOpen} onOpenChange={setValidateOpen}>
                <AlertDialogTrigger render={<Button className="pointer-coarse:h-11" />}>
                  Validasi
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      Validasi {noun} {number}?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      {effect}. Setelah divalidasi, transfer terkunci; koreksi hanya lewat retur
                      atau penyesuaian.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  {canBackdate && (
                    <div className="space-y-1.5">
                      <Label htmlFor="effective-date">Tanggal efektif</Label>
                      <Input
                        id="effective-date"
                        type="date"
                        max={today}
                        value={effectiveDate}
                        onChange={(event) => setEffectiveDate(event.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">
                        Isi tanggal sebelumnya hanya bila barang memang bergerak di tanggal itu.
                      </p>
                    </div>
                  )}
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={pending}>Batal</AlertDialogCancel>
                    <Button
                      disabled={pending}
                      onClick={() =>
                        run(
                          () =>
                            validateTransfer({
                              id,
                              effectiveDate: canBackdate ? effectiveDate : undefined,
                            }),
                          () => setValidateOpen(false),
                        )
                      }
                    >
                      {pending ? "Memvalidasi…" : "Validasi"}
                    </Button>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <Button
                variant="outline"
                disabled={pending}
                onClick={() => run(() => reopenTransfer({ id }))}
                className="pointer-coarse:h-11"
              >
                Kembali ke Draft
              </Button>
            </>
          )}
          <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
            <AlertDialogTrigger
              render={<Button variant="ghost" className="text-destructive pointer-coarse:h-11" />}
            >
              Batalkan {noun}
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Batalkan {noun} {number}?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  Transfer yang dibatalkan tidak bisa diubah atau divalidasi lagi.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={pending}>Kembali</AlertDialogCancel>
                <Button
                  variant="destructive"
                  disabled={pending}
                  onClick={() =>
                    run(
                      () => cancelTransfer({ id }),
                      () => setCancelOpen(false),
                    )
                  }
                >
                  Batalkan {noun}
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  )
}
