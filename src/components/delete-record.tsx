"use client"

import { CircleAlert, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState, useTransition } from "react"

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

// Bagian "Hapus" di halaman detail data master (backlog M1-08). Hanya data yang belum dipakai
// yang bisa dihapus; bila sudah dipakai, server menolak dan pesannya tampil di sini dengan saran
// mengarsipkan.
export function DeleteRecord({
  action,
  id,
  noun,
  label,
  listHref,
}: {
  action: (input: { id: string }) => Promise<ActionResult<unknown>>
  // Kata benda huruf kecil, mis. "produk".
  noun: string
  // Penanda data di judul konfirmasi, mis. SKU atau kode.
  label: string
  id: string
  listHref: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [errors, setErrors] = useState<string[]>()
  const [pending, startTransition] = useTransition()
  const errorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (errors?.length) errorRef.current?.focus()
  }, [errors])

  function confirm() {
    startTransition(async () => {
      const result = await action({ id })
      setOpen(false)
      if (result.ok) router.push(listHref)
      else setErrors(result.errors)
    })
  }

  return (
    <section className="max-w-3xl space-y-3 border-t pt-6" aria-labelledby="delete-record">
      <div>
        <h2 id="delete-record" className="text-base font-semibold">
          Hapus {noun}
        </h2>
        <p className="text-sm text-muted-foreground">
          Hanya untuk {noun} yang belum pernah dipakai, misalnya salah input. {capitalize(noun)}{" "}
          yang sudah dipakai diarsipkan saja dengan mengosongkan centang Aktif.
        </p>
      </div>
      {errors?.length ? (
        <div
          ref={errorRef}
          role="alert"
          tabIndex={-1}
          className="flex gap-2 rounded-lg bg-destructive-soft px-3 py-2.5 text-sm text-destructive outline-none focus-visible:ring-2 focus-visible:ring-destructive/40"
        >
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div className="space-y-0.5">
            {errors.map((message) => (
              <p key={message}>{message}</p>
            ))}
          </div>
        </div>
      ) : null}
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger render={<Button variant="destructive" />}>
          <Trash2 />
          Hapus {noun}
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Hapus {noun} {label}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Data dihapus permanen dan tidak bisa dikembalikan. Catatannya tetap ada di audit log.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Batal</AlertDialogCancel>
            <Button variant="destructive" onClick={confirm} disabled={pending}>
              {pending ? "Menghapus…" : "Hapus"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}
