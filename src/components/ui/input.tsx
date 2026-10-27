import * as React from "react"
import { cn } from "@/lib/utils"

// Input HTML biasa, sama seperti Textarea. Bukan Input Base UI: itu FieldControl yang memperingatkan
// bila defaultValue berubah setelah dibuat, padahal form di repo ini memang mengganti defaultValue
// setelah submit (fieldValue: ketikan terakhir saat gagal, nilai tersimpan setelah berhasil). Repo
// ini tidak memakai Field Base UI, jadi tidak ada fitur yang hilang.
function Input({ className, type, inputMode, onFocus, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      inputMode={inputMode}
      onFocus={(event) => {
        if (inputMode === "decimal" && /^0(?:[.,]0+)?$/.test(event.currentTarget.value)) {
          event.currentTarget.select()
        }
        onFocus?.(event)
      }}
      data-slot="input"
      className={cn(
        "h-10 w-full min-w-0 rounded-lg border border-input bg-transparent px-3 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-control dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className,
      )}
      {...props}
    />
  )
}

export { Input }
