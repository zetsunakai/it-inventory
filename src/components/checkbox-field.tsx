import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"

// Checkbox dengan label dan penjelasan. Nilainya terkirim sebagai "on" hanya saat dicentang.
export function CheckboxField({
  name,
  label,
  description,
  defaultChecked,
  onCheckedChange,
}: {
  name: string
  label: string
  description: string
  defaultChecked: boolean
  onCheckedChange?: (checked: boolean) => void
}) {
  return (
    <div className="flex items-start gap-2">
      <Checkbox
        key={defaultChecked ? "checked" : "unchecked"}
        id={name}
        name={name}
        defaultChecked={defaultChecked}
        onCheckedChange={onCheckedChange}
      />
      <div className="grid gap-1 leading-none">
        <Label htmlFor={name}>{label}</Label>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  )
}
