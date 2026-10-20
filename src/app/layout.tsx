import type { Metadata } from "next"
import { Figtree, JetBrains_Mono, Montserrat } from "next/font/google"
import "./globals.css"

import { TooltipProvider } from "@/components/ui/tooltip"

// Font brand kit Veltics (keputusan user 20/10/2026): Figtree untuk seluruh antarmuka, Montserrat
// hanya untuk judul halaman (utilitas font-display), JetBrains Mono untuk kode resmi yang dicocokkan
// karakter per karakter (nomor aju, NPWP, kode HS, SKU). shadcn/ui membaca --font-sans.
const figtree = Figtree({
  variable: "--font-sans",
  subsets: ["latin"],
})

const montserrat = Montserrat({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["700"],
})

const jetbrainsMono = JetBrains_Mono({
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
    <html
      lang="id"
      className={`${figtree.variable} ${montserrat.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  )
}
