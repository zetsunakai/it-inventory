import { ModulePlaceholder, moduleMetadata } from "@/components/module-placeholder"

export const metadata = moduleMetadata("/master/produk")

export default function Page() {
  return <ModulePlaceholder href="/master/produk" />
}
