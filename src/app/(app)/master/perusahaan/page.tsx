import { ModulePlaceholder, moduleMetadata } from "@/components/module-placeholder"

export const metadata = moduleMetadata("/master/perusahaan")

export default function Page() {
  return <ModulePlaceholder href="/master/perusahaan" />
}
