"use client"

import { ArrowDown, ArrowUp, GripVertical, Eye, Pin, Plus, Trash2 } from "lucide-react"
import { Fragment, useEffect, useId, useRef, useState, type ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
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

// Pin baris dan pagination hanya mengubah tampilan. Semua callback memakai indeks sumber.
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
  readOnly = false,
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
  readOnly?: boolean
  addLabel?: string
  errors?: string[]
  minRows?: number
}) {
  const uid = useId()
  const root = useRef<HTMLDivElement>(null)
  const insidePointers = useRef(new WeakSet<Event>())
  const pendingFocus = useRef<{ key: string; column?: string } | null>(null)
  useEffect(() => {
    if (!pendingFocus.current) return
    const frame = requestAnimationFrame(() => {
      const pending = pendingFocus.current
      if (!pending) return
      const matchingRows = Array.from(
        root.current?.querySelectorAll<HTMLElement>("[data-relation-row]") ?? [],
      ).filter((element) => element.dataset.relationRow === pending.key)
      const row = matchingRows[0]
      const cell = pending.column
        ? Array.from(row?.querySelectorAll<HTMLElement>("[data-relation-column]") ?? []).find(
            (element) => element.dataset.relationColumn === pending.column,
          )
        : row
      const selector =
        'input:not([type="hidden"]):not([type="checkbox"]), textarea, select, button[role="combobox"]'
      const candidates = [
        ...Array.from(cell?.querySelectorAll<HTMLElement>(selector) ?? []),
        ...matchingRows.flatMap((element) =>
          Array.from(element.querySelectorAll<HTMLElement>(selector)),
        ),
      ]
      const control = candidates.find(
        (element) =>
          !element.closest("[hidden]") &&
          !element.hasAttribute("disabled") &&
          element.getClientRects().length > 0,
      )
      if (control) {
        control.focus()
        control.scrollIntoView({ block: "nearest", inline: "nearest" })
        pendingFocus.current = null
      }
    })
    return () => cancelAnimationFrame(frame)
  })
  const invalidTarget = useRef<EventTarget | null>(null)
  const [validationMessage, setValidationMessage] = useState<string | null>(null)
  const [hidden, setHidden] = useState(() =>
    columns.filter((column) => column.hidden).map((column) => column.id),
  )
  const visible = columns.filter((column) => !hidden.includes(column.id))
  const [selected, setSelected] = useState<string[]>([])
  const [pinnedRows, setPinnedRows] = useState<string[]>([])
  const [editing, setEditing] = useState<string | null>(null)
  useEffect(() => {
    if (readOnly || !editing) return
    const closeOutside = (event: PointerEvent) => {
      // React capture also includes dropdowns and dialogs rendered through portals.
      if (insidePointers.current.has(event) || root.current?.contains(event.target as Node)) return
      pendingFocus.current = null
      setEditing(null)
    }
    document.addEventListener("pointerdown", closeOutside)
    return () => document.removeEventListener("pointerdown", closeOutside)
  }, [editing, readOnly])
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [dragging, setDragging] = useState<string | null>(null)
  const entries = rows.map((row, index) => ({ row, index, key: rowKey(row) }))
  const sorted = [...entries].sort(
    (a, b) =>
      Number(pinnedRows.includes(b.key)) - Number(pinnedRows.includes(a.key)) || a.index - b.index,
  )
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
    setPinnedRows([])
  }

  function resetDetailScroll() {
    if (details)
      requestAnimationFrame(() => {
        const scroll = root.current?.querySelector<HTMLElement>('[data-slot="table-container"]')
        if (scroll) scroll.scrollLeft = 0
      })
  }

  function openRow(key: string, column?: string) {
    pendingFocus.current = readOnly ? null : { key, column }
    setEditing(key)
    resetDetailScroll()
  }

  return (
    <div
      ref={root}
      data-span={12}
      className="@container min-w-0 space-y-2"
      data-relational-table={id}
      onPointerDownCapture={(event) => insidePointers.current.add(event.nativeEvent)}
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
        setPinnedRows([])
        setEditing(key)
        setPage(Math.floor(entries.findIndex((entry) => entry.key === key) / pageSize) + 1)
        if (column && hidden.includes(column))
          setHidden((current) => current.filter((entry) => entry !== column))
        target.setAttribute("aria-invalid", "true")
        requestAnimationFrame(() => {
          target.focus()
          invalidTarget.current = null
        })
      }}
    >
      {chosen.length > 0 && onRemove && (
        <div className="flex justify-end">
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
        </div>
      )}
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
          containerClassName="max-h-[min(65dvh,700px)] overflow-x-hidden overflow-y-auto"
          className="w-full table-fixed text-control"
          aria-label={label}
        >
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="sticky top-0 z-30 h-12 w-10 bg-muted px-1 md:w-16 md:px-2">
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
              <TableHead className="sticky top-0 z-30 w-9 bg-muted px-1 md:w-12 md:px-2">
                Seri
              </TableHead>
              {visible.map((column) => (
                <TableHead
                  key={column.id}
                  className="sticky top-0 z-20 bg-muted px-2 whitespace-normal"
                >
                  <span className="font-semibold wrap-anywhere">
                    {column.label}
                    {column.required && <span className="text-destructive"> *</span>}
                  </span>
                </TableHead>
              ))}
              <TableHead className="sticky top-0 z-30 w-10 bg-muted px-1 text-right md:w-[120px] md:px-2">
                Aksi
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0 && (
              <TableRow>
                <TableCell colSpan={colspan} className="h-24 text-center text-muted-foreground">
                  Belum ada baris.
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
                    className={cn(
                      "group/row",
                      !readOnly && hasEditors && "cursor-pointer",
                      isEditing && "bg-primary/5",
                    )}
                    tabIndex={!readOnly && hasEditors && !isEditing ? 0 : undefined}
                    onKeyDown={(event) => {
                      if (
                        event.target !== event.currentTarget ||
                        readOnly ||
                        !hasEditors ||
                        isEditing
                      )
                        return
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault()
                        openRow(key)
                      }
                    }}
                    onClick={(event) => {
                      if (readOnly || !hasEditors || isEditing || event.defaultPrevented) return
                      const target = event.target as HTMLElement
                      if (
                        target.closest(
                          'button, a, input, textarea, select, label, [role="button"], [role="checkbox"], [role="combobox"], fieldset:disabled',
                        )
                      )
                        return
                      const columnId =
                        target.closest<HTMLElement>("[data-relation-column]")?.dataset
                          .relationColumn
                      const column = columns.find((column) => column.id === columnId)
                      openRow(key, !details && column?.edit ? columnId : undefined)
                    }}
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
                    <TableCell className="bg-card px-1 md:px-2">
                      <div className="flex flex-wrap items-center gap-1">
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
                    <TableCell className="bg-card px-1 text-muted-foreground tabular-nums md:px-2">
                      {index + 1}
                    </TableCell>
                    {columns.map((column) => {
                      const error = column.error?.(row, index)
                      return (
                        <TableCell
                          key={column.id}
                          hidden={hidden.includes(column.id)}
                          data-relation-column={column.id}
                          className={cn(
                            "min-w-0 px-2 py-2 wrap-anywhere whitespace-normal",
                            column.numeric && "text-right tabular-nums",
                          )}
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
                                onClick={() => openRow(key, column.id)}
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
                                "max-w-full min-w-0 [&_[data-slot=select-value]]:min-w-0 [&_button]:max-w-full [&_button]:min-w-0 [&_input]:max-w-full",
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
                    <TableCell className="bg-card px-1">
                      <div className="flex flex-wrap justify-end">
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
                        {hasEditors && readOnly && (
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            aria-label={`${isEditing ? "Tutup detail" : "Lihat detail"} baris ${index + 1}`}
                            aria-expanded={isEditing}
                            onClick={() => (isEditing ? setEditing(null) : openRow(key))}
                          >
                            <Eye />
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
                        <div className="form-grid w-full min-w-0">{details(row, index)}</div>
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
                    {column.footer?.(rows)}
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
                setPinnedRows([])
                setPage(Math.floor(rows.length / pageSize) + 1)
                pendingFocus.current = key ? { key } : null
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
