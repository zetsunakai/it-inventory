"use client"

import { Undo2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTransition } from "react"

import { createReturnRequest } from "@/app/(app)/inventory/retur/actions"
import { usePageMessage } from "@/components/layout/page-message"
import { Button } from "@/components/ui/button"

// Buat permintaan retur Draft dari transfer Selesai (R-11), lalu buka halamannya untuk mengatur
// qty dan tindakannya. Alasan gagal tampil di slot pesan di bawah header.
export function CreateReturnButton({ originId }: { originId: string }) {
  const router = useRouter()
  const { show } = usePageMessage()
  const [pending, startTransition] = useTransition()

  return (
    <Button
      variant="outline"
      disabled={pending}
      className="pointer-coarse:h-11"
      onClick={() =>
        startTransition(async () => {
          const result = await createReturnRequest({ originId })
          if (result.ok) router.push(`/inventory/retur/${result.data.id}`)
          else show(result)
        })
      }
    >
      <Undo2 />
      {pending ? "Membuat retur…" : "Buat retur"}
    </Button>
  )
}
