import Image from "next/image"
import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

import "./auth-layout.css"
import { AuthVisualLogin, AuthVisualMfa } from "./auth-visuals"

function AuthBrand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="relative flex items-center gap-4">
      {/* Logo dipotong tepat di bawah tanda V supaya tulisan VELTICS di dalam gambar tidak
          dobel dengan wordmark yang mengikuti token brand. */}
      <div className={compact ? "h-[43px] w-16 overflow-hidden" : "h-16 w-24 overflow-hidden"}>
        <Image
          src="/brand/veltics-logo.png"
          alt=""
          width={256}
          height={237}
          className="h-auto w-full"
          preload
        />
      </div>
      <span className="flex flex-col">
        <span
          className={cn(
            "auth-wordmark font-display font-bold tracking-[0.12em]",
            compact ? "text-2xl" : "text-3xl",
          )}
        >
          VELTICS
        </span>
        <span
          className={cn(
            "font-medium tracking-[0.28em] text-sidebar-foreground",
            compact ? "text-[10px]" : "text-[11px]",
          )}
        >
          IT INVENTORY
        </span>
      </span>
    </div>
  )
}

const BRAND_COPY = {
  login: {
    title: "Satu alur, dari dokumen sampai stok.",
    description:
      "Catat pemasukan, penimbunan, dan pengeluaran barang kawasan berikat dalam satu tempat, lengkap dengan dokumen BC dan jejak perubahannya.",
  },
  mfa: {
    title: "Pastikan hanya Anda yang masuk.",
    description:
      "Kode dari aplikasi authenticator melindungi data kawasan berikat meski password Anda diketahui orang lain.",
  },
} as const

export function AuthLayout({
  title,
  description,
  visual = "login",
  children,
}: {
  title: string
  description: string
  visual?: "login" | "mfa"
  children: ReactNode
}) {
  const copy = BRAND_COPY[visual]

  return (
    <main className="grid min-h-svh lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <section
        aria-label="Veltics IT Inventory"
        className="auth-brand-panel relative hidden flex-col justify-between overflow-hidden p-10 lg:flex xl:p-14"
      >
        <AuthBrand />
        <div className="relative flex flex-col gap-8 py-10">
          <div className="max-w-md">
            <p className="font-display text-[1.75rem] leading-9 font-bold text-sidebar-accent-foreground">
              {copy.title}
            </p>
            <p className="mt-3 text-control leading-6 text-sidebar-foreground">
              {copy.description}
            </p>
          </div>
          {visual === "mfa" ? <AuthVisualMfa /> : <AuthVisualLogin />}
        </div>
        <ul
          aria-label="Cakupan aplikasi"
          className="relative flex flex-wrap items-center gap-x-3 gap-y-2 text-caption text-sidebar-foreground"
        >
          <li>Dokumen BC</li>
          <li aria-hidden="true">·</li>
          <li>Stok &amp; transfer</li>
          <li aria-hidden="true">·</li>
          <li>Laporan</li>
        </ul>
      </section>

      <section className="flex min-w-0 flex-col bg-background px-6 text-foreground sm:px-10 lg:px-16">
        <div className="auth-brand-panel -mx-6 flex justify-center px-6 py-7 sm:-mx-10 lg:hidden">
          <AuthBrand compact />
        </div>
        <div className="flex flex-1 items-center justify-center py-12 lg:py-16">
          <div className="w-full max-w-sm space-y-7">
            <div className="space-y-2">
              <h1 className="font-display text-page-title font-bold">{title}</h1>
              <p className="text-control text-muted-foreground">{description}</p>
            </div>
            {children}
          </div>
        </div>
        <footer className="pb-8 text-center text-caption text-muted-foreground">
          © 2026 Veltics
        </footer>
      </section>
    </main>
  )
}
