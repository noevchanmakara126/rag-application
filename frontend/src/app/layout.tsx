import type { Metadata } from "next"
import { Poppins } from "next/font/google"

import { Backdrop } from "@/components/layout/backdrop"
import { SiteHeader } from "@/components/layout/site-header"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"

import "./globals.css"

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-poppins",
  display: "swap",
})

export const metadata: Metadata = {
  title: "RAG Playground",
  description:
    "Retrieval-augmented generation over pgvector, with a self-hosted LLM and embedding model.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={poppins.variable}>
      <body className="min-h-dvh antialiased">
        <TooltipProvider delayDuration={200}>
          <Backdrop />
          <SiteHeader />
          <main className="mx-auto max-w-5xl px-4 pb-16 sm:px-6">{children}</main>
          <Toaster position="top-center" />
        </TooltipProvider>
      </body>
    </html>
  )
}
