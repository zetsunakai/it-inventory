import { ModulePlaceholder, moduleMetadata } from "@/components/module-placeholder"

export const metadata = moduleMetadata("/inventory/opname")

export default function Page() {
  return <ModulePlaceholder href="/inventory/opname" />
}
