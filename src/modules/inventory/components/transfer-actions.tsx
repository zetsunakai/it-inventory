"use client"

import Link from "next/link"
import { useState, useTransition } from "react"

import {
  approveTransfer,
  cancelTransfer,
  checkTransferAvailability,
  confirmTransfer,
  releaseTransferReservation,
  reopenTransfer,
  validateTransfer,
} from "@/modules/inventory/actions/transfers"
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
import { usePageMessage } from "@/components/layout/page-message"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { formatDecimal, toDecimalInput } from "@/lib/decimal"
import { formatDate } from "@/lib/format"
import type { ActionResult } from "@/lib/action-result"
import type { TransferStatus } from "@/modules/inventory/lib/inventory"
import { transferActions } from "@/modules/inventory/lib/transfer"

import { RejectTransferButton } from "./reject-transfer-button"

// Aksi transfer sesuai statusnya (PRD bagian 6.3, backlog R-06): Draft → Konfirmasi → Menunggu /
// Sebagian tersedia / Siap → Validasi, Cek stok, Kembali ke Draft, atau Batal.
// Tombol tampil di kanan header halaman; semua alasan gagal dari server (mis. stok tidak cukup per
// produk) tampil sekaligus di slot pesan di bawah header (usePageMessage, UF-03).
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
  instant = false,
  fromRequest = false,
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
  // Baris barang untuk qty selesai saat validasi. Kosong = selalu penuh. Baris yang sudah punya
  // rincian lot (RU-03) memakai jumlah rinciannya; qty-nya tidak diisi di dialog.
  lines: {
    id: string
    sku: string
    productName: string
    inputQty: string
    uomCode: string
    detailed?: { qty: string; requested: string; uomCode: string }
  }[]
  // Scrap/penyesuaian: Validasi diganti "Setujui dan validasi" khusus Manajer.
  needsApproval?: boolean
  canApprove?: boolean
  // Transfer yang mengambil stok gudang memesan stok (R-07); hanya itu yang bisa dilepas.
  reservable?: boolean
  // Pindah lokasi (R-09): Validasi langsung dari Draft, tanpa Konfirmasi terpisah.
  instant?: boolean
  // Transfer milik permintaan antar gudang atau retur (R-10, R-11).
  fromRequest?: boolean
}) {
  const { show } = usePageMessage()
  const [pending, startTransition] = useTransition()
  const [validateOpen, setValidateOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date())
  const [effectiveDate, setEffectiveDate] = useState(today)
  // Qty selesai dicatat user, mulai kosong (I-01, seperti hmx). Bila belum ada yang dicatat sama
  // sekali, Validasi meminta konfirmasi untuk memproses semua qty diminta ("Immediate Transfer").
  // Bila ada yang dicatat, baris yang kosong berarti 0.
  const [edited, setEdited] = useState<Record<string, string>>({})
  const [confirmAll, setConfirmAll] = useState(false)
  const editable = lines.filter((line) => !line.detailed)
  const recorded =
    lines.some((line) => line.detailed) || editable.some((line) => edited[line.id]?.trim())
  const quantities = Object.fromEntries(
    editable.map((line) => [line.id, edited[line.id]?.trim() || "0"]),
  )
  const partial =
    recorded &&
    lines.some((line) =>
      line.detailed
        ? Number(line.detailed.qty) < Number(line.detailed.requested)
        : Number(quantities[line.id].replace(",", ".")) !== Number(line.inputQty),
    )
  // Sisa qty: transfer lanjutan atau dibuang (R-08). Backdate wajib dikonfirmasi.
  const [createBackorder, setCreateBackorder] = useState(true)
  const [backdateConfirmed, setBackdateConfirmed] = useState(false)
  const backdated = canBackdate && effectiveDate < today
  const verb = needsApproval ? "Setujui dan validasi" : "Validasi"

  function run(action: () => Promise<ActionResult<unknown>>, close?: () => void) {
    startTransition(async () => {
      const next = await action()
      close?.()
      const backorder = backorderOf(next)
      show(
        next,
        backorder && (
          <p>
            Sisa barang dibuat sebagai{" "}
            <Link
              href={`${path}/${backorder.id}`}
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              {noun} lanjutan {backorder.number}
            </Link>
            .
          </p>
        ),
      )
    })
  }

  // Hanya aksi yang berlaku di status ini yang tampil (RU-02). Transfer Selesai/Batal tidak punya
  // aksi lagi; pesan hasil aksi terakhir tetap di slot pesan.
  const actions = new Set(transferActions({ status, reservable, instant, fromRequest }))
  if (!actions.size) return null

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {actions.has("confirm") && (
          <Button
            disabled={pending}
            onClick={() => run(() => confirmTransfer({ id }))}
            className="pointer-coarse:h-11"
          >
            Konfirmasi
          </Button>
        )}
        {actions.has("check") && (
          <Button
            variant={status === "waiting" ? "default" : "outline"}
            disabled={pending}
            onClick={() => run(() => checkTransferAvailability({ id }))}
            className="pointer-coarse:h-11"
          >
            Cek stok
          </Button>
        )}
        {actions.has("validate") && (
          <>
            <AlertDialog
              open={validateOpen}
              onOpenChange={(next) => {
                setValidateOpen(next)
                setConfirmAll(false)
              }}
            >
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
                    {effect}. Setelah divalidasi, transfer terkunci; koreksi hanya lewat retur atau
                    penyesuaian.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                {lines.length > 0 && (
                  <fieldset className="space-y-2">
                    <legend className="flex w-full items-center justify-between text-sm font-medium">
                      Qty yang benar-benar selesai
                      {editable.length > 0 && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEdited(
                              Object.fromEntries(
                                editable.map((line) => [line.id, toDecimalInput(line.inputQty)]),
                              ),
                            )
                            setConfirmAll(false)
                          }}
                        >
                          Isi semua
                        </Button>
                      )}
                    </legend>
                    {lines.map((line) => (
                      <div key={line.id} className="flex items-center gap-2">
                        <Label
                          htmlFor={`done-${line.id}`}
                          className="flex min-w-0 flex-1 flex-col items-start gap-0 font-normal"
                        >
                          <span className="w-full truncate">
                            <span className="font-mono">{line.sku}</span> {line.productName}
                          </span>
                          <span className="text-caption text-muted-foreground tabular-nums">
                            Diminta {formatDecimal(line.inputQty)} {line.uomCode}
                          </span>
                        </Label>
                        {line.detailed ? (
                          <span id={`done-${line.id}`} className="text-right text-sm tabular-nums">
                            {formatDecimal(line.detailed.qty)} {line.detailed.uomCode}
                            <span className="block text-caption text-muted-foreground">
                              dari rincian lot
                            </span>
                          </span>
                        ) : (
                          <>
                            <Input
                              id={`done-${line.id}`}
                              inputMode="decimal"
                              value={edited[line.id] ?? ""}
                              placeholder="0"
                              onChange={(event) => {
                                setEdited((current) => ({
                                  ...current,
                                  [line.id]: event.target.value,
                                }))
                                setConfirmAll(false)
                              }}
                              className="w-28 text-right tabular-nums pointer-coarse:h-11"
                            />
                            <span className="w-12 text-sm text-muted-foreground">
                              {line.uomCode}
                            </span>
                          </>
                        )}
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
                    <p className="text-caption text-muted-foreground">
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
                {confirmAll && (
                  <p role="alert" className="rounded-lg bg-warning-soft px-3 py-2.5 text-sm">
                    Belum ada qty selesai yang dicatat. Proses semua qty diminta?
                  </p>
                )}
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={pending}>Batal</AlertDialogCancel>
                  <Button
                    disabled={pending || (backdated && !backdateConfirmed)}
                    onClick={() => {
                      if (lines.length > 0 && !recorded && !confirmAll) {
                        setConfirmAll(true)
                        return
                      }
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
                                quantities: partial && editable.length ? quantities : undefined,
                                createBackorder,
                              }),
                        () => setValidateOpen(false),
                      )
                    }}
                  >
                    {pending ? "Memproses…" : confirmAll ? "Proses semua" : verb}
                  </Button>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
        {needsApproval && canApprove && CONFIRMED.includes(status) && (
          <RejectTransferButton id={id} number={number} noun={noun} />
        )}
        {actions.has("release") && (
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => run(() => releaseTransferReservation({ id }))}
            className="pointer-coarse:h-11"
          >
            Lepas reservasi
          </Button>
        )}
        {actions.has("reopen") && (
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
    </>
  )
}

// Scrap/penyesuaian yang sudah dikonfirmasi bisa ditolak Manajer (I-03), termasuk yang menunggu stok.
const CONFIRMED: TransferStatus[] = ["waiting", "partially_available", "ready"]

function backorderOf(result: ActionResult<unknown>) {
  if (!result.ok || !result.data || typeof result.data !== "object") return null
  const { backorder } = result.data as { backorder?: { id: string; number: string } | null }
  return backorder ?? null
}
