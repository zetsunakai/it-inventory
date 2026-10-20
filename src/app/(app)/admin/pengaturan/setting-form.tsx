"use client"

import { useActionState } from "react"

import { FormErrors } from "@/components/form-errors"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { fieldValue, type FormState } from "@/lib/action-result"

import { updateSetting } from "./actions"

// Satu pengaturan: label, kunci teknisnya, nilai, dan Simpan di baris yang sama (selebar kartu).
export function SettingForm({
  settingKey,
  label,
  value,
}: {
  settingKey: string
  label: string
  value: string
}) {
  const id = `setting-${settingKey.replace(/[^a-z0-9]+/gi, "-")}`
  const [state, formAction, pending] = useActionState<FormState<void>, FormData>(
    updateSetting,
    null,
  )

  return (
    <form action={formAction} className="form-field col-span-full">
      {state?.ok === false && <FormErrors errors={state.errors} />}
      <input type="hidden" name="key" value={settingKey} />
      <Label htmlFor={id} className="form-field-label">
        {label}
      </Label>
      <div className="flex gap-2">
        <Input
          id={id}
          name="value"
          defaultValue={fieldValue(state, "value", value)}
          aria-describedby={`${id}-key`}
        />
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? "Menyimpan…" : "Simpan"}
        </Button>
      </div>
      <p id={`${id}-key`} className="font-mono text-caption text-muted-foreground">
        {settingKey}
      </p>
      {state?.ok && state.message && (
        <p className="text-sm text-muted-foreground">{state.message}</p>
      )}
    </form>
  )
}
