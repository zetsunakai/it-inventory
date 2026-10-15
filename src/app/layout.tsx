import type { Metadata } from "next"
import { IBM_Plex_Mono, Plus_Jakarta_Sans } from "next/font/google"
import "./globals.css"

import { TooltipProvider } from "@/components/ui/tooltip"

// Plus Jakarta Sans mengikuti hmx-002 (backlog RU-20); IBM Plex Mono untuk kode resmi yang dicocokkan
// karakter per karakter (nomor aju, NPWP, kode HS, SKU). shadcn/ui membaca --font-sans.
const jakartaSans = Plus_Jakarta_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
})

const plexMono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
})

export const metadata: Metadata = {
  title: "IT Inventory",
  description: "IT Inventory Kawasan Berikat",
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="id" className={`${jakartaSans.variable} ${plexMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  )
}
