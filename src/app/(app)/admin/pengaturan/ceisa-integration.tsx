"use client"

import { CircleAlert, CircleCheck, Eye, EyeOff, PlugZap } from "lucide-react"
import { useState, useTransition } from "react"

import { FormErrors } from "@/components/form-errors"
import { FormField, FormSection, StaticField } from "@/components/form-field"
import { FORM_CLASS, FormActions, FormColumn, FormColumns } from "@/components/layout/form-layout"
import { RecordModes, useSaveFeedback } from "@/components/layout/record-modes"
import { StatusBadge } from "@/components/status-badge"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog"
import type { ActionResult } from "@/lib/action-result"
import { formatDateTime } from "@/lib/format"
import {
  CEISA_ENVIRONMENT_LABELS,
  CEISA_OUTCOME_TITLES,
  CEISA_OUTCOME_TONES,
  type CeisaConnectResult,
  type CeisaEnvironment,
  type CeisaOutcome,
} from "@/modules/it-inventory/lib/ceisa"
import {
  connectCeisa,
  revealCeisaPassword,
  saveCeisaCredentials,
} from "@/modules/it-inventory/actions/ceisa"

export type CeisaConnectionStatus = {
  lastOutcome: CeisaOutcome
  lastMessage: string | null
  lastAttemptAt: Date
  authenticatedAt: Date | null
  httpStatus: number | null
}

type SettingsProps = {
  environment: CeisaEnvironment
  configured: boolean
  savedUsername: string
  hasApiKey: boolean
  connection: CeisaConnectionStatus | null
  settings: { key: string; label: string; value: string }[]
}

type Draft = {
  username: string
  password: string
  apiKey: string
  settings: Record<string, string>
}

export function CeisaIntegration(props: SettingsProps) {
  return (
    <RecordModes
      canEdit
      view={<SettingsFields {...props} />}
      form={<SettingsEditor {...props} />}
      actions={<ConnectButton environment={props.environment} />}
    />
  )
}

function SettingsEditor(props: SettingsProps) {
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<ActionResult<{ message: string }> | null>(null)
  const [draft, setDraft] = useState<Draft>({
    username: props.savedUsername,
    password: "",
    apiKey: "",
    settings: Object.fromEntries(props.settings.map((setting) => [setting.key, setting.value])),
  })
  useSaveFeedback(result, { silent: true })

  async function save() {
    try {
      const response = await saveCeisaCredentials({
        ...draft,
        settings: props.settings.map(({ key }) => ({ key, value: draft.settings[key] })),
      })
      setResult(response.ok ? { ...response, message: response.data.message } : response)
    } catch {
      setResult({ ok: false, errors: ["Tidak dapat menyimpan pengaturan. Coba lagi."] })
    }
  }

  return (
    <form
      className={FORM_CLASS}
      onSubmit={(event) => {
        event.preventDefault()
        startTransition(save)
      }}
    >
      <FormActions>
        <Button type="submit" disabled={pending}>
          {pending ? "Menyimpan…" : "Simpan"}
        </Button>
      </FormActions>
      {result?.ok === false && <FormErrors errors={result.errors} />}
      <SettingsFields {...props} editor={{ draft, setDraft, pending }} />
    </form>
  )
}

function SettingsFields({
  environment,
  configured,
  savedUsername,
  hasApiKey,
  connection,
  settings,
  editor,
}: SettingsProps & {
  editor?: { draft: Draft; setDraft: React.Dispatch<React.SetStateAction<Draft>>; pending: boolean }
}) {
  const status =
    connection?.lastOutcome === "connected"
      ? { tone: "success" as const, label: "Terhubung" }
      : !connection || (connection.lastOutcome === "misconfigured" && configured)
        ? { tone: "neutral" as const, label: "Belum dihubungkan" }
        : { tone: CEISA_OUTCOME_TONES[connection.lastOutcome], label: "Gagal terhubung" }
  return (
    <div className="space-y-6">
      <FormSection title="Pengaturan sistem">
        {settings.map((setting) =>
          editor ? (
            <FormField
              key={setting.key}
              label={setting.label}
              htmlFor={`setting-${setting.key}`}
              required
            >
              {setting.key === "ceisa.environment" ? (
                <Select
                  value={editor.draft.settings[setting.key]}
                  disabled={editor.pending}
                  onValueChange={(value) => {
                    if (value)
                      editor.setDraft((current) => ({
                        ...current,
                        settings: { ...current.settings, [setting.key]: value },
                      }))
                  }}
                >
                  <SelectTrigger id={`setting-${setting.key}`} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="production">Production</SelectItem>
                    <SelectItem value="development">Development</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id={`setting-${setting.key}`}
                  value={editor.draft.settings[setting.key]}
                  disabled={editor.pending}
                  required
                  onChange={(event) =>
                    editor.setDraft((current) => ({
                      ...current,
                      settings: { ...current.settings, [setting.key]: event.target.value },
                    }))
                  }
                />
              )}
            </FormField>
          ) : (
            <StaticField key={setting.key} label={setting.label} value={setting.value} />
          ),
        )}
      </FormSection>
      <FormSection title="Integrasi CEISA">
        <div className="form-field" data-span={12}>
          <FormColumns>
            <FormColumn>
              {editor ? (
                <>
                  <FormField label="Username CEISA" htmlFor="ceisa-username">
                    <Input
                      id="ceisa-username"
                      autoComplete="off"
                      value={editor.draft.username}
                      disabled={editor.pending}
                      maxLength={200}
                      onChange={(event) =>
                        editor.setDraft((current) => ({ ...current, username: event.target.value }))
                      }
                    />
                  </FormField>
                  <FormField
                    label="Password CEISA"
                    htmlFor="ceisa-password"
                    hint={
                      configured
                        ? "Kosongkan untuk mempertahankan password tersimpan."
                        : "Isi password akun CEISA, bukan password IT Inventory."
                    }
                  >
                    <CeisaPasswordInput
                      configured={configured && editor.draft.username === savedUsername}
                      value={editor.draft.password}
                      disabled={editor.pending}
                      onChange={(password) =>
                        editor.setDraft((current) => ({ ...current, password }))
                      }
                    />
                  </FormField>
                  <FormField
                    label="Bea Cukai API key"
                    htmlFor="ceisa-api-key"
                    hint={
                      hasApiKey
                        ? "Opsional. API key sudah tersimpan; kosongkan untuk mempertahankannya."
                        : "Opsional. Isi jika memiliki API key Bea Cukai."
                    }
                  >
                    <Input
                      id="ceisa-api-key"
                      type="password"
                      autoComplete="new-password"
                      value={editor.draft.apiKey}
                      disabled={editor.pending}
                      maxLength={4096}
                      onChange={(event) =>
                        editor.setDraft((current) => ({ ...current, apiKey: event.target.value }))
                      }
                    />
                  </FormField>
                </>
              ) : (
                <>
                  <StaticField label="Username CEISA" value={savedUsername || "Belum diatur"} />
                  <StaticField
                    label="Password CEISA"
                    value={configured ? "Sudah diatur" : "Belum diatur"}
                  />
                  <StaticField
                    label="Bea Cukai API key"
                    value={hasApiKey ? "Sudah diatur" : "Belum diatur"}
                    reason="Opsional."
                  />
                </>
              )}
            </FormColumn>
            <FormColumn>
              <StaticField
                label="Lingkungan"
                value={CEISA_ENVIRONMENT_LABELS[environment]}
                reason="Diatur lewat pilihan Lingkungan CEISA dan disimpan di database."
              />
              <StaticField
                label="Status koneksi"
                value={<StatusBadge tone={status.tone}>{status.label}</StatusBadge>}
                reason={
                  connection
                    ? `Percobaan terakhir ${formatDateTime(connection.lastAttemptAt)}`
                    : undefined
                }
              />
              {connection?.lastMessage && (
                <StaticField label="Pesan terakhir" value={connection.lastMessage} multiline />
              )}
              {connection?.authenticatedAt && (
                <StaticField
                  label="Autentikasi berhasil terakhir"
                  value={formatDateTime(connection.authenticatedAt)}
                />
              )}
              <StaticField
                label="Masa berlaku token"
                value="Diperbarui setiap kali Hubungkan berhasil"
                reason="Token disimpan terenkripsi di server; belum ada pengiriman dokumen yang memakainya."
              />
            </FormColumn>
          </FormColumns>
        </div>
      </FormSection>
    </div>
  )
}

function CeisaPasswordInput({
  configured,
  value,
  disabled,
  onChange,
}: {
  configured: boolean
  value: string
  disabled: boolean
  onChange: (value: string) => void
}) {
  const [visible, setVisible] = useState(false)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState("")
  async function toggle() {
    setError("")
    if (!visible && !value && configured) {
      try {
        const result = await revealCeisaPassword({})
        if (!result.ok) {
          setError(result.errors.join(" "))
          return
        }
        onChange(result.data.password)
      } catch {
        setError("Password tidak dapat ditampilkan. Coba lagi.")
        return
      }
    }
    setVisible(!visible)
  }
  return (
    <>
      <div className="relative">
        <Input
          id="ceisa-password"
          type={visible ? "text" : "password"}
          autoComplete="new-password"
          value={value}
          placeholder={configured ? "••••••••" : undefined}
          disabled={disabled || pending}
          maxLength={4096}
          className="pr-12"
          onChange={(event) => onChange(event.target.value)}
        />
        <Button
          type="button"
          variant="inline"
          size="icon"
          className="absolute top-0 right-0"
          aria-label={visible ? "Sembunyikan password CEISA" : "Tampilkan password CEISA"}
          aria-pressed={visible}
          aria-controls="ceisa-password"
          disabled={disabled || pending}
          onClick={() => startTransition(toggle)}
        >
          {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-caption text-destructive">
          {error}
        </p>
      )}
    </>
  )
}

function ConnectButton({ environment }: { environment: CeisaEnvironment }) {
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<CeisaConnectResult | null>(null)
  const [open, setOpen] = useState(false)
  async function connect() {
    try {
      const response = await connectCeisa({})
      setResult(
        response.ok
          ? response.data
          : {
              environment,
              outcome: "server_error",
              message: response.errors.join(" "),
              httpStatus: null,
              authenticatedAt: null,
            },
      )
    } catch {
      setResult({
        environment,
        outcome: "unreachable",
        message: "Tidak dapat menghubungi server. Coba lagi.",
        httpStatus: null,
        authenticatedAt: null,
      })
    }
    setOpen(true)
  }
  const tone = result ? CEISA_OUTCOME_TONES[result.outcome] : "neutral"
  const Icon = tone === "success" ? CircleCheck : CircleAlert
  const toneClass =
    tone === "success"
      ? "bg-success-soft text-success"
      : tone === "danger"
        ? "bg-destructive-soft text-destructive"
        : "bg-warning-soft text-warning"
  return (
    <>
      <Button
        type="button"
        variant="outline"
        disabled={pending}
        onClick={() => startTransition(connect)}
      >
        <PlugZap aria-hidden="true" />
        {pending ? "Menghubungkan…" : "Hubungkan"}
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia className={toneClass}>
              <Icon aria-hidden="true" />
            </AlertDialogMedia>
            <AlertDialogTitle>
              {result ? CEISA_OUTCOME_TITLES[result.outcome] : "Hasil koneksi"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {result?.message}
              {result?.httpStatus ? ` (HTTP ${result.httpStatus})` : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Tutup</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
