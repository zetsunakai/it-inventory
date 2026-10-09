"use client"

import { useState, useTransition } from "react"

import { FormErrors } from "@/components/form-errors"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ROLE_LABELS, type Role } from "@/lib/permissions"

import { grantWarehouseAccess, revokeWarehouseAccess } from "./actions"

type User = { id: string; name: string; email: string; roles: Role[] }

function roleText(roles: Role[]) {
  return roles.map((role) => ROLE_LABELS[role]).join(", ") || "Belum punya peran"
}

// Akses gudang per user (PRD bagian 3). Hanya untuk user dengan izin user:manage.
export function AccessManager({
  warehouseId,
  members,
  candidates,
}: {
  warehouseId: string
  members: User[]
  candidates: User[]
}) {
  const [selected, setSelected] = useState<string | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [pending, startTransition] = useTransition()

  function run(action: typeof grantWarehouseAccess, userId: string) {
    startTransition(async () => {
      const result = await action({ warehouseId, userId })
      setErrors(result.ok ? [] : result.errors)
      if (result.ok) setSelected(null)
    })
  }

  const items = candidates.map((user) => ({
    value: user.id,
    label: `${user.name} (${roleText(user.roles)})`,
  }))

  return (
    <div className="space-y-4">
      {members.length === 0 ? (
        <p className="text-sm text-muted-foreground">Belum ada user dengan akses khusus.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {members.map((user) => (
            <li key={user.id} className="flex items-center justify-between gap-4 px-4 py-2">
              <div>
                <p className="text-sm font-medium">{user.name}</p>
                <p className="text-xs text-muted-foreground">
                  {user.email} · {roleText(user.roles)}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={pending}
                onClick={() => run(revokeWarehouseAccess, user.id)}
                aria-label={`Cabut akses ${user.name}`}
              >
                Cabut
              </Button>
            </li>
          ))}
        </ul>
      )}
      {candidates.length > 0 && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="space-y-2">
            <Label htmlFor="grant-user">Beri akses ke</Label>
            <Select items={items} value={selected} onValueChange={(value) => setSelected(value)}>
              <SelectTrigger id="grant-user" className="w-full sm:w-80">
                <SelectValue placeholder="Pilih user" />
              </SelectTrigger>
              <SelectContent>
                {items.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            disabled={pending || !selected}
            onClick={() => selected && run(grantWarehouseAccess, selected)}
          >
            Beri akses
          </Button>
        </div>
      )}
      <FormErrors errors={errors} />
    </div>
  )
}
