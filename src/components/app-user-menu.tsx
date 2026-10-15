"use client"

import { ChevronDown, KeyRound, LogOut } from "lucide-react"
import Link from "next/link"
import { useTransition } from "react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { signOut } from "@/server/auth/actions"

// Menu user di kanan bar atas (backlog RU-21, seperti hmx): inisial, nama, peran; Keamanan akun
// dan Keluar di dalam menu.
export function AppUserMenu({
  name,
  roles,
  securityHref,
}: {
  name: string
  roles: string
  securityHref: string
}) {
  const [pending, startTransition] = useTransition()
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("")

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Menu akun ${name}`}
        className="flex h-10 items-center gap-2.5 rounded-lg px-2 text-left outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <span
          aria-hidden
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-caption font-semibold text-primary-foreground"
        >
          {initials || "?"}
        </span>
        <span className="hidden min-w-0 leading-tight sm:block">
          <span className="block max-w-48 truncate text-control font-medium">{name}</span>
          <span className="block max-w-48 truncate text-caption text-muted-foreground">
            {roles}
          </span>
        </span>
        <ChevronDown className="hidden size-4 text-muted-foreground sm:block" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={6} className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="sm:hidden">
            <span className="block truncate text-control font-medium text-foreground">{name}</span>
            <span className="block truncate text-caption">{roles}</span>
          </DropdownMenuLabel>
          <DropdownMenuItem render={<Link href={securityHref} />} className="h-9">
            <KeyRound aria-hidden />
            Keamanan akun
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={pending}
          onClick={() => startTransition(() => signOut())}
          className="h-9"
        >
          <LogOut aria-hidden />
          {pending ? "Keluar…" : "Keluar"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
