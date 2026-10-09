"use client"

import { useActionState } from "react"

import { FormErrors } from "@/components/form-errors"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { fieldValue, type FormState } from "@/lib/action-result"

import { updateSetting } from "./actions"

export function SettingForm({ settingKey, value }: { settingKey: string; value: string }) {
  const [state, formAction, pending] = useActionState<FormState<void>, FormData>(
    updateSetting,
    null,
  )

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="key" value={settingKey} />
      <div className="flex gap-2">
        <Input
          name="value"
          defaultValue={fieldValue(state, "value", value)}
          aria-label={settingKey}
        />
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? "Menyimpan…" : "Simpan"}
        </Button>
      </div>
      {state?.ok === false && <FormErrors errors={state.errors} />}
      {state?.ok && state.message && (
        <p className="text-sm text-muted-foreground">{state.message}</p>
      )}
    </form>
  )
}
