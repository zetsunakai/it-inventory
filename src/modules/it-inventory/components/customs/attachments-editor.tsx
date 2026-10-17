"use client"

import { Download, Plus, Upload, X } from "lucide-react"
import { useState, useTransition } from "react"

import { FormSection } from "@/components/form-field"
import { Button } from "@/components/ui/button"
import { formatNumber } from "@/lib/format"
import { uploadCustomsAttachment } from "@/modules/it-inventory/actions/customs-documents"
import {
  ATTACHMENT_TYPES,
  type CustomsAttachmentDraft,
} from "@/modules/it-inventory/lib/customs-form"

import { CustomsFormField, type RefLabels } from "./customs-field"
import { RowCard } from "./row-card"

// Lampiran dokumen BC (backlog M3-10): jenis, nomor, tanggal, dan file. File diunggah langsung ke
// storage saat dipilih; barisnya tersimpan bersama dokumen saat Simpan.
export function AttachmentsEditor({
  documentId,
  idPrefix,
  rows,
  onChange,
  refLabels,
  onLabel,
}: {
  documentId?: string
  idPrefix: string
  rows: CustomsAttachmentDraft[]
  onChange: (rows: CustomsAttachmentDraft[]) => void
  refLabels: RefLabels
  onLabel: (label?: { key: string; name: string }) => void
}) {
  const update = (index: number, patch: Partial<CustomsAttachmentDraft>) =>
    onChange(rows.map((row, position) => (position === index ? { ...row, ...patch } : row)))

  return (
    <FormSection
      title="Dokumen lampiran"
      description="Invoice wajib ada sebelum dokumen bisa diajukan. File PDF, gambar, Excel, atau Word, maksimal 5 MB."
      actions={
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            onChange([...rows, { documentTypeCode: "", number: "", date: "", file: null }])
          }
        >
          <Plus />
          Tambah lampiran
        </Button>
      }
    >
      {rows.length === 0 && (
        <p className="text-control text-muted-foreground">Belum ada lampiran.</p>
      )}
      {rows.map((row, index) => (
        <RowCard
          key={index}
          label={`lampiran ${index + 1}`}
          onRemove={() => onChange(rows.filter((_, position) => position !== index))}
        >
          <CustomsFormField
            field={{
              key: "documentTypeCode",
              label: "Jenis",
              kind: "ref",
              refType: "document_type",
              span: 6,
            }}
            id={`${idPrefix}-${index}-type`}
            value={row.documentTypeCode}
            onChange={(value, label) => {
              onLabel(label)
              update(index, { documentTypeCode: value })
            }}
            refLabels={refLabels}
          />
          <CustomsFormField
            field={{ key: "number", label: "Nomor", kind: "text", span: 3 }}
            id={`${idPrefix}-${index}-number`}
            value={row.number}
            onChange={(value) => update(index, { number: value })}
            refLabels={refLabels}
          />
          <CustomsFormField
            field={{ key: "date", label: "Tanggal", kind: "date", span: 3 }}
            id={`${idPrefix}-${index}-date`}
            value={row.date}
            onChange={(value) => update(index, { date: value })}
            refLabels={refLabels}
          />
          <AttachmentFile
            documentId={documentId}
            id={`${idPrefix}-${index}-file`}
            row={row}
            onChange={(file) => update(index, { file })}
          />
        </RowCard>
      ))}
    </FormSection>
  )
}

function AttachmentFile({
  documentId,
  id,
  row,
  onChange,
}: {
  documentId?: string
  id: string
  row: CustomsAttachmentDraft
  onChange: (file: CustomsAttachmentDraft["file"]) => void
}) {
  const [errors, setErrors] = useState<string[]>([])
  const [pending, startTransition] = useTransition()

  function upload(file: File) {
    if (!documentId) return
    const data = new FormData()
    data.set("documentId", documentId)
    data.set("file", file)
    setErrors([])
    startTransition(async () => {
      const result = await uploadCustomsAttachment(null, data)
      if (result.ok) onChange(result.data)
      else setErrors(result.errors)
    })
  }

  return (
    <div className="form-field" data-span={12}>
      <p className="form-field-label">File</p>
      {row.file ? (
        <div className="flex min-h-10 flex-wrap items-center gap-x-3 gap-y-1">
          <a
            href={`/api/customs-files?key=${encodeURIComponent(row.file.fileKey)}`}
            className="inline-flex items-center gap-1.5 text-control font-medium text-primary underline-offset-4 hover:underline"
          >
            <Download className="size-4" />
            {row.file.fileName}
          </a>
          <span className="text-caption text-muted-foreground">
            {formatNumber(Math.ceil(row.file.fileSize / 1024))} KB
          </span>
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
            <X />
            Lepas file
          </Button>
        </div>
      ) : documentId ? (
        <label
          htmlFor={id}
          className="flex min-h-10 w-fit cursor-pointer items-center gap-2 rounded-lg border border-dashed px-3 text-control text-muted-foreground focus-within:ring-3 focus-within:ring-ring/50 hover:text-foreground"
        >
          <Upload className="size-4" />
          {pending ? "Mengunggah…" : "Pilih file"}
          <input
            id={id}
            type="file"
            className="sr-only"
            accept={Object.keys(ATTACHMENT_TYPES).join(",")}
            disabled={pending}
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ""
              if (file) upload(file)
            }}
          />
        </label>
      ) : (
        <p className="flex min-h-10 items-center text-control text-muted-foreground">
          Simpan dokumen dulu untuk mengunggah file.
        </p>
      )}
      {errors.map((message) => (
        <p key={message} className="text-caption font-medium text-destructive">
          {message}
        </p>
      ))}
    </div>
  )
}
