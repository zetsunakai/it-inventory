import { ModulePlaceholder, moduleMetadata } from "@/components/module-placeholder"

export const metadata = moduleMetadata("/master/gudang")

export default function Page() {
  return <ModulePlaceholder href="/master/gudang" />
}
