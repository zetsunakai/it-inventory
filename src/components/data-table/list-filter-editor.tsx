"use client"

import { useState } from "react"
import { Plus, X } from "lucide-react"

import { FormErrors } from "@/components/form-errors"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  FILTER_OPERATORS,
  MAX_FILTER_CONDITIONS,
  operatorsFor,
  parseCustomFilter,
  type CustomFilter,
  type FilterCondition,
  type ListField,
} from "@/lib/list-controls"

export function ListControlSelect({
  label,
  value,
  options,
  onChange,
  autoFocus = false,
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
  autoFocus?: boolean
}) {
  return (
    <Select
      value={value || null}
      items={options}
      onValueChange={(next) => {
        if (next !== null) onChange(next)
      }}
    >
      <SelectTrigger aria-label={label} autoFocus={autoFocus} className="w-full min-w-0">
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function ListFilterEditor({
  fields,
  initial,
  onApply,
  onCancel,
}: {
  fields: readonly ListField[]
  initial: CustomFilter | null
  onApply: (filter: CustomFilter) => void
  onCancel: () => void
}) {
  const blank = (field = fields[0]): FilterCondition => ({
    field: field.key,
    operator: operatorsFor(field)[0],
    value: "",
  })
  const [draft, setDraft] = useState<CustomFilter>(
    initial ?? { match: "all", conditions: [blank()] },
  )
  const [errors, setErrors] = useState<string[]>([])
  function update(index: number, change: Partial<FilterCondition>) {
    setDraft((draft) => ({
      ...draft,
      conditions: draft.conditions.map((condition, position) =>
        position === index ? { ...condition, ...change } : condition,
      ),
    }))
  }

  return (
    <form
      className="space-y-3 border-t pt-3 sm:col-span-2"
      onSubmit={(event) => {
        event.preventDefault()
        const result = parseCustomFilter(JSON.stringify(draft), fields)
        if (result.error || !result.filter) {
          setErrors([result.error ?? "Tambahkan kondisi filter."])
          return
        }
        onApply(result.filter)
      }}
    >
      <FormErrors errors={errors} />
      <ListControlSelect
        autoFocus
        label="Cocokkan kondisi"
        value={draft.match}
        options={[
          { value: "all", label: "Semua kondisi terpenuhi (AND)" },
          { value: "any", label: "Salah satu kondisi terpenuhi (OR)" },
        ]}
        onChange={(match) => setDraft({ ...draft, match: match as CustomFilter["match"] })}
      />
      {draft.conditions.map((condition, index) => {
        const field = fields.find((field) => field.key === condition.field) ?? fields[0]
        const noValue = condition.operator === "empty" || condition.operator === "not_empty"
        const options =
          field.type === "boolean"
            ? [
                { value: "true", label: "Ya" },
                { value: "false", label: "Tidak" },
              ]
            : field.options
        const input = (end = false) =>
          options ? (
            <ListControlSelect
              label={`${end ? "Nilai akhir" : "Nilai"} kondisi ${index + 1}`}
              value={end ? (condition.end ?? "") : condition.value}
              options={options}
              onChange={(value) => update(index, end ? { end: value } : { value })}
            />
          ) : (
            <Input
              aria-label={`${end ? "Nilai akhir" : "Nilai"} kondisi ${index + 1}`}
              type={field.type === "date" ? "date" : "text"}
              inputMode={field.type === "number" ? "decimal" : undefined}
              placeholder={end ? "Sampai" : "Nilai"}
              maxLength={200}
              value={end ? (condition.end ?? "") : condition.value}
              onChange={(event) =>
                update(index, end ? { end: event.target.value } : { value: event.target.value })
              }
            />
          )
        return (
          <div key={index} className="flex items-start gap-2">
            <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-3">
              <ListControlSelect
                label={`Field kondisi ${index + 1}`}
                value={field.key}
                options={fields.map((field) => ({ value: field.key, label: field.label }))}
                onChange={(key) => update(index, blank(fields.find((field) => field.key === key)!))}
              />
              <ListControlSelect
                label={`Operator kondisi ${index + 1}`}
                value={condition.operator}
                options={operatorsFor(field).map((value) => ({
                  value,
                  label: FILTER_OPERATORS[value],
                }))}
                onChange={(operator) =>
                  update(index, {
                    operator: operator as FilterCondition["operator"],
                    end: undefined,
                  })
                }
              />
              {!noValue && (
                <div className="grid min-w-0 gap-2">
                  {input()}
                  {condition.operator === "between" && input(true)}
                </div>
              )}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Hapus kondisi ${index + 1}`}
              disabled={draft.conditions.length === 1}
              onClick={() =>
                setDraft({
                  ...draft,
                  conditions: draft.conditions.filter((_, position) => position !== index),
                })
              }
            >
              <X />
            </Button>
          </div>
        )
      })}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={draft.conditions.length >= MAX_FILTER_CONDITIONS}
          onClick={() => setDraft({ ...draft, conditions: [...draft.conditions, blank()] })}
        >
          <Plus />
          Tambah kondisi
        </Button>
        <div className="ml-auto flex gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Batal
          </Button>
          <Button type="submit">Terapkan</Button>
        </div>
      </div>
    </form>
  )
}
