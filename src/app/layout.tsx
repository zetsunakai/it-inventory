import type { Metadata } from "next"
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google"
import "./globals.css"

import { TooltipProvider } from "@/components/ui/tooltip"

// IBM Plex: karakter dokumen/instrumen yang cocok untuk kepabeanan, angka tabular, dan Plex Mono
// untuk kode resmi (nomor aju, NPWP, kode HS). shadcn/ui membaca --font-sans (lihat globals.css).
const plexSans = IBM_Plex_Sans({
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
    <html lang="id" className={`${plexSans.variable} ${plexMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  )
}
