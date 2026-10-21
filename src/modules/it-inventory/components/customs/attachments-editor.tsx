"use client"

import { Download, Upload, X } from "lucide-react"
import { useState, useTransition } from "react"

import { FormSection } from "@/components/form-field"
import { RelationalTable } from "@/components/relational/relational-table"
import { newRelation, relationKey } from "@/components/relational/relational-utils"
import { Button } from "@/components/ui/button"
import { formatNumber } from "@/lib/format"
import { uploadCustomsAttachment } from "@/modules/it-inventory/actions/customs-documents"
import {
  ATTACHMENT_TYPES,
  emptyAttachment,
  formatCustomsValue,
  type CustomsAttachmentDraft,
  type CustomsField,
} from "@/modules/it-inventory/lib/customs-form"

import { CustomsControl, type RefLabels } from "./customs-field"

// Lampiran dokumen BC (backlog M3-10) dan Dokumen Lartas per barang: kolom mengikuti daftar hmx
// (Jenis, Nomor, Tanggal, Facility, Izin, Kantor, File). File diunggah langsung ke storage saat
// dipilih; barisnya tersimpan bersama dokumen saat Simpan.
export function AttachmentsEditor({
  title,
  description,
  columns,
  documentId,
  idPrefix,
  rows,
  onChange,
  refLabels,
  onLabel,
}: {
  title: string
  description?: string
  columns: CustomsField[]
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
    <FormSection title={title} description={description}>
      <RelationalTable<CustomsAttachmentDraft>
        id={`bc-${title}`}
        label={title}
        rows={rows}
        rowKey={relationKey}
        onReorder={onChange}
        onRemove={(keys) => onChange(rows.filter((row) => !keys.includes(relationKey(row))))}
        addLabel="Tambah"
        onAdd={() => {
          const row = newRelation(emptyAttachment())
          onChange([...rows, row])
          return relationKey(row)
        }}
        columns={columns.map((column) => ({
          id: column.key,
          label: column.label,
          required: column.required,
          optional: !column.required,
          width: column.kind === "ref" || column.kind === "file" ? 300 : 200,
          value: (row) =>
            column.kind === "file"
              ? (row.file?.fileName ?? "")
              : formatCustomsValue(
                  column,
                  (row as unknown as Record<string, string>)[column.key],
                  refLabels,
                ),
          render:
            column.kind === "file"
              ? (row) =>
                  row.file ? (
                    <a
                      href={`/api/customs-files?key=${encodeURIComponent(row.file.fileKey)}`}
                      className="text-primary hover:underline"
                    >
                      {row.file.fileName}
                    </a>
                  ) : (
                    "—"
                  )
              : undefined,
          edit: (row, index) =>
            column.kind === "file" ? (
              <AttachmentFile
                label={column.label}
                documentId={documentId}
                id={`${idPrefix}-${relationKey(row)}-file`}
                row={row}
                onChange={(file) => update(index, { file })}
              />
            ) : (
              <CustomsControl
                field={column}
                id={`${idPrefix}-${relationKey(row)}-${column.key}`}
                value={(row as unknown as Record<string, string>)[column.key] ?? ""}
                ariaLabel={`${column.label} ${title} seri ${index + 1}`}
                onChange={(value, label) => {
                  onLabel(label)
                  update(index, { [column.key]: value })
                }}
                refLabels={refLabels}
              />
            ),
        }))}
      />
    </FormSection>
  )
}

function AttachmentFile({
  label,
  documentId,
  id,
  row,
  onChange,
}: {
  label: string
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
      <p className="form-field-label">{label}</p>
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
