import { Suspense } from "react"

import { AppBreadcrumb } from "@/components/app-breadcrumb"
import { AccountMenu, AppSidebar } from "@/components/app-sidebar"
import { BreadcrumbProvider } from "@/components/breadcrumb-context"
import { PageMessageProvider } from "@/components/layout/page-message"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { Skeleton } from "@/components/ui/skeleton"

// Layout untuk semua halaman setelah login (mengikuti hmx-002, RU-21): sidebar menu per peran dan
// bar atas berisi breadcrumb dan menu akun. Sesi tidak dibaca di sini (hanya di balik <Suspense> di dalam sidebar dan
// halaman), supaya kerangka layout ikut di-prerender dan navigasi terasa instan.
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <BreadcrumbProvider>
      <PageMessageProvider>
        <SidebarProvider>
          <AppSidebar />
          <SidebarInset>
            <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-3 border-b bg-card/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-card/80 md:px-6">
              <SidebarTrigger className="-ml-1.5" />
              {/* usePathname di route dinamis adalah data request, jadi perlu Suspense. */}
              <Suspense fallback={<span className="h-5" />}>
                <AppBreadcrumb />
              </Suspense>
              <div className="ml-auto">
                <Suspense fallback={<Skeleton className="h-10 w-40" />}>
                  <AccountMenu />
                </Suspense>
              </div>
            </header>
            <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 md:px-8">
              {children}
            </div>
          </SidebarInset>
        </SidebarProvider>
      </PageMessageProvider>
    </BreadcrumbProvider>
  )
}
