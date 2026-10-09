import { AppSidebar } from "@/components/app-sidebar"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"

// Layout untuk semua halaman setelah login: sidebar menu per peran dan header.
// Sesi tidak dibaca di sini (hanya di balik <Suspense> di dalam sidebar dan halaman),
// supaya kerangka layout ikut di-prerender dan navigasi terasa instan.
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 border-b bg-background px-4">
          <SidebarTrigger className="-ml-1" />
          <span className="text-sm font-medium md:hidden">IT Inventory</span>
        </header>
        <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  )
}
