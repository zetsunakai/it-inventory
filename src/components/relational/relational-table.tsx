"use client"

import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  Columns3,
  GripVertical,
  Pencil,
  Pin,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react"
import { Fragment, useId, useRef, useState, type CSSProperties, type ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useStoredValue } from "@/lib/use-stored-value"
import { cn } from "@/lib/utils"

export type RelationColumn<Row> = {
  id: string
  label: string
  value: (row: Row, index: number) => string
  render?: (row: Row, index: number) => ReactNode
  edit?: (row: Row, index: number) => ReactNode
  required?: boolean
  error?: (row: Row, index: number) => string | undefined
  numeric?: boolean
  width?: number
  optional?: boolean
  hidden?: boolean
  footer?: (rows: Row[]) => ReactNode
}

type Preferences = {
  hidden?: string[]
  widths?: Record<string, number>
  order?: string[]
  pinned?: string | null
}

// Sort, filter, pin, dan pagination hanya mengubah tampilan. Semua callback memakai indeks sumber.
export function RelationalTable<Row>({
  id,
  label,
  rows,
  columns,
  rowKey,
  onAdd,
  onRemove,
  canRemove = () => true,
  onReorder,
  details,
  initialEdit = false,
  addLabel = "Tambah baris",
  errors,
  minRows = 0,
}: {
  id: string
  label: string
  rows: Row[]
  columns: RelationColumn<Row>[]
  rowKey: (row: Row) => string
  onAdd?: () => string | void
  onRemove?: (keys: string[]) => void
  canRemove?: (row: Row) => boolean
  onReorder?: (rows: Row[]) => void
  details?: (row: Row, index: number) => ReactNode
  initialEdit?: boolean
  addLabel?: string
  errors?: string[]
  minRows?: number
}) {
  const uid = useId()
  const root = useRef<HTMLDivElement>(null)
  const invalidTarget = useRef<EventTarget | null>(null)
  const [validationMessage, setValidationMessage] = useState<string | null>(null)
  const [stored, store] = useStoredValue<Preferences>(`relasi:${id}`, {})
  const [local, setLocal] = useState<Preferences>({})
  const prefs = { ...stored, ...local }
  const save = (next: Preferences) => {
    const value = { ...prefs, ...next }
    setLocal(value)
    store(value)
  }
  const hidden =
    prefs.hidden ?? columns.filter((column) => column.hidden).map((column) => column.id)
  const ordered = [...columns].sort((a, b) => {
    const order = prefs.order ?? columns.map((column) => column.id)
    const rank = (key: string) => {
      const index = order.indexOf(key)
      return index < 0 ? order.length : index
    }
    return rank(a.id) - rank(b.id)
  })
  const visible = ordered.filter((column) => !hidden.includes(column.id))
  const [sort, setSort] = useState<{ id: string; direction: number } | null>(null)
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [searching, setSearching] = useState<string | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [pinnedRows, setPinnedRows] = useState<string[]>([])
  const [editing, setEditing] = useState<string | null>(() =>
    initialEdit && rows[0] ? rowKey(rows[0]) : null,
  )
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [dragging, setDragging] = useState<string | null>(null)
  const entries = rows.map((row, index) => ({ row, index, key: rowKey(row) }))
  const filtered = entries.filter(({ row, index }) =>
    columns.every(
      (column) =>
        !filters[column.id] ||
        column
          .value(row, index)
          .toLocaleLowerCase()
          .includes(filters[column.id].toLocaleLowerCase()),
    ),
  )
  const sorted = [...filtered].sort((a, b) => {
    const pinned = Number(pinnedRows.includes(b.key)) - Number(pinnedRows.includes(a.key))
    if (pinned) return pinned
    const column = columns.find((item) => item.id === sort?.id)
    if (!column || !sort) return a.index - b.index
    const av = column.value(a.row, a.index),
      bv = column.value(b.row, b.index)
    return (
      sort.direction *
      (column.numeric
        ? (Number(av.replace(",", ".")) || 0) - (Number(bv.replace(",", ".")) || 0)
        : av.localeCompare(bv, "id", { numeric: true }))
    )
  })
  const pages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const currentPage = Math.min(page, pages)
  const displayed = new Set(
    sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize).map((entry) => entry.key),
  )
  const selectable = sorted.filter(({ row }) => canRemove(row))
  const checked = selectable.filter(({ key }) => selected.includes(key))
  const chosen = entries.filter(({ row, key }) => selected.includes(key) && canRemove(row))
  const colspan = visible.length + 3
  const renderEntries = [
    ...sorted.filter((entry) => displayed.has(entry.key)),
    ...entries.filter((entry) => !displayed.has(entry.key)),
  ]
  const pinnedIndex = visible.findIndex((column) => column.id === prefs.pinned)
  const width = (column: RelationColumn<Row>) => prefs.widths?.[column.id] ?? column.width ?? 200
  const sticky = (index: number): CSSProperties | undefined =>
    index <= pinnedIndex
      ? ({
          "--relation-left": `${112 + visible.slice(0, index).reduce((total, column) => total + width(column), 0)}px`,
        } as CSSProperties)
      : undefined
  const hasEditors = columns.some((column) => column.edit) || Boolean(details)

  function reorder(key: string, target: string) {
    if (!onReorder || key === target) return
    const next = [...rows],
      from = next.findIndex((row) => rowKey(row) === key),
      to = next.findIndex((row) => rowKey(row) === target)
    if (from < 0 || to < 0) return
    const [row] = next.splice(from, 1)
    next.splice(to, 0, row)
    onReorder(next)
    setSort(null)
    setFilters({})
    setPinnedRows([])
  }

  function resetDetailScroll() {
    if (details)
      requestAnimationFrame(() => {
        const scroll = root.current?.querySelector<HTMLElement>('[data-slot="table-container"]')
        if (scroll) scroll.scrollLeft = 0
      })
  }

  function openRow(key: string) {
    setEditing(key)
    resetDetailScroll()
  }

  return (
    <div
      ref={root}
      data-span={12}
      className="@container min-w-0 space-y-2"
      data-relational-table={id}
      onInputCapture={(event) => {
        if (event.target instanceof HTMLElement) event.target.removeAttribute("aria-invalid")
        setValidationMessage(null)
      }}
      onInvalidCapture={(event) => {
        event.preventDefault()
        if (invalidTarget.current && invalidTarget.current !== event.target) return
        invalidTarget.current = event.target
        const target = event.target as HTMLElement
        let ancestor = target.closest<HTMLElement>("[data-relation-row]")
        while (ancestor && !entries.some((entry) => entry.key === ancestor?.dataset.relationRow))
          ancestor = ancestor.parentElement?.closest<HTMLElement>("[data-relation-row]") ?? null
        const key = ancestor?.dataset.relationRow
        if (!key) {
          invalidTarget.current = null
          return
        }
        setValidationMessage(
          `Periksa ${label}, baris ${entries.findIndex((entry) => entry.key === key) + 1}: ${target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement ? target.validationMessage : "Lengkapi isian wajib."}`,
        )
        const column = target.closest<HTMLElement>("[data-relation-column]")?.dataset.relationColumn
        setFilters({})
        setSort(null)
        setPinnedRows([])
        setEditing(key)
        setPage(Math.floor(entries.findIndex((entry) => entry.key === key) / pageSize) + 1)
        if (column && hidden.includes(column))
          save({ hidden: hidden.filter((entry) => entry !== column) })
        target.setAttribute("aria-invalid", "true")
        requestAnimationFrame(() => {
          target.focus()
          invalidTarget.current = null
        })
      }}
    >
      <div className="flex min-h-9 flex-wrap items-center justify-between gap-2 text-control">
        <span className="text-muted-foreground">
          {filtered.length} / {rows.length} baris
          {chosen.length ? ` · ${chosen.length} dipilih` : ""}
        </span>
        <div className="flex items-center gap-2">
          {Object.values(filters).some(Boolean) && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setFilters({})}>
              <X />
              Reset pencarian
            </Button>
          )}
          {chosen.length > 0 && onRemove && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive"
              disabled={rows.length - chosen.length < minRows}
              onClick={() => {
                if (window.confirm(`Hapus ${chosen.length} baris terpilih dari ${label}?`)) {
                  onRemove(chosen.map((entry) => entry.key))
                  setSelected([])
                }
              }}
            >
              <Trash2 />
              Hapus terpilih
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button type="button" variant="outline" size="sm" />}
              aria-label={`Atur kolom ${label}`}
            >
              <Columns3 />
              Kolom
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              {ordered.map((column, index) => (
                <Fragment key={column.id}>
                  <DropdownMenuCheckboxItem
                    checked={!hidden.includes(column.id)}
                    disabled={!column.optional}
                    onCheckedChange={(show) =>
                      save({
                        hidden: show
                          ? hidden.filter((key) => key !== column.id)
                          : [...hidden, column.id],
                      })
                    }
                  >
                    {column.label}
                  </DropdownMenuCheckboxItem>
                  {index > 0 && (
                    <DropdownMenuItem
                      onClick={() => {
                        const order = ordered.map((item) => item.id)
                        ;[order[index - 1], order[index]] = [order[index], order[index - 1]]
                        save({ order })
                      }}
                    >
                      <ArrowUp />
                      Geser {column.label} ke kiri
                    </DropdownMenuItem>
                  )}
                </Fragment>
              ))}
              <DropdownMenuItem
                onClick={() => {
                  setLocal({})
                  store({})
                }}
              >
                Reset kolom
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {validationMessage && (
        <p role="alert" className="text-control text-destructive">
          {validationMessage}
        </p>
      )}
      {errors?.map((error) => (
        <p key={error} role="alert" className="text-control text-destructive">
          {error}
        </p>
      ))}
      <div className="overflow-hidden rounded-2xl border bg-card">
        <Table
          containerClassName="max-h-[min(65dvh,700px)] overflow-auto [scrollbar-width:none] hover:[scrollbar-width:thin] focus-within:[scrollbar-width:thin]"
          className="table-fixed text-control"
          style={{
            width: 112 + visible.reduce((total, column) => total + width(column), 0) + 120,
            minWidth: "100%",
          }}
          aria-label={label}
        >
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="sticky top-0 z-30 h-12 w-16 bg-muted px-2 md:left-0">
                {onRemove && (
                  <Checkbox
                    aria-label={`Pilih semua ${label}`}
                    checked={checked.length > 0 && checked.length === selectable.length}
                    indeterminate={checked.length > 0 && checked.length < selectable.length}
                    disabled={!selectable.length}
                    onCheckedChange={(value) =>
                      setSelected(
                        value
                          ? [...new Set([...selected, ...selectable.map((entry) => entry.key)])]
                          : selected.filter(
                              (key) => !selectable.some((entry) => entry.key === key),
                            ),
                      )
                    }
                  />
                )}
              </TableHead>
              <TableHead className="sticky top-0 z-30 w-12 bg-muted px-2 md:left-16">
                Seri
              </TableHead>
              {visible.map((column, index) => (
                <TableHead
                  key={column.id}
                  className={cn(
                    "group relative sticky top-0 z-20 bg-muted px-2",
                    index <= pinnedIndex && "md:left-(--relation-left) md:z-30",
                  )}
                  style={{ width: width(column), ...sticky(index) }}
                  aria-sort={
                    sort?.id === column.id
                      ? sort.direction === 1
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                >
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      className="min-w-0 flex-1 truncate text-left font-semibold"
                      onClick={() => {
                        setSort(
                          sort?.id === column.id && sort.direction === -1
                            ? null
                            : { id: column.id, direction: sort?.id === column.id ? -1 : 1 },
                        )
                        setPage(1)
                      }}
                      title={`Urutkan ${column.label}`}
                    >
                      {column.label}
                      {column.required && <span className="text-destructive"> *</span>}
                    </button>
                    <ArrowUpDown
                      className={cn(
                        "size-3 shrink-0",
                        sort?.id !== column.id && "text-muted-foreground/40",
                      )}
                    />
                    <button
                      type="button"
                      aria-label={`Cari ${column.label}`}
                      aria-pressed={searching === column.id}
                      onClick={() => setSearching(searching === column.id ? null : column.id)}
                      className="rounded p-1 hover:bg-accent"
                    >
                      <Search className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Pin kolom ${column.label}`}
                      aria-pressed={prefs.pinned === column.id}
                      onClick={() =>
                        save({ pinned: prefs.pinned === column.id ? null : column.id })
                      }
                      className="rounded p-1 hover:bg-accent"
                    >
                      <Pin className="size-3.5" />
                    </button>
                  </div>
                  {searching === column.id && (
                    <Input
                      autoFocus
                      aria-label={`Pencarian ${column.label}`}
                      placeholder={`Cari ${column.label}`}
                      className="my-1 h-8"
                      value={filters[column.id] ?? ""}
                      onChange={(event) => {
                        setFilters({ ...filters, [column.id]: event.target.value })
                        setPage(1)
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") event.preventDefault()
                        if (event.key === "Escape") {
                          setFilters({ ...filters, [column.id]: "" })
                          setSearching(null)
                        }
                      }}
                    />
                  )}
                  <span
                    role="separator"
                    aria-label={`Lebar kolom ${column.label}`}
                    aria-orientation="vertical"
                    tabIndex={0}
                    className="absolute inset-y-0 right-0 w-1.5 cursor-col-resize touch-none border-r border-border hover:bg-primary/30 focus-visible:bg-primary/30"
                    onPointerDown={(event) => {
                      event.preventDefault()
                      const start = event.clientX,
                        original = width(column),
                        handle = event.currentTarget
                      handle.setPointerCapture(event.pointerId)
                      handle.onpointermove = (move) =>
                        handle.parentElement?.style.setProperty(
                          "width",
                          `${Math.max(140, original + move.clientX - start)}px`,
                        )
                      handle.onpointerup = (up) => {
                        save({
                          widths: {
                            ...prefs.widths,
                            [column.id]: Math.max(140, original + up.clientX - start),
                          },
                        })
                        handle.onpointermove = null
                        handle.onpointerup = null
                      }
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                        event.preventDefault()
                        save({
                          widths: {
                            ...prefs.widths,
                            [column.id]: Math.max(
                              140,
                              width(column) + (event.key === "ArrowRight" ? 20 : -20),
                            ),
                          },
                        })
                      }
                    }}
                  />
                </TableHead>
              ))}
              <TableHead className="sticky top-0 z-30 w-[120px] bg-muted px-2 text-right md:right-0">
                Aksi
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0 && (
              <TableRow>
                <TableCell colSpan={colspan} className="h-24 text-center text-muted-foreground">
                  {rows.length ? "Tidak ada baris yang cocok." : "Belum ada baris."}
                </TableCell>
              </TableRow>
            )}
            {/* Editor tetap terpasang agar native validity dan state field bertingkat terjaga. */}
            {renderEntries.map(({ row, index, key }) => {
              const isEditing = key === editing
              const shown = displayed.has(key)
              return (
                <Fragment key={key}>
                  <TableRow
                    data-relation-row={key}
                    hidden={!shown}
                    data-state={selected.includes(key) ? "selected" : undefined}
                    className={cn("group/row", isEditing && "bg-primary/5")}
                    onDragOver={onReorder ? (event) => event.preventDefault() : undefined}
                    onDrop={
                      onReorder
                        ? (event) => {
                            event.preventDefault()
                            if (dragging) reorder(dragging, key)
                            setDragging(null)
                          }
                        : undefined
                    }
                  >
                    <TableCell className="bg-card px-2 md:sticky md:left-0 md:z-10">
                      <div className="flex items-center gap-1">
                        {onReorder && (
                          <button
                            type="button"
                            draggable
                            aria-label={`Urutkan baris ${index + 1}`}
                            className="cursor-grab rounded p-1 hover:bg-accent"
                            onDragStart={(event) => {
                              event.dataTransfer.setData("text/plain", key)
                              event.dataTransfer.effectAllowed = "move"
                              setDragging(key)
                            }}
                            onDragEnd={() => setDragging(null)}
                            onKeyDown={(event) => {
                              if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                                event.preventDefault()
                                const target = entries[index + (event.key === "ArrowUp" ? -1 : 1)]
                                if (target) reorder(key, target.key)
                              }
                            }}
                          >
                            <GripVertical className="size-3.5" />
                          </button>
                        )}
                        {onRemove && (
                          <Checkbox
                            aria-label={`Pilih baris ${index + 1}`}
                            checked={selected.includes(key)}
                            disabled={!canRemove(row)}
                            onCheckedChange={(value) =>
                              setSelected(
                                value
                                  ? [...selected, key]
                                  : selected.filter((entry) => entry !== key),
                              )
                            }
                          />
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="bg-card px-2 text-muted-foreground tabular-nums md:sticky md:left-16 md:z-10">
                      {index + 1}
                    </TableCell>
                    {ordered.map((column) => {
                      const visibleIndex = visible.findIndex((entry) => entry.id === column.id)
                      const error = column.error?.(row, index)
                      return (
                        <TableCell
                          key={column.id}
                          hidden={hidden.includes(column.id)}
                          data-relation-column={column.id}
                          className={cn(
                            "px-2 py-2 whitespace-normal",
                            visibleIndex >= 0 &&
                              visibleIndex <= pinnedIndex &&
                              "bg-card md:sticky md:left-(--relation-left) md:z-10",
                            column.numeric && "text-right tabular-nums",
                          )}
                          style={visibleIndex >= 0 ? sticky(visibleIndex) : undefined}
                        >
                          <div
                            hidden={Boolean(!details && isEditing && column.edit)}
                            className="min-w-0 truncate"
                            title={column.value(row, index)}
                          >
                            {column.edit && !details ? (
                              <button
                                type="button"
                                className={cn(
                                  "block min-h-9 w-full truncate outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                  column.numeric ? "text-right" : "text-left",
                                )}
                                onClick={() => openRow(key)}
                              >
                                {column.render?.(row, index) ?? (column.value(row, index) || "—")}
                              </button>
                            ) : (
                              (column.render?.(row, index) ?? (column.value(row, index) || "—"))
                            )}
                          </div>
                          {column.edit && (
                            <div
                              hidden={Boolean(details || !isEditing)}
                              className={cn(
                                "min-w-0",
                                error && "rounded-lg ring-2 ring-destructive",
                              )}
                              onKeyDown={(event) => {
                                if (event.key === "Escape") {
                                  event.preventDefault()
                                  setEditing(null)
                                }
                                if (
                                  event.key === "Enter" &&
                                  event.target instanceof HTMLInputElement &&
                                  !event.target.closest('[role="combobox"]') &&
                                  event.target.getAttribute("role") !== "combobox"
                                ) {
                                  event.preventDefault()
                                  setEditing(null)
                                }
                              }}
                            >
                              {column.edit(row, index)}
                            </div>
                          )}
                          {error && (
                            <p role="alert" className="mt-1 text-caption text-destructive">
                              {error}
                            </p>
                          )}
                        </TableCell>
                      )
                    })}
                    <TableCell className="bg-card px-1 md:sticky md:right-0 md:z-10">
                      <div className="flex justify-end">
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`Pin baris ${index + 1}`}
                          aria-pressed={pinnedRows.includes(key)}
                          onClick={() =>
                            setPinnedRows(
                              pinnedRows.includes(key)
                                ? pinnedRows.filter((entry) => entry !== key)
                                : [...pinnedRows, key],
                            )
                          }
                        >
                          <Pin className="size-3.5" />
                        </Button>
                        {hasEditors && (
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            aria-label={`${isEditing ? "Selesai" : "Edit"} baris ${index + 1}`}
                            aria-expanded={isEditing}
                            onClick={() => (isEditing ? setEditing(null) : openRow(key))}
                          >
                            {isEditing ? <Check /> : <Pencil />}
                          </Button>
                        )}
                        {onRemove && (
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            aria-label={`Hapus baris ${index + 1}`}
                            disabled={!canRemove(row)}
                            onClick={() => onRemove([key])}
                          >
                            <Trash2 />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                  {details && (
                    <TableRow
                      hidden={!shown || !isEditing}
                      data-relation-row={key}
                      className="hover:bg-transparent"
                    >
                      <TableCell colSpan={colspan} className="p-4 whitespace-normal">
                        <div className="form-grid w-[calc(100cqw-2rem)] min-w-0">
                          {details(row, index)}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              )
            })}
          </TableBody>
          {visible.some((column) => column.footer) && (
            <tfoot className="sticky bottom-0 z-20 border-t bg-muted font-semibold">
              <tr>
                <td className="p-2" colSpan={2}>
                  Total
                </td>
                {visible.map((column) => (
                  <td
                    key={column.id}
                    className={cn(
                      "p-2 whitespace-normal",
                      column.numeric && "text-right tabular-nums",
                    )}
                  >
                    {column.footer?.(filtered.map((entry) => entry.row))}
                  </td>
                ))}
                <td />
              </tr>
            </tfoot>
          )}
        </Table>
        {onAdd && (
          <div className="border-t bg-card p-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                const key = onAdd()
                setFilters({})
                setSort(null)
                setPinnedRows([])
                setPage(Math.floor(rows.length / pageSize) + 1)
                setEditing(key ?? null)
                resetDetailScroll()
              }}
            >
              <Plus />
              {addLabel}
            </Button>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-control text-muted-foreground">
        <label className="flex items-center gap-2" htmlFor={`${uid}-size`}>
          Baris per halaman
          <select
            id={`${uid}-size`}
            value={pageSize}
            className="h-9 rounded-md border bg-card px-2 text-foreground"
            onChange={(event) => {
              setPageSize(Number(event.target.value))
              setPage(1)
            }}
          >
            {[10, 25, 50].map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={currentPage <= 1}
            onClick={() => setPage(currentPage - 1)}
            aria-label={`Halaman sebelumnya ${label}`}
          >
            <ArrowUp className="-rotate-90" />
          </Button>
          <span>
            {currentPage} / {pages}
          </span>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={currentPage >= pages}
            onClick={() => setPage(currentPage + 1)}
            aria-label={`Halaman berikutnya ${label}`}
          >
            <ArrowDown className="-rotate-90" />
          </Button>
        </div>
      </div>
    </div>
  )
}
