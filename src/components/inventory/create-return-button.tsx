"use client"

import { Undo2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

import { createReturnRequest } from "@/app/(app)/inventory/retur/actions"
import { Button } from "@/components/ui/button"

// Buat permintaan retur Draft dari transfer Selesai (R-11), lalu buka halamannya untuk mengatur
// qty dan tindakannya.
export function CreateReturnButton({ originId }: { originId: string }) {
  const router = useRouter()
  const [errors, setErrors] = useState<string[]>()
  const [pending, startTransition] = useTransition()

  return (
    <div className="space-y-2">
      <Button
        variant="outline"
        disabled={pending}
        className="pointer-coarse:h-11"
        onClick={() =>
          startTransition(async () => {
            const result = await createReturnRequest({ originId })
            if (result.ok) router.push(`/inventory/retur/${result.data.id}`)
            else setErrors(result.errors)
          })
        }
      >
        <Undo2 />
        {pending ? "Membuat retur…" : "Buat retur"}
      </Button>
      {errors?.length ? (
        <p role="alert" className="text-sm text-destructive">
          {errors.join(" ")}
        </p>
      ) : null}
    </div>
  )
}
