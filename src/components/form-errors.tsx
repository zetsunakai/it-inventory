// Menampilkan semua kesalahan form sekaligus (PRD bagian 7.6).
export function FormErrors({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null
  return (
    <ul role="alert" className="space-y-1 text-sm text-destructive">
      {errors.map((message) => (
        <li key={message}>{message}</li>
      ))}
    </ul>
  )
}
