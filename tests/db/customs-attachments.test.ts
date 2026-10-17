import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { NextRequest } from "next/server"
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest"

import { GET as downloadFile } from "@/app/api/customs-files/route"
import type { Role } from "@/lib/permissions"
import {
  saveCustomsDocument,
  uploadCustomsAttachment,
} from "@/modules/it-inventory/actions/customs-documents"
import { emptyDraft, MAX_ATTACHMENT_BYTES } from "@/modules/it-inventory/lib/customs-form"
import { BC41 } from "@/modules/it-inventory/lib/customs-specs"
import { getCustomsDocument } from "@/modules/it-inventory/server/queries/customs-documents"
import type { CurrentUser } from "@/server/auth/session"
import { db } from "@/server/db"
import { company } from "@/server/db/schema"

import { insertTestCompany, purgeCustomsDocuments } from "./customs-fixtures"

// Lampiran dokumen BC dan modul penyimpanan file (backlog M3-10), dengan storage folder lokal
// sementara.

const session = vi.hoisted(() => ({ user: null as CurrentUser | null }))
vi.mock("@/server/auth/session", () => ({
  requireUser: async () => session.user,
  getApiUser: async () => session.user,
}))
vi.mock("next/cache", () => ({ refresh: vi.fn() }))

function loginAs(roles: Role[]) {
  session.user = {
    id: crypto.randomUUID(),
    name: "Staf Exim",
    email: "exim@it-inventory.local",
    roles,
    twoFactorEnabled: true,
  }
}

let storageDir = ""

beforeAll(async () => {
  storageDir = await mkdtemp(path.join(tmpdir(), "customs-files-"))
  process.env.STORAGE_DRIVER = "local"
  process.env.STORAGE_DIR = storageDir
  await insertTestCompany(db)
})

afterAll(async () => {
  await purgeCustomsDocuments(db)
  await db.delete(company)
  await rm(storageDir, { recursive: true, force: true })
  await db.$client.end()
})

const empty = () => ({ ...emptyDraft(BC41), lines: [] })

async function createDocument() {
  const data = new FormData()
  data.set("docCode", "41")
  data.set("document", JSON.stringify(empty()))
  const result = await saveCustomsDocument(null, data)
  if (!result.ok) throw new Error(result.errors.join("\n"))
  return result.data.id
}

function upload(documentId: string, file: File) {
  const data = new FormData()
  data.set("documentId", documentId)
  data.set("file", file)
  return uploadCustomsAttachment(null, data)
}

function save(documentId: string, draft: ReturnType<typeof empty>) {
  const data = new FormData()
  data.set("id", documentId)
  data.set("docCode", "41")
  data.set("document", JSON.stringify(draft))
  return saveCustomsDocument(null, data)
}

describe("lampiran dokumen BC", () => {
  test("unggah, simpan bersama dokumen, lalu unduh lagi", async () => {
    loginAs(["staf_exim"])
    const id = await createDocument()
    const uploaded = await upload(
      id,
      new File(["%PDF-1.4 invoice"], "Invoice 001.pdf", { type: "application/pdf" }),
    )
    if (!uploaded.ok) throw new Error(uploaded.errors.join("\n"))
    expect(uploaded.data).toMatchObject({
      fileName: "Invoice 001.pdf",
      contentType: "application/pdf",
      fileSize: 16,
    })
    expect(uploaded.data.fileKey).toMatch(new RegExp(`^customs/${id}/[0-9a-f-]{36}\\.pdf$`))

    const draft = empty()
    draft.attachments = [
      { documentTypeCode: "380", number: "INV-001", date: "2026-10-17", file: uploaded.data },
    ]
    expect(await save(id, draft)).toMatchObject({ ok: true })
    const saved = await getCustomsDocument(BC41, id)
    expect(saved?.draft.attachments).toEqual(draft.attachments)

    loginAs(["auditor"])
    const response = await downloadFile(
      new NextRequest(
        `http://localhost/api/customs-files?key=${encodeURIComponent(uploaded.data.fileKey)}`,
      ),
    )
    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toBe("application/pdf")
    expect(response.headers.get("content-disposition")).toBe(
      "attachment; filename*=UTF-8''Invoice%20001.pdf",
    )
    expect(await response.text()).toBe("%PDF-1.4 invoice")

    // Kunci yang tidak tercatat sebagai lampiran tidak bisa diunduh.
    const unknown = await downloadFile(
      new NextRequest(`http://localhost/api/customs-files?key=customs/${id}/lain.pdf`),
    )
    expect(unknown.status).toBe(404)
  })

  test("jenis dan ukuran file dibatasi; hanya Draft yang sudah tersimpan", async () => {
    loginAs(["staf_exim"])
    const id = await createDocument()
    const wrongType = await upload(id, new File(["x"], "skrip.sh", { type: "text/x-sh" }))
    expect(wrongType).toMatchObject({
      ok: false,
      errors: ["Jenis file harus PDF, JPG, PNG, Excel, atau Word."],
    })
    const tooBig = await upload(
      id,
      new File([new Uint8Array(MAX_ATTACHMENT_BYTES + 1)], "besar.pdf", {
        type: "application/pdf",
      }),
    )
    expect(tooBig).toMatchObject({ ok: false, errors: ["Ukuran file maksimal 5 MB."] })

    const notSaved = await upload("", new File(["x"], "a.pdf", { type: "application/pdf" }))
    expect(notSaved).toMatchObject({
      ok: false,
      errors: ["Simpan dokumen dulu sebelum mengunggah file."],
    })
  })

  test("kunci file milik dokumen lain ditolak saat menyimpan", async () => {
    loginAs(["staf_exim"])
    const first = await createDocument()
    const second = await createDocument()
    const uploaded = await upload(
      first,
      new File(["data"], "packing.pdf", { type: "application/pdf" }),
    )
    if (!uploaded.ok) throw new Error(uploaded.errors.join("\n"))
    const draft = empty()
    draft.attachments = [{ documentTypeCode: "217", number: "", date: "", file: uploaded.data }]
    expect(await save(second, draft)).toMatchObject({
      ok: false,
      errors: ["File lampiran tidak valid. Unggah ulang filenya."],
    })
  })
})
