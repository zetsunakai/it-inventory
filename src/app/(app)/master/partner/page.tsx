import { ModulePlaceholder, moduleMetadata } from "@/components/module-placeholder"

export const metadata = moduleMetadata("/master/partner")

export default function Page() {
  return <ModulePlaceholder href="/master/partner" />
}
