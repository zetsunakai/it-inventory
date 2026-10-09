import { ModulePlaceholder, moduleMetadata } from "@/components/module-placeholder"

export const metadata = moduleMetadata("/inventory/transfer")

export default function Page() {
  return <ModulePlaceholder href="/inventory/transfer" />
}
