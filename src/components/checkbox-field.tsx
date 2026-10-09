import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"

// Checkbox dengan label dan penjelasan. Nilainya terkirim sebagai "on" hanya saat dicentang.
export function CheckboxField({
  name,
  label,
  description,
  defaultChecked,
}: {
  name: string
  label: string
  description: string
  defaultChecked: boolean
}) {
  return (
    <div className="flex items-start gap-2">
      <Checkbox id={name} name={name} defaultChecked={defaultChecked} />
      <div className="grid gap-1 leading-none">
        <Label htmlFor={name}>{label}</Label>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  )
}
