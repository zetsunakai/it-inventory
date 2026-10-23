"use client"

import { Popover } from "@base-ui/react/popover"
import { Check, Filter, Layers, SearchIcon, Star, Trash2, X } from "lucide-react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useEffect, useRef, useState, useTransition } from "react"

import { GROUP_PARAM, PAGE_PARAM, SEARCH_PARAM } from "@/lib/list-params"
import { useStoredValue } from "@/lib/use-stored-value"
import { cn } from "@/lib/utils"

export type ListFilter = {
  name: string
  label: string
  options: { value: string; label: string }[]
}

export type ListGroupOption = { value: string; label: string }

type Favorite = { name: string; query: string }

const DEBOUNCE_MS = 300

// Pencarian daftar ala hmx-002 (backlog RU-22): satu kotak berisi chip filter aktif dan kata
// kunci; tombol corong membuka panel Filter, Kelompokkan, dan Favorit. Semua state ada di URL
// (?q=, ?<filter>=, ?kelompok=), jadi bisa di-bookmark; favorit disimpan per browser.
export function ListSearchBar({
  placeholder = "Cari…",
  filters = [],
  groupBy = [],
}: {
  placeholder?: string
  filters?: ListFilter[]
  groupBy?: ListGroupOption[]
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const [text, setText] = useState(searchParams.get(SEARCH_PARAM) ?? "")
  const [favorites, saveFavorites] = useStoredValue<Favorite[]>(`daftar-favorit:${pathname}`, [])
  const [favoriteName, setFavoriteName] = useState("")

  useEffect(() => () => clearTimeout(timer.current), [])

  function navigate(change: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(searchParams)
    change(params)
    params.delete(PAGE_PARAM)
    const query = params.toString()
    startTransition(() => router.replace(query ? `${pathname}?${query}` : pathname))
  }

  function setParam(name: string, value: string | null) {
    navigate((params) => (value ? params.set(name, value) : params.delete(name)))
  }

  function onText(value: string) {
    setText(value)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setParam(SEARCH_PARAM, value.trim() || null), DEBOUNCE_MS)
  }

  const chips = [
    ...filters.flatMap((filter) => {
      const value = searchParams.get(filter.name)
      const option = filter.options.find((item) => item.value === value)
      return option ? [{ name: filter.name, label: `${filter.label}: ${option.label}` }] : []
    }),
    ...(() => {
      const value = searchParams.get(GROUP_PARAM)
      const option = groupBy.find((item) => item.value === value)
      return option ? [{ name: GROUP_PARAM, label: `Kelompok: ${option.label}` }] : []
    })(),
  ]
  const currentQuery = (() => {
    const params = new URLSearchParams(searchParams)
    params.delete(PAGE_PARAM)
    return params.toString()
  })()

  return (
    <div
      className="flex min-h-10 w-full min-w-0 items-center gap-1.5 rounded-lg border border-input bg-card pl-3 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 lg:max-w-xl"
      aria-busy={pending}
    >
      <SearchIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 py-1.5">
        {chips.map((chip) => (
          <span
            key={chip.name}
            className="flex h-6 max-w-full items-center gap-1 rounded-md bg-info-soft pr-1 pl-2 text-caption font-medium text-primary"
          >
            <span className="truncate" title={chip.label}>
              {chip.label}
            </span>
            <button
              type="button"
              onClick={() => setParam(chip.name, null)}
              aria-label={`Hapus ${chip.label}`}
              className="flex size-4 shrink-0 items-center justify-center rounded hover:bg-primary/10"
            >
              <X className="size-3" aria-hidden />
            </button>
          </span>
        ))}
        <input
          type="search"
          aria-label={placeholder}
          placeholder={chips.length ? "" : placeholder}
          value={text}
          onChange={(event) => onText(event.target.value)}
          onKeyDown={(event) => {
            // Backspace di kotak kosong menghapus chip terakhir, seperti hmx.
            if (event.key === "Backspace" && !text && chips.length) {
              setParam(chips[chips.length - 1].name, null)
            }
          }}
          className="h-6 min-w-16 flex-1 bg-transparent text-control outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
        />
      </div>
      {(filters.length > 0 || groupBy.length > 0) && (
        <Popover.Root>
          <Popover.Trigger
            aria-label="Filter, kelompokkan, dan favorit"
            className="flex min-h-10 shrink-0 items-center gap-1.5 self-stretch rounded-r-lg border-l border-input px-3 text-control font-medium text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:bg-accent"
          >
            <Filter className="size-4" aria-hidden />
            <span className="hidden sm:inline">Filter</span>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Positioner align="end" sideOffset={6} className="z-50">
              <Popover.Popup className="grid max-h-[70vh] w-[min(46rem,calc(100vw-2rem))] gap-4 overflow-y-auto rounded-lg bg-popover p-4 text-popover-foreground shadow-lg ring-1 ring-foreground/10 outline-none sm:grid-cols-3">
                <Panel icon={<Filter className="size-4" aria-hidden />} title="Filter">
                  {filters.map((filter) => (
                    <div key={filter.name} className="space-y-0.5">
                      <p className="px-2 pt-1 text-caption text-muted-foreground">{filter.label}</p>
                      {filter.options.map((option) => {
                        const active = searchParams.get(filter.name) === option.value
                        return (
                          <Choice
                            key={option.value}
                            active={active}
                            onClick={() => setParam(filter.name, active ? null : option.value)}
                          >
                            {option.label}
                          </Choice>
                        )
                      })}
                    </div>
                  ))}
                  {filters.length === 0 && <Empty>Tidak ada filter untuk daftar ini.</Empty>}
                </Panel>
                <Panel icon={<Layers className="size-4" aria-hidden />} title="Kelompokkan">
                  {groupBy.map((option) => {
                    const active = searchParams.get(GROUP_PARAM) === option.value
                    return (
                      <Choice
                        key={option.value}
                        active={active}
                        onClick={() => setParam(GROUP_PARAM, active ? null : option.value)}
                      >
                        {option.label}
                      </Choice>
                    )
                  })}
                  {groupBy.length === 0 && <Empty>Daftar ini tidak bisa dikelompokkan.</Empty>}
                </Panel>
                <Panel icon={<Star className="size-4" aria-hidden />} title="Favorit">
                  {favorites.map((favorite) => (
                    <div key={favorite.name} className="group flex items-center gap-1">
                      <Choice
                        active={favorite.query === currentQuery}
                        onClick={() =>
                          startTransition(() =>
                            router.replace(
                              favorite.query ? `${pathname}?${favorite.query}` : pathname,
                            ),
                          )
                        }
                      >
                        {favorite.name}
                      </Choice>
                      <button
                        type="button"
                        aria-label={`Hapus favorit ${favorite.name}`}
                        onClick={() =>
                          saveFavorites(favorites.filter((item) => item.name !== favorite.name))
                        }
                        className="flex size-7 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-destructive"
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                      </button>
                    </div>
                  ))}
                  <form
                    className="space-y-1.5 border-t pt-2"
                    onSubmit={(event) => {
                      event.preventDefault()
                      const name = favoriteName.trim()
                      if (!name) return
                      saveFavorites([
                        ...favorites.filter((item) => item.name !== name),
                        { name, query: currentQuery },
                      ])
                      setFavoriteName("")
                    }}
                  >
                    <label className="block px-2 text-caption text-muted-foreground">
                      Simpan pencarian ini
                      <input
                        value={favoriteName}
                        onChange={(event) => setFavoriteName(event.target.value)}
                        placeholder="Nama favorit"
                        maxLength={40}
                        className="mt-1 h-9 w-full rounded-md border border-input bg-card px-2.5 text-control text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                      />
                    </label>
                    <button
                      type="submit"
                      disabled={!favoriteName.trim()}
                      className="ml-2 h-8 rounded-md px-2.5 text-control font-semibold text-primary hover:bg-info-soft disabled:opacity-50"
                    >
                      Simpan
                    </button>
                  </form>
                </Panel>
              </Popover.Popup>
            </Popover.Positioner>
          </Popover.Portal>
        </Popover.Root>
      )}
    </div>
  )
}

function Panel({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="min-w-0 space-y-1">
      <h3 className="flex items-center gap-2 px-2 pb-1 text-control font-semibold text-primary">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  )
}

function Choice({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex h-8 w-full min-w-0 items-center gap-2 rounded-md px-2 text-left text-control hover:bg-accent",
        active && "font-medium text-primary",
      )}
    >
      <Check className={cn("size-4 shrink-0", !active && "invisible")} aria-hidden />
      <span className="truncate">{children}</span>
    </button>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-2 py-1 text-control text-muted-foreground">{children}</p>
}
