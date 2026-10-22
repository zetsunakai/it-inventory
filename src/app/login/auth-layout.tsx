import Image from "next/image"
import type { ReactNode } from "react"

import "./auth-layout.css"

function AuthBrand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="relative flex flex-col items-center gap-3">
      <div className="flex items-center gap-5">
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
        <span
          className={`auth-wordmark font-display font-bold tracking-[0.12em] ${compact ? "text-2xl" : "text-4xl lg:text-5xl"}`}
        >
          VELTICS
        </span>
      </div>
      <span className="pl-4 text-[11px] font-medium tracking-[0.3em] text-sidebar-foreground">
        IT INVENTORY
      </span>
    </div>
  )
}

export function AuthLayout({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <main className="grid min-h-svh flex-1 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <section
        aria-label="Veltics IT Inventory"
        className={`auth-brand-panel relative hidden items-center justify-center overflow-hidden md:flex`}
      >
        <div className="auth-orbit" aria-hidden="true" />
        <AuthBrand />
      </section>
      <section className="flex min-w-0 flex-col bg-background px-6 text-foreground sm:px-10">
        <div
          className={`auth-brand-panel -mx-6 flex justify-center px-6 py-9 sm:-mx-10 md:hidden`}
          aria-label="Veltics IT Inventory"
        >
          <AuthBrand compact />
        </div>
        <div className="flex flex-1 items-center justify-center py-16 md:py-24">
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
