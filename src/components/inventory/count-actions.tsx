"use client"

import { CircleAlert, CircleCheck } from "lucide-react"
import { useState, useTransition } from "react"

import {
  approveStockCount,
  cancelStockCount,
  rejectStockCount,
  reopenStockCount,
  startStockCount,
  submitStockCount,
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

const TOUCH = "pointer-coarse:h-11"

// Tombol alur sesi opname (backlog R-13). Manajer (canApprove): mulai hitung, setujui, tolak,
// batal. Admin gudang (canWrite): hitung ulang dan ajukan setelah Selesai hitung. "Selesai hitung"
// ada di lembar hitung.
export function CountActions({
  id,
  number,
  status,
  warehouseCode,
  differing,
  completedAt,
  canWrite,
  canApprove,
}: {
  id: string
  number: string
  status: StockCountStatus
  warehouseCode: string
  differing: number
  // Tanggal efektif penyesuaian (selesai hitung), sudah diformat.
  completedAt: string | null
  canWrite: boolean
  canApprove: boolean
}) {
  const [result, setResult] = useState<ActionResult<unknown> | null>(null)
  const [pending, startTransition] = useTransition()
  const [dialog, setDialog] = useState<"start" | "approve" | "cancel" | null>(null)

  function run(action: () => Promise<ActionResult<unknown>>) {
    startTransition(async () => {
      const next = await action()
      setDialog(null)
      setResult(next)
    })
  }

  const cancellable = canApprove && status !== "approved" && status !== "cancelled"
  const buttons = [
    status === "draft" && canApprove,
    status === "counted" && canWrite,
    status === "review" && canApprove,
    cancellable,
  ].some(Boolean)
  if (!buttons && !result) return null

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
      <div className="flex flex-wrap gap-2">
        {status === "draft" && canApprove && (
          <AlertDialog
            open={dialog === "start"}
            onOpenChange={(open) => setDialog(open ? "start" : null)}
          >
            <AlertDialogTrigger render={<Button className={TOUCH} />}>
              Mulai hitung
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Mulai hitung {number}?</AlertDialogTitle>
                <AlertDialogDescription>
                  Daftar hitung diambil dari stok saat ini. Gudang {warehouseCode} dibekukan:
                  transfer di gudang ini tidak bisa divalidasi sampai opname disetujui atau
                  dibatalkan.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={pending}>Kembali</AlertDialogCancel>
                <Button disabled={pending} onClick={() => run(() => startStockCount({ id }))}>
                  {pending ? "Memulai…" : "Mulai hitung"}
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
        {status === "counted" && canWrite && (
          <>
            <Button
              disabled={pending}
              onClick={() => run(() => submitStockCount({ id }))}
              className={TOUCH}
            >
              Ajukan persetujuan
            </Button>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => run(() => reopenStockCount({ id }))}
              className={TOUCH}
            >
              Hitung ulang
            </Button>
          </>
        )}
        {status === "review" && canApprove && (
          <>
            <AlertDialog
              open={dialog === "approve"}
              onOpenChange={(open) => setDialog(open ? "approve" : null)}
            >
              <AlertDialogTrigger render={<Button className={TOUCH} />}>
                Setujui hasil opname
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Setujui opname {number}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {differing
                      ? `${differing} baris berselisih dicatat sebagai penyesuaian dengan tanggal efektif selesai hitung ${completedAt ?? ""}. Stok langsung diperbarui dan gudang dibuka.`
                      : "Tidak ada selisih; sesi ditutup tanpa penyesuaian dan gudang dibuka."}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={pending}>Kembali</AlertDialogCancel>
                  <Button disabled={pending} onClick={() => run(() => approveStockCount({ id }))}>
                    {pending ? "Menyetujui…" : "Setujui"}
                  </Button>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => run(() => rejectStockCount({ id }))}
              className={TOUCH}
            >
              Tolak
            </Button>
          </>
        )}
        {cancellable && (
          <AlertDialog
            open={dialog === "cancel"}
            onOpenChange={(open) => setDialog(open ? "cancel" : null)}
          >
            <AlertDialogTrigger
              render={<Button variant="ghost" className={`text-destructive ${TOUCH}`} />}
            >
              Batalkan sesi
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Batalkan opname {number}?</AlertDialogTitle>
                <AlertDialogDescription>
                  Hasil hitung tidak dipakai, stok tidak berubah, dan gudang dibuka kembali. Sesi
                  tidak bisa dibuka lagi.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={pending}>Kembali</AlertDialogCancel>
                <Button
                  variant="destructive"
                  disabled={pending}
                  onClick={() => run(() => cancelStockCount({ id }))}
                >
                  Batalkan sesi
                </Button>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>
    </div>
  )
}
