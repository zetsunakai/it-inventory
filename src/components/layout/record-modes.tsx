"use client"

import { Pencil, Plus } from "lucide-react"
import Link from "next/link"
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react"

import { DocumentStatusSlot } from "@/components/document/document-status"
import { usePageMessage } from "@/components/layout/page-message"
import { Button, buttonVariants } from "@/components/ui/button"
import type { ActionResult } from "@/lib/action-result"

// Mode baca dan ubah halaman detail data (pola hmx-002): halaman dibuka dalam mode baca dengan
// tombol Edit dan Buat di atas; Edit menampilkan form dengan Simpan dan Buang. Simpan yang
// berhasil kembali ke mode baca (pesannya di slot pesan halaman), Buang membuang perubahan.
// Peran tanpa hak ubah hanya melihat mode baca.

type FormMode = { cancel?: () => void; saved: (result: ActionResult<unknown>) => void }

const FormModeContext = createContext<FormMode | null>(null)

export function RecordModes({
  view,
  form,
  canEdit,
  createHref,
  actions,
  initialEditing = false,
}: {
  view: ReactNode
  form: ReactNode
  canEdit: boolean
  // Tombol Buat ke halaman data baru; kosongkan bila data ini tidak bisa dibuat dari sini.
  createHref?: string
  // Aksi tambahan mode baca setelah Edit dan Buat (mis. Submit, Duplikat, Hapus dokumen).
  actions?: ReactNode
  // Data belum ada (mis. profil perusahaan belum diisi): langsung form, tanpa Buang. Tetap pakai
  // RecordModes supaya setelah tersimpan pindah ke mode baca dengan pesannya.
  initialEditing?: boolean
}) {
  const [editing, setEditing] = useState(initialEditing)
  const { show, clear } = usePageMessage()
  const mode = useMemo<FormMode>(
    () => ({
      cancel: initialEditing ? undefined : () => setEditing(false),
      saved: (result) => {
        show(result)
        setEditing(false)
      },
    }),
    [show, initialEditing],
  )

  if (canEdit && editing) return <FormModeContext value={mode}>{form}</FormModeContext>

  return (
    <div className="form-page">
      {canEdit && (
        <div className="form-actions">
          <Button
            type="button"
            onClick={() => {
              clear()
              setEditing(true)
            }}
          >
            <Pencil />
            Edit
          </Button>
          {createHref && (
            <Link href={createHref} className={buttonVariants({ variant: "outline" })}>
              <Plus />
              Buat
            </Link>
          )}
          {actions}
          <DocumentStatusSlot />
        </div>
      )}
      {view}
    </div>
  )
}

// Tombol Buang di FormActions; hanya tampil saat form dibuka dari mode baca.
export function DiscardButton() {
  const mode = useContext(FormModeContext)
  if (!mode?.cancel) return null
  return (
    <Button type="button" variant="outline" onClick={mode.cancel}>
      Buang
    </Button>
  )
}

// Dipanggil form dengan hasil action terakhirnya. Dibuka dari mode baca (RecordModes): kembali ke
// mode baca dan pesannya di slot pesan halaman. Di luar itu (form yang tetap tampil setelah
// disimpan, mis. profil perusahaan pertama kali): pesannya saja di slot pesan halaman.
export function useSaveFeedback(result: ActionResult<unknown> | null | undefined) {
  const mode = useContext(FormModeContext)
  const { show } = usePageMessage()
  useEffect(() => {
    if (!result?.ok) return
    if (mode) mode.saved(result)
    else show(result)
  }, [result, mode, show])
}
