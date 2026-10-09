import { Suspense } from "react"

import { AppBreadcrumb } from "@/components/app-breadcrumb"
import { AppSidebar } from "@/components/app-sidebar"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"

// Layout untuk semua halaman setelah login: sidebar menu per peran dan header berisi konteks
// (breadcrumb). Sesi tidak dibaca di sini (hanya di balik <Suspense> di dalam sidebar dan
// halaman), supaya kerangka layout ikut di-prerender dan navigasi terasa instan.
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-11 shrink-0 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <SidebarTrigger className="-ml-1.5" />
          {/* usePathname di route dinamis adalah data request, jadi perlu Suspense. */}
          <Suspense fallback={<span className="h-5" />}>
            <AppBreadcrumb />
          </Suspense>
        </header>
        <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-5 px-4 py-5 md:px-6">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
