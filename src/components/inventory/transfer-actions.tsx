"use client"

import { CircleAlert, CircleCheck } from "lucide-react"
import Link from "next/link"
import { useEffect, useRef, useState, useTransition } from "react"

import {
  approveTransfer,
  cancelTransfer,
  checkTransferAvailability,
  confirmTransfer,
  releaseTransferReservation,
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
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toDecimalInput } from "@/lib/decimal"
import { formatDate } from "@/lib/format"
import type { ActionResult } from "@/lib/action-result"
import type { TransferStatus } from "@/lib/inventory"

// Aksi transfer sesuai statusnya (PRD bagian 6.3, backlog R-06): Draft → Konfirmasi → Menunggu /
// Sebagian tersedia / Siap → Validasi, Cek stok, Kembali ke Draft, atau Batal.
// Semua alasan gagal dari server (mis. stok tidak cukup per produk) tampil di sini sekaligus.
export function TransferActions({
  id,
  number,
  status,
  noun,
  effect,
  canBackdate,
  path,
  lines,
  needsApproval = false,
  canApprove = false,
  reservable = false,
}: {
  id: string
  number: string
  status: TransferStatus
  noun: string
  // Akibat validasi untuk kalimat konfirmasi, mis. "Stok di lokasi tujuan bertambah".
  effect: string
  // Manajer boleh memilih tanggal efektif mundur (PRD bagian 6.4).
  canBackdate: boolean
  // Halaman jenis transfer ini, untuk tautan ke transfer lanjutan (backorder).
  path: string
  // Baris barang untuk qty selesai saat validasi. Kosong = selalu penuh.
  lines: { id: string; sku: string; inputQty: string; uomCode: string }[]
  // Scrap/penyesuaian: Validasi diganti "Setujui dan validasi" khusus Manajer.
  needsApproval?: boolean
  canApprove?: boolean
  // Transfer yang mengambil stok gudang memesan stok (R-07); hanya itu yang bisa dilepas.
  reservable?: boolean
}) {
  const [result, setResult] = useState<ActionResult<unknown> | null>(null)
  const [pending, startTransition] = useTransition()
  const [validateOpen, setValidateOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date())
  const [effectiveDate, setEffectiveDate] = useState(today)
  // Hanya qty yang diubah user; baris lain memakai qty rencana terbaru dari server.
  const [edited, setEdited] = useState<Record<string, string>>({})
  const quantities = Object.fromEntries(
    lines.map((line) => [line.id, edited[line.id] ?? toDecimalInput(line.inputQty)]),
  )
  const partial = lines.some(
    (line) => Number(quantities[line.id].replace(",", ".")) !== Number(line.inputQty),
  )
  // Sisa qty: transfer lanjutan atau dibuang (R-08). Backdate wajib dikonfirmasi.
  const [createBackorder, setCreateBackorder] = useState(true)
  const [backdateConfirmed, setBackdateConfirmed] = useState(false)
  const backdated = canBackdate && effectiveDate < today
  const messageRef = useRef<HTMLDivElement>(null)
  const verb = needsApproval ? "Setujui dan validasi" : "Validasi"

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
  const open = status !== "done" && status !== "cancelled"
  const confirmed = open && status !== "draft"
  // Validasi bila stok sudah (sebagian) tersedia; qty yang belum tersedia diisi lebih kecil.
  const validatable = status === "ready" || status === "partially_available"
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
              <p>
                {result.message ?? messageOf(result)}
                {backorderOf(result) && (
                  <>
                    {" "}
                    Sisa barang dibuat sebagai{" "}
                    <Link
                      href={`${path}/${backorderOf(result)!.id}`}
                      className="font-medium text-primary underline-offset-4 hover:underline"
                    >
                      {noun} lanjutan {backorderOf(result)!.number}
                    </Link>
                    .
                  </>
                )}
              </p>
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
              onClick={() => run(() => confirmTransfer({ id }))}
              className="pointer-coarse:h-11"
            >
              Konfirmasi
            </Button>
          )}
          {(status === "waiting" || status === "partially_available") && (
            <Button
              variant={status === "waiting" ? "default" : "outline"}
              disabled={pending}
              onClick={() => run(() => checkTransferAvailability({ id }))}
              className="pointer-coarse:h-11"
            >
              Cek stok
            </Button>
          )}
          {validatable && (
            <>
              <AlertDialog open={validateOpen} onOpenChange={setValidateOpen}>
                {needsApproval && !canApprove ? (
                  <p className="self-center text-sm text-muted-foreground">
                    Menunggu persetujuan Manajer.
                  </p>
                ) : (
                  <AlertDialogTrigger render={<Button className="pointer-coarse:h-11" />}>
                    {verb}
                  </AlertDialogTrigger>
                )}
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      {verb} {noun} {number}?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      {effect}. Setelah divalidasi, transfer terkunci; koreksi hanya lewat retur
                      atau penyesuaian.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  {lines.length > 0 && (
                    <fieldset className="space-y-2">
                      <legend className="text-sm font-medium">Qty yang benar-benar selesai</legend>
                      {lines.map((line) => (
                        <div key={line.id} className="flex items-center gap-2">
                          <Label
                            htmlFor={`done-${line.id}`}
                            className="min-w-0 flex-1 truncate font-mono font-normal"
                          >
                            {line.sku}
                          </Label>
                          <Input
                            id={`done-${line.id}`}
                            inputMode="decimal"
                            value={quantities[line.id]}
                            onChange={(event) =>
                              setEdited((current) => ({
                                ...current,
                                [line.id]: event.target.value,
                              }))
                            }
                            className="w-28 text-right tabular-nums pointer-coarse:h-11"
                          />
                          <span className="w-12 text-sm text-muted-foreground">{line.uomCode}</span>
                        </div>
                      ))}
                      {partial && (
                        <div role="radiogroup" aria-label="Sisa qty" className="space-y-1.5 pt-1">
                          <p className="text-sm font-medium">Sisa qty</p>
                          {(
                            [
                              [true, `Buat ${noun} lanjutan (Draft) untuk sisanya`],
                              [false, "Buang sisa, tidak ada transfer lanjutan"],
                            ] as const
                          ).map(([value, label]) => (
                            <label
                              key={String(value)}
                              className="flex items-center gap-2 text-sm pointer-coarse:min-h-11"
                            >
                              <input
                                type="radio"
                                name="remainder"
                                checked={createBackorder === value}
                                onChange={() => setCreateBackorder(value)}
                                className="size-4 accent-primary"
                              />
                              {label}
                            </label>
                          ))}
                        </div>
                      )}
                    </fieldset>
                  )}
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
                      {backdated && (
                        <div className="flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2.5">
                          <Checkbox
                            id="confirm-backdate"
                            checked={backdateConfirmed}
                            onCheckedChange={(checked) => setBackdateConfirmed(checked === true)}
                          />
                          <Label htmlFor="confirm-backdate" className="leading-snug font-normal">
                            Transaksi backdate: stok dan laporan per{" "}
                            {formatDate(new Date(`${effectiveDate}T12:00:00+07:00`))} ikut berubah.
                            Saya pastikan barang memang bergerak di tanggal itu.
                          </Label>
                        </div>
                      )}
                    </div>
                  )}
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={pending}>Batal</AlertDialogCancel>
                    <Button
                      disabled={pending || (backdated && !backdateConfirmed)}
                      onClick={() =>
                        run(
                          () =>
                            needsApproval
                              ? approveTransfer({
                                  id,
                                  effectiveDate: canBackdate ? effectiveDate : undefined,
                                })
                              : validateTransfer({
                                  id,
                                  effectiveDate: canBackdate ? effectiveDate : undefined,
                                  quantities: partial ? quantities : undefined,
                                  createBackorder,
                                }),
                          () => setValidateOpen(false),
                        )
                      }
                    >
                      {pending ? "Memproses…" : verb}
                    </Button>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
          {reservable && validatable && (
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => run(() => releaseTransferReservation({ id }))}
              className="pointer-coarse:h-11"
            >
              Lepas reservasi
            </Button>
          )}
          {confirmed && (
            <Button
              variant="outline"
              disabled={pending}
              onClick={() => run(() => reopenTransfer({ id }))}
              className="pointer-coarse:h-11"
            >
              Kembali ke Draft
            </Button>
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

// Pesan sukses yang ditentukan server (mis. status hasil Konfirmasi).
function messageOf(result: ActionResult<unknown>) {
  if (!result.ok || !result.data || typeof result.data !== "object") return null
  return (result.data as { message?: string }).message ?? null
}

function backorderOf(result: ActionResult<unknown>) {
  if (!result.ok || !result.data || typeof result.data !== "object") return null
  const { backorder } = result.data as { backorder?: { id: string; number: string } | null }
  return backorder ?? null
}
