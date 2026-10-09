"use client"

import { useActionState } from "react"

import { FormErrors } from "@/components/form-errors"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  confirmMfaSetup,
  startMfaSetup,
  type CodeState,
  type MfaSetupState,
} from "@/server/auth/actions"

export function MfaSetup() {
  const [setup, startAction, starting] = useActionState<MfaSetupState, FormData>(startMfaSetup, {})
  const [confirm, confirmAction, confirming] = useActionState<CodeState, FormData>(
    confirmMfaSetup,
    {},
  )

  // Langkah 1: konfirmasi password sebelum secret TOTP dibuat.
  if (!setup.qrSvg) {
    return (
      <form action={startAction} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="password">Password akun Anda</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>
        <FormErrors errors={setup.errors} />
        <Button type="submit" disabled={starting}>
          {starting ? "Memproses…" : "Lanjut"}
        </Button>
      </form>
    )
  }

  // Langkah 2: pindai QR, simpan backup code, lalu masukkan kode pertama.
  return (
    <div className="space-y-6">
      <ol className="list-decimal space-y-1 pl-5 text-sm">
        <li>
          Pindai QR ini dengan Google Authenticator, Microsoft Authenticator, atau sejenisnya.
        </li>
        <li>Simpan backup code di tempat aman. Setiap kode hanya bisa dipakai sekali.</li>
        <li>Masukkan kode 6 digit yang muncul di aplikasi.</li>
      </ol>
      <div
        className="size-48 rounded-lg border bg-white p-2"
        aria-label="QR code aktivasi MFA"
        role="img"
        // SVG dibuat server oleh library qrcode dari URI TOTP milik user sendiri.
        dangerouslySetInnerHTML={{ __html: setup.qrSvg }}
      />
      {setup.manualKey && (
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">
            Tidak bisa memindai? Masukkan kunci ini secara manual di aplikasi authenticator:
          </p>
          <code
            data-testid="mfa-manual-key"
            className="block rounded-lg border p-3 font-mono text-sm break-all"
          >
            {setup.manualKey}
          </code>
        </div>
      )}
      <div className="space-y-2">
        <p className="text-sm font-medium">Backup code</p>
        <ul className="grid grid-cols-2 gap-1 rounded-lg border p-3 font-mono text-sm">
          {setup.backupCodes?.map((code) => (
            <li key={code}>{code}</li>
          ))}
        </ul>
      </div>
      <form action={confirmAction} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="code">Kode dari aplikasi</Label>
          <Input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            required
          />
        </div>
        <FormErrors errors={confirm.errors} />
        <Button type="submit" disabled={confirming}>
          {confirming ? "Memeriksa…" : "Aktifkan MFA"}
        </Button>
      </form>
    </div>
  )
}
