"use client"

import { useState, useTransition } from "react"

import { closePeriod } from "@/app/(app)/inventory/periode/actions"
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

// Tutup satu periode bulanan setelah konfirmasi. Tidak bisa dibuka kembali.
export function ClosePeriodButton({
  year,
  month,
  label,
}: {
  year: number
  month: number
  label: string
}) {
  const [open, setOpen] = useState(false)
  const [errors, setErrors] = useState<string[]>()
  const [pending, startTransition] = useTransition()

  return (
    <div className="flex flex-col items-end gap-1">
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger render={<Button size="sm" />}>Tutup periode</AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tutup periode {label}?</AlertDialogTitle>
            <AlertDialogDescription>
              Saldo akhir bulan disimpan untuk laporan, dan tidak ada transaksi baru yang boleh
              bertanggal di bulan ini. Periode yang sudah ditutup tidak bisa dibuka kembali.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Kembali</AlertDialogCancel>
            <Button
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await closePeriod({ year, month })
                  setOpen(false)
                  setErrors(result.ok ? undefined : result.errors)
                })
              }
            >
              {pending ? "Menutup…" : "Tutup periode"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {errors?.length ? (
        <p role="alert" className="max-w-xs text-right text-caption font-medium text-destructive">
          {errors.join(" ")}
        </p>
      ) : null}
    </div>
  )
}
