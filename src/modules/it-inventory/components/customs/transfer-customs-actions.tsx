"use client"

import { FilePlus2, Unlink } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

import { usePageMessage } from "@/components/layout/page-message"
import { SearchSelect } from "@/components/search-select"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  createCustomsDocumentFromTransfer,
  linkTransferCustomsDocument,
} from "@/modules/it-inventory/actions/customs-transfers"
import {
  CUSTOMS_DOC_CODE_LABELS,
  CUSTOMS_DOCUMENT_STATUS_LABELS,
  type CustomsDocCode,
} from "@/modules/it-inventory/lib/customs"
import type { LinkableCustomsDocument } from "@/modules/it-inventory/server/queries/customs-transfers"

// Aksi dokumen BC di detail penerimaan/pengiriman (backlog M4-04): buat dokumen baru dari transfer,
// tautkan ke dokumen yang sudah ada, atau lepas tautan.
export function TransferCustomsActions({
  transferId,
  allowed,
  linked,
}: {
  transferId: string
  allowed: readonly CustomsDocCode[]
  linked: boolean
}) {
  const router = useRouter()
  const { show } = usePageMessage()
  const [pending, startTransition] = useTransition()
  const [choice, setChoice] = useState<LinkableCustomsDocument | null>(null)

  function create(docCode: CustomsDocCode) {
    startTransition(async () => {
      const result = await createCustomsDocumentFromTransfer({ transferId, docCode })
      show(result)
      if (result.ok) router.push(result.data.path)
    })
  }

  function link(documentId: string | null) {
    startTransition(async () => {
      show(await linkTransferCustomsDocument({ transferId, documentId }))
      setChoice(null)
    })
  }

  if (linked) {
    return (
      <Button variant="outline" disabled={pending} onClick={() => link(null)}>
        <Unlink />
        Lepas tautan
      </Button>
    )
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {allowed.map((code) => (
          <Button key={code} variant="outline" disabled={pending} onClick={() => create(code)}>
            <FilePlus2 />
            Buat {CUSTOMS_DOC_CODE_LABELS[code]}
          </Button>
        ))}
      </div>
      <div className="flex max-w-xl flex-col gap-1.5">
        <Label htmlFor={`link-${transferId}`}>Atau tautkan dokumen yang sudah ada</Label>
        <SearchSelect<LinkableCustomsDocument>
          id={`link-${transferId}`}
          endpoint="/api/customs-documents/linkable"
          params={{ transfer: transferId }}
          value={choice}
          onValueChange={(value) => {
            setChoice(value)
            if (value) link(value.id)
          }}
          getKey={(item) => item.id}
          getLabel={(item) =>
            `${CUSTOMS_DOC_CODE_LABELS[item.docCode]} ${item.ajuNumber}${
              item.registrationNumber ? ` · daftar ${item.registrationNumber}` : ""
            } · ${CUSTOMS_DOCUMENT_STATUS_LABELS[item.status]}`
          }
          placeholder="Cari nomor aju atau nomor daftar"
        />
      </div>
    </div>
  )
}
