"use client"

import { CircleAlert, CircleCheck } from "lucide-react"
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"

import type { ActionResult } from "@/lib/action-result"

// Pesan hasil aksi halaman (backlog UF-03): tombol alur dokumen ada di kanan header, pesannya selalu
// di slot yang sama tepat di bawah header (PageMessageSlot, dirender PageHeader), lebar penuh, dan
// mendapat fokus supaya terbaca pembaca layar. Hilang saat halaman ditinggalkan.

export type PageMessage = { ok: boolean; content: ReactNode }

const PageMessageContext = createContext<{
  message: PageMessage | null
  setMessage: (message: PageMessage | null) => void
} | null>(null)

export function PageMessageProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<PageMessage | null>(null)
  return <PageMessageContext value={{ message, setMessage }}>{children}</PageMessageContext>
}

// Tampilkan hasil server action: pesan sukses (message atau data.message) atau semua kesalahan.
// extra = isi tambahan di bawah pesan sukses (mis. tautan transfer lanjutan).
export function usePageMessage() {
  const setMessage = useContext(PageMessageContext)?.setMessage
  const show = useCallback(
    (result: ActionResult<unknown>, extra?: ReactNode) => {
      if (!setMessage) return
      if (!result.ok) {
        setMessage({
          ok: false,
          content: (
            <div className="space-y-0.5">
              <p className="font-medium">
                {result.errors.length > 1
                  ? `${result.errors.length} hal perlu diselesaikan:`
                  : "Perlu diselesaikan:"}
              </p>
              <ul className="list-disc space-y-0.5 pl-4">
                {result.errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </div>
          ),
        })
        return
      }
      const text =
        result.message ??
        (result.data && typeof result.data === "object"
          ? (result.data as { message?: string }).message
          : undefined)
      setMessage({
        ok: true,
        content: (
          <div className="space-y-1">
            {text && <p>{text}</p>}
            {extra}
          </div>
        ),
      })
    },
    [setMessage],
  )
  const clear = useCallback(() => setMessage?.(null), [setMessage])
  return { show, clear }
}

export function PageMessageSlot() {
  const context = useContext(PageMessageContext)
  const ref = useRef<HTMLDivElement>(null)
  const message = context?.message ?? null
  const setMessage = context?.setMessage

  useEffect(() => {
    if (message) ref.current?.focus()
  }, [message])
  // Pesan milik halaman ini saja.
  useEffect(() => () => setMessage?.(null), [setMessage])

  if (!message) return null
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role={message.ok ? "status" : "alert"}
      className={
        message.ok
          ? "flex gap-2 rounded-lg bg-success-soft px-3 py-2.5 text-control outline-none"
          : "flex gap-2 rounded-lg bg-destructive-soft px-3 py-2.5 text-control text-destructive outline-none"
      }
    >
      {message.ok ? (
        <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
      ) : (
        <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      )}
      <div className="min-w-0">{message.content}</div>
    </div>
  )
}
