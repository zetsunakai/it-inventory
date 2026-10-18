"use client"

import { Copy } from "lucide-react"
import { useRouter } from "next/navigation"
import { useId, useState, useTransition, type ReactNode } from "react"

import { usePageMessage } from "@/components/layout/page-message"
import { RefCodeSelect } from "@/components/ref-code-select"
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
import { Textarea } from "@/components/ui/textarea"
import type { ActionResult } from "@/lib/action-result"
import {
  duplicateCustomsDocument,
  registerCustomsDocument,
  rejectCustomsDocument,
  resetCustomsDocumentToDraft,
  reviseCustomsDocument,
  submitCustomsDocument,
} from "@/modules/it-inventory/actions/customs-documents"
import type { CustomsDocumentStatus } from "@/modules/it-inventory/lib/customs"

type Response = { responseCode: string; responseNumber: string; responseDate: string }
const EMPTY_RESPONSE: Response = { responseCode: "", responseNumber: "", responseDate: "" }

// Tombol alur dokumen BC sesuai status (backlog M3-11). Hasilnya tampil lewat pesan halaman;
// dialog tetap terbuka bila gagal supaya isian tidak hilang.
export function CustomsDocumentActions({
  id,
  path,
  ajuNumber,
  status,
  canWrite,
  includeDuplicate = true,
}: {
  id: string
  // Path menu jenis dokumen, mis. /dokumen-bc/bc23.
  path: string
  ajuNumber: string
  status: CustomsDocumentStatus
  canWrite: boolean
  includeDuplicate?: boolean
}) {
  const { show } = usePageMessage()
  const [pending, startTransition] = useTransition()
  const [open, setOpen] = useState<string | null>(null)

  function run(action: () => Promise<ActionResult<unknown>>) {
    startTransition(async () => {
      const result = await action()
      if (result.ok) setOpen(null)
      show(result)
    })
  }

  const dialog = (
    key: string,
    trigger: ReactNode,
    variant: "default" | "outline" | "ghost",
    title: string,
    description: ReactNode,
    confirm: { label: string; destructive?: boolean; onConfirm: () => void },
    body?: ReactNode,
  ) => (
    <AlertDialog open={open === key} onOpenChange={(next) => setOpen(next ? key : null)}>
      <AlertDialogTrigger
        render={
          <Button
            variant={variant}
            disabled={pending}
            className={confirm.destructive ? "text-destructive" : undefined}
          />
        }
      >
        {trigger}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {body}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Kembali</AlertDialogCancel>
          <Button
            variant={confirm.destructive ? "destructive" : "default"}
            disabled={pending}
            onClick={confirm.onConfirm}
          >
            {confirm.label}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )

  const actions: ReactNode[] = []
  if (canWrite && status === "ready") {
    actions.push(
      dialog(
        "submit",
        "Ajukan",
        "default",
        `Ajukan dokumen ${ajuNumber}?`,
        "Pastikan dokumen sudah diinput di portal CEISA. Setelah diajukan, dokumen tidak bisa diubah sampai ada respon.",
        { label: "Ajukan", onConfirm: () => run(() => submitCustomsDocument({ id })) },
      ),
    )
  }
  if (canWrite && status === "submitted") {
    actions.push(
      <RegisterDialog
        key="register"
        open={open === "register"}
        onOpenChange={(next) => setOpen(next ? "register" : null)}
        pending={pending}
        onConfirm={(values) => run(() => registerCustomsDocument({ id, ...values }))}
      />,
      <RejectDialog
        key="reject"
        open={open === "reject"}
        onOpenChange={(next) => setOpen(next ? "reject" : null)}
        pending={pending}
        onConfirm={(values) => run(() => rejectCustomsDocument({ id, ...values }))}
      />,
    )
  }
  if (canWrite && status === "rejected") {
    actions.push(
      <Button
        key="reset"
        disabled={pending}
        onClick={() => run(() => resetCustomsDocumentToDraft({ id }))}
      >
        Kembali ke Draft
      </Button>,
    )
  }
  if (canWrite && status === "registered") {
    actions.push(
      <ReviseDialog
        key="revise"
        open={open === "revise"}
        onOpenChange={(next) => setOpen(next ? "revise" : null)}
        pending={pending}
        onConfirm={(reason) => run(() => reviseCustomsDocument({ id, reason }))}
      />,
    )
  }
  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((action, index) => (
        <span key={index} className="contents">
          {action}
        </span>
      ))}
      {canWrite && includeDuplicate && <DuplicateCustomsButton id={id} path={path} />}
    </div>
  )
}

export function DuplicateCustomsButton({
  id,
  path,
  disabled,
}: {
  id: string
  path: string
  disabled?: boolean
}) {
  const router = useRouter()
  const { show } = usePageMessage()
  const [pending, startTransition] = useTransition()
  return (
    <Button
      type="button"
      variant="outline"
      disabled={disabled || pending}
      onClick={() =>
        startTransition(async () => {
          const result = await duplicateCustomsDocument({ id })
          show(result)
          if (result.ok) router.push(`${path}/${result.data.id}`)
        })
      }
    >
      <Copy aria-hidden />
      Duplikat
    </Button>
  )
}

function ResponseFields({
  idPrefix,
  value,
  onChange,
}: {
  idPrefix: string
  value: Response
  onChange: (value: Response) => void
}) {
  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-code`}>Respon</Label>
        <RefCodeSelect
          id={`${idPrefix}-code`}
          type="response"
          onValueChange={(option) => onChange({ ...value, responseCode: option?.code ?? "" })}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-number`}>Nomor respon</Label>
          <Input
            id={`${idPrefix}-number`}
            value={value.responseNumber}
            onChange={(event) => onChange({ ...value, responseNumber: event.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${idPrefix}-date`}>Tanggal respon</Label>
          <Input
            id={`${idPrefix}-date`}
            type="date"
            value={value.responseDate}
            onChange={(event) => onChange({ ...value, responseDate: event.target.value })}
          />
        </div>
      </div>
    </>
  )
}

function RegisterDialog({
  open,
  onOpenChange,
  pending,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  pending: boolean
  onConfirm: (values: Response & { registrationNumber: string; registrationDate: string }) => void
}) {
  const uid = useId()
  const [number, setNumber] = useState("")
  const [date, setDate] = useState("")
  const [response, setResponse] = useState(EMPTY_RESPONSE)
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogTrigger render={<Button disabled={pending} />}>
        Catat terdaftar
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Catat dokumen terdaftar</AlertDialogTitle>
          <AlertDialogDescription>
            Isi nomor dan tanggal daftar dari respon persetujuan Bea Cukai. Setelah Terdaftar,
            koreksi hanya lewat revisi.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`${uid}-number`}>Nomor daftar</Label>
            <Input
              id={`${uid}-number`}
              className="font-mono"
              value={number}
              onChange={(event) => setNumber(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${uid}-date`}>Tanggal daftar</Label>
            <Input
              id={`${uid}-date`}
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </div>
        </div>
        <ResponseFields idPrefix={`${uid}-response`} value={response} onChange={setResponse} />
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Kembali</AlertDialogCancel>
          <Button
            disabled={pending}
            onClick={() =>
              onConfirm({ registrationNumber: number, registrationDate: date, ...response })
            }
          >
            Catat terdaftar
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function RejectDialog({
  open,
  onOpenChange,
  pending,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  pending: boolean
  onConfirm: (values: Response & { reason: string }) => void
}) {
  const uid = useId()
  const [reason, setReason] = useState("")
  const [response, setResponse] = useState(EMPTY_RESPONSE)
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogTrigger render={<Button variant="outline" disabled={pending} />}>
        Catat ditolak
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Catat dokumen ditolak</AlertDialogTitle>
          <AlertDialogDescription>
            Dokumen yang ditolak bisa dikembalikan ke Draft untuk diperbaiki lalu diajukan lagi.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor={`${uid}-reason`}>Alasan penolakan</Label>
          <Textarea
            id={`${uid}-reason`}
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </div>
        <ResponseFields idPrefix={`${uid}-response`} value={response} onChange={setResponse} />
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Kembali</AlertDialogCancel>
          <Button disabled={pending} onClick={() => onConfirm({ reason, ...response })}>
            Catat ditolak
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function ReviseDialog({
  open,
  onOpenChange,
  pending,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  pending: boolean
  onConfirm: (reason: string) => void
}) {
  const uid = useId()
  const [reason, setReason] = useState("")
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogTrigger render={<Button variant="outline" disabled={pending} />}>
        Revisi
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Buat revisi dokumen</AlertDialogTitle>
          <AlertDialogDescription>
            Versi sekarang disimpan apa adanya dan bisa dibuka lagi. Dokumen kembali ke Draft dengan
            nomor aju yang sama untuk dikoreksi, lalu diajukan dan didaftarkan ulang.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor={`${uid}-reason`}>Alasan revisi</Label>
          <Textarea
            id={`${uid}-reason`}
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Kembali</AlertDialogCancel>
          <Button disabled={pending} onClick={() => onConfirm(reason)}>
            Buat revisi
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
