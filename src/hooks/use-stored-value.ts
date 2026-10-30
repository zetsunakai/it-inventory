"use client"

import { useCallback, useSyncExternalStore } from "react"

// Nilai JSON per browser di localStorage (misalnya pilihan kolom; RU-22). Di server dan
// saat penyimpanan tidak tersedia, nilainya fallback. Perubahan diberitahukan ke komponen lain di
// tab yang sama lewat event "stored-value".
const EVENT = "stored-value"

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function useStoredValue<T>(key: string, fallback: T) {
  const raw = useSyncExternalStore(
    (notify) => {
      window.addEventListener("storage", notify)
      window.addEventListener(EVENT, notify)
      return () => {
        window.removeEventListener("storage", notify)
        window.removeEventListener(EVENT, notify)
      }
    },
    () => read(key),
    () => null,
  )
  let value = fallback
  if (raw !== null) {
    try {
      value = JSON.parse(raw) as T
    } catch {
      value = fallback
    }
  }
  const setValue = useCallback(
    (next: T) => {
      try {
        localStorage.setItem(key, JSON.stringify(next))
      } catch {
        // Penyimpanan browser tidak tersedia: perubahan tidak tersimpan.
      }
      window.dispatchEvent(new Event(EVENT))
    },
    [key],
  )
  return [value, setValue] as const
}
