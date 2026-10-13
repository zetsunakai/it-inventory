"use client"

import { CircleAlert, CircleCheck, Download } from "lucide-react"
import Link from "next/link"
import { useActionState, useEffect, useRef } from "react"

import { DataTable, type DataTableColumn } from "@/components/data-table/data-table"
import { FormErrors } from "@/components/form-errors"
import { FormField } from "@/components/form-field"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { ActionResult, FormState } from "@/lib/action-result"
import { formatNumber } from "@/lib/format"
import type { ImportResult, ImportRowError } from "@/lib/import"

type ImportAction = (
  state: FormState<ImportResult>,
  formData: FormData,
) => Promise<ActionResult<ImportResult>>

// Baris kesalahan yang langsung tampil; sisanya ada di file daftar kesalahan.
const SHOWN_ERRORS = 100

// Form import master data (M1-07): pilih file, server memvalidasi semua baris, lalu menyimpan
// semuanya atau tidak sama sekali.
export function ImportForm({
  action,
  noun,
  keyLabel,
  listHref,
  exportHref,
}: {
  action: ImportAction
  // Kata benda untuk ringkasan, mis. "produk".
  noun: string
  // Judul kolom kode di tabel kesalahan, mis. "SKU".
  keyLabel: string
  listHref: string
  // Export Excel data sekarang, sebagai titik awal file import.
  exportHref: string
}) {
  const [state, formAction, pending] = useActionState(action, null)

  return (
    <div className="space-y-6">
      <form action={formAction} className="max-w-xl space-y-4">
        <FormErrors errors={state?.ok === false ? state.errors : undefined} />
        <FormField
          label="File Excel atau CSV"
          htmlFor="import-file"
          hint="Maksimal 5 MB atau 20.000 baris. CSV boleh memakai koma atau titik koma."
        >
          <Input
            id="import-file"
            name="file"
            type="file"
            required
            accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
          />
        </FormField>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Memeriksa file…" : "Import"}
          </Button>
          <a href={exportHref} download className={buttonVariants({ variant: "ghost" })}>
            <Download />
            Unduh data sekarang sebagai template
          </a>
        </div>
      </form>
      {state?.ok && (
        <ImportResultView result={state.data} noun={noun} keyLabel={keyLabel} listHref={listHref} />
      )}
    </div>
  )
}

function ImportResultView({
  result,
  noun,
  keyLabel,
  listHref,
}: {
  result: ImportResult
  noun: string
  keyLabel: string
  listHref: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  // Hasil dibacakan dan terlihat walau form panjang.
  useEffect(() => ref.current?.focus(), [result])

  if (result.status === "imported") {
    const parts = [
      `${formatNumber(result.created)} ${noun} baru`,
      `${formatNumber(result.updated)} diperbarui`,
      `${formatNumber(result.unchanged)} tidak berubah`,
    ]
    return (
      <div
        ref={ref}
        role="status"
        tabIndex={-1}
        className="flex max-w-xl gap-2 rounded-lg bg-success-soft px-3 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
        <div className="space-y-1">
          <p className="font-medium">
            Import selesai: {formatNumber(result.total)} baris diproses.
          </p>
          <p className="text-muted-foreground">{parts.join(", ")}.</p>
          <Link
            href={listHref}
            className="inline-block font-medium text-primary underline-offset-4 hover:underline"
          >
            Lihat daftar {noun}
          </Link>
        </div>
      </div>
    )
  }

  const columns: DataTableColumn<ImportRowError>[] = [
    { header: "Baris", cell: (row) => formatNumber(row.line), align: "right" },
    {
      header: keyLabel,
      cell: (row) => <span className="font-mono text-foreground">{row.key || "—"}</span>,
    },
    {
      header: "Yang perlu diperbaiki",
      className: "w-full whitespace-normal",
      cell: (row) => (
        <ul className="space-y-0.5">
          {row.messages.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      ),
    },
  ]
  const hidden = result.errors.length - SHOWN_ERRORS

  return (
    <section className="space-y-3">
      <div
        ref={ref}
        role="alert"
        tabIndex={-1}
        className="flex gap-2 rounded-lg bg-destructive-soft px-3 py-2.5 text-sm text-destructive outline-none focus-visible:ring-2 focus-visible:ring-destructive/40"
      >
        <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
        <div className="space-y-1">
          <p className="font-medium">
            Tidak ada data yang disimpan: {formatNumber(result.errors.length)} dari{" "}
            {formatNumber(result.total)} baris perlu diperbaiki.
          </p>
          <p>Perbaiki baris berikut di file, lalu import ulang seluruh file.</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {hidden > 0
            ? `${formatNumber(SHOWN_ERRORS)} baris pertama. Daftar lengkap ada di file kesalahan.`
            : "Nomor baris sama dengan nomor baris di Excel."}
        </p>
        <Button variant="outline" onClick={() => downloadErrors(result.errors, keyLabel)}>
          <Download />
          Unduh daftar kesalahan
        </Button>
      </div>
      <DataTable
        columns={columns}
        rows={result.errors.slice(0, SHOWN_ERRORS)}
        rowKey={(row) => String(row.line)}
      />
    </section>
  )
}

// Daftar kesalahan sebagai CSV, dibuat di browser dari hasil yang sudah diterima.
function downloadErrors(errors: ImportRowError[], keyLabel: string) {
  const quote = (value: string) => `"${value.replace(/"/g, '""')}"`
  const lines = [
    ["Baris", keyLabel, "Yang perlu diperbaiki"].map(quote).join(","),
    ...errors.map((row) =>
      [String(row.line), row.key, row.messages.join(" ")].map(quote).join(","),
    ),
  ]
  // BOM supaya Excel membaca UTF-8 dengan benar.
  const blob = new Blob(["﻿", lines.join("\r\n")], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = "kesalahan-import.csv"
  link.click()
  URL.revokeObjectURL(url)
}
