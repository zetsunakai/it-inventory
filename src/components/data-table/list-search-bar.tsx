"use client"

import { Popover } from "@base-ui/react/popover"
import { Check, Filter, Layers, Plus, SearchIcon, X } from "lucide-react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useEffect, useRef, useState, useTransition } from "react"

import { FormErrors } from "@/components/form-errors"
import { Button } from "@/components/ui/button"
import {
  CUSTOM_FILTER_PARAM,
  FILTER_OPERATORS,
  parseCustomFilter,
  type ListField,
} from "@/lib/list-controls"
import { GROUP_PARAM, PAGE_PARAM, SEARCH_PARAM } from "@/lib/list-params"
import { cn } from "@/lib/utils"

import { ListFilterEditor } from "./list-filter-editor"

export type ListFilter = {
  name: string
  label: string
  options: { value: string; label: string }[]
}
const DEBOUNCE_MS = 300

// Satu UI untuk semua daftar. Field yang didukung didaftarkan query pemilik; URL menyimpan
// kondisi dan satu tingkat grouping. Validasi/eksekusi SQL tetap dilakukan di server.
export function ListSearchBar({
  placeholder = "Cari…",
  filters = [],
  fields = [],
}: {
  placeholder?: string
  filters?: ListFilter[]
  fields?: ListField[]
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pending, startTransition] = useTransition()
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const queryText = searchParams.get(SEARCH_PARAM) ?? ""
  const [observedText, setObservedText] = useState(queryText)
  const [text, setText] = useState(queryText)
  if (queryText !== observedText) {
    setObservedText(queryText)
    setText(queryText)
  }
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  useEffect(() => () => clearTimeout(timer.current), [searchParams])

  const { filter: custom, error } = parseCustomFilter(searchParams.get(CUSTOM_FILTER_PARAM), fields)
  const groups = fields
    .filter((field) => field.groupable)
    .map((field) => ({ value: field.key, label: field.label }))
  function navigate(change: (params: URLSearchParams) => void) {
    clearTimeout(timer.current)
    const params = new URLSearchParams(searchParams)
    if (text.trim()) params.set(SEARCH_PARAM, text.trim())
    else params.delete(SEARCH_PARAM)
    change(params)
    params.delete(PAGE_PARAM)
    const query = params.toString()
    startTransition(() =>
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false }),
    )
  }
  const setParam = (name: string, value: string | null) =>
    navigate((params) => (value ? params.set(name, value) : params.delete(name)))
  const removeCondition = (index: number) => {
    if (!custom) return
    const conditions = custom.conditions.filter((_, position) => position !== index)
    setParam(
      CUSTOM_FILTER_PARAM,
      conditions.length ? JSON.stringify({ ...custom, conditions }) : null,
    )
  }
  const chips = [
    ...filters.flatMap((filter) => {
      const option = filter.options.find((item) => item.value === searchParams.get(filter.name))
      return option ? [{ key: filter.name, label: `${filter.label}: ${option.label}` }] : []
    }),
    ...(custom?.conditions.map((condition, index) => {
      const field = fields.find((field) => field.key === condition.field)!
      const value =
        field.options?.find((option) => option.value === condition.value)?.label ??
        (field.type === "boolean" ? (condition.value === "true" ? "Ya" : "Tidak") : condition.value)
      const label = `${field.label} ${FILTER_OPERATORS[condition.operator]}${["empty", "not_empty"].includes(condition.operator) ? "" : ` ${value}${condition.operator === "between" ? ` – ${condition.end}` : ""}`}`
      return { key: `custom-${index}`, label: `${custom.match === "any" ? "OR · " : ""}${label}` }
    }) ?? []),
    ...groups
      .filter((option) => option.value === searchParams.get(GROUP_PARAM))
      .map((option) => ({ key: GROUP_PARAM, label: `Kelompok: ${option.label}` })),
    ...(error ? [{ key: CUSTOM_FILTER_PARAM, label: "Filter tidak valid" }] : []),
  ]
  function removeChip(key: string) {
    if (key.startsWith("custom-")) removeCondition(Number(key.slice(7)))
    else setParam(key, null)
  }

  return (
    <div className="w-full min-w-0 space-y-2 lg:max-w-xl">
      <div
        className="flex min-h-10 w-full min-w-0 items-center gap-1.5 rounded-lg border border-input bg-card pl-3 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50"
        aria-busy={pending}
      >
        <SearchIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 py-1.5">
          {chips.map((chip) => (
            <span
              key={chip.key}
              className="flex min-h-6 max-w-full items-center gap-1 rounded-md bg-info-soft pr-1 pl-2 text-caption font-medium text-primary"
            >
              <span className="truncate" title={chip.label}>
                {chip.label}
              </span>
              <Button
                type="button"
                variant="inline"
                size="icon"
                disabled={pending}
                className="size-6 shrink-0"
                onClick={() => removeChip(chip.key)}
                aria-label={`Hapus ${chip.label}`}
              >
                <X className="size-3" />
              </Button>
            </span>
          ))}
          <input
            type="search"
            aria-label={placeholder}
            placeholder={chips.length ? "" : placeholder}
            value={text}
            onChange={(event) => {
              const value = event.target.value
              setText(value)
              clearTimeout(timer.current)
              timer.current = setTimeout(
                () => setParam(SEARCH_PARAM, value.trim() || null),
                DEBOUNCE_MS,
              )
            }}
            onKeyDown={(event) => {
              if (event.key === "Backspace" && !text && chips.length)
                removeChip(chips[chips.length - 1].key)
            }}
            className="h-6 min-w-16 flex-1 bg-transparent text-control outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
          />
        </div>
        {(filters.length > 0 || groups.length > 0 || fields.length > 0) && (
          <Popover.Root
            open={open}
            onOpenChange={(value) => {
              setOpen(value)
              if (!value) setEditing(false)
            }}
          >
            <Popover.Trigger
              render={<Button variant="inline" />}
              aria-label="Filter dan kelompokkan"
              className="min-h-10 shrink-0 self-stretch rounded-l-none rounded-r-lg border-l border-input px-3 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <Filter className="size-4" aria-hidden />
              <span className="hidden sm:inline">Filter</span>
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Positioner align="start" sideOffset={6} className="z-50">
                <Popover.Popup
                  aria-label="Filter dan kelompokkan"
                  className={cn(
                    "grid max-h-[70dvh] w-[min(38rem,calc(100vw-2rem))] gap-4 overflow-y-auto rounded-xl bg-popover p-4 text-popover-foreground shadow-lg ring-1 ring-foreground/10 outline-none sm:grid-cols-2",
                    editing && "w-[min(48rem,calc(100vw-2rem))]",
                  )}
                >
                  <Panel icon={<Filter className="size-4" />} title="Filter">
                    {filters.map((filter) => (
                      <div key={filter.name} className="space-y-0.5">
                        <p className="px-2 pt-1 text-caption text-muted-foreground">
                          {filter.label}
                        </p>
                        {filter.options.map((option) => {
                          const active = searchParams.get(filter.name) === option.value
                          return (
                            <Choice
                              key={option.value}
                              active={active}
                              disabled={pending}
                              onClick={() => setParam(filter.name, active ? null : option.value)}
                            >
                              {option.label}
                            </Choice>
                          )
                        })}
                      </div>
                    ))}
                    {fields.length > 0 && (
                      <Button
                        type="button"
                        variant="outline"
                        className="mt-2 w-full justify-start"
                        onClick={() => setEditing(true)}
                      >
                        <Plus />
                        {custom ? "Ubah filter kustom" : "Tambah filter kustom"}
                      </Button>
                    )}
                    {!filters.length && !fields.length && (
                      <Empty>Tidak ada filter untuk daftar ini.</Empty>
                    )}
                  </Panel>
                  <Panel icon={<Layers className="size-4" />} title="Kelompokkan">
                    {groups.map((option) => {
                      const active = searchParams.get(GROUP_PARAM) === option.value
                      return (
                        <Choice
                          key={option.value}
                          active={active}
                          disabled={pending}
                          onClick={() => {
                            setParam(GROUP_PARAM, active ? null : option.value)
                            setOpen(false)
                            setEditing(false)
                          }}
                        >
                          {option.label}
                        </Choice>
                      )
                    })}
                    {!groups.length && <Empty>Daftar ini tidak bisa dikelompokkan.</Empty>}
                    {groups.length > 0 && (
                      <p className="px-2 pt-2 text-caption text-muted-foreground">
                        Jumlah kelompok mencakup seluruh hasil filter. Baris tetap dibagi per
                        halaman.
                      </p>
                    )}
                  </Panel>
                  {editing && fields.length > 0 && (
                    <ListFilterEditor
                      key={searchParams.get(CUSTOM_FILTER_PARAM) ?? "baru"}
                      fields={fields}
                      initial={custom}
                      onCancel={() => setEditing(false)}
                      onApply={(filter) => {
                        setParam(CUSTOM_FILTER_PARAM, JSON.stringify(filter))
                        setOpen(false)
                        setEditing(false)
                      }}
                    />
                  )}
                </Popover.Popup>
              </Popover.Positioner>
            </Popover.Portal>
          </Popover.Root>
        )}
      </div>
      {error && <FormErrors errors={[error]} />}
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
      <h3 className="flex items-center gap-2 px-2 pb-1 text-control font-semibold">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  )
}
function Choice({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean
  disabled: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "min-h-10 w-full min-w-0 justify-start gap-2 rounded-md border-transparent px-2 text-left font-normal",
        active && "bg-info-soft font-medium text-primary",
      )}
    >
      <Check className={cn("size-4 shrink-0", !active && "invisible")} aria-hidden />
      <span className="truncate">{children}</span>
    </Button>
  )
}
function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-2 py-1 text-control text-muted-foreground">{children}</p>
}
