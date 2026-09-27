import Link from "next/link"
import { FileText, Sparkles } from "lucide-react"

import { Button } from "@/components/ui/button"

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-white/40 glass-subtle">
      <div className="mx-auto flex h-16 max-w-5xl items-center gap-3 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm shadow-brand-700/25">
            <Sparkles className="size-4.5" />
          </span>
          <span className="flex flex-col leading-none">
            <span className="text-base font-semibold tracking-tight">RAG Playground</span>
            <span className="text-[11px] text-muted-foreground">pgvector · self-hosted</span>
          </span>
        </Link>

        <nav className="ml-auto flex items-center gap-1">
          <Button asChild variant="ghost" size="sm">
            <Link href="/">Ask</Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/documents">
              <FileText className="size-4" />
              Documents
            </Link>
          </Button>
        </nav>
      </div>
    </header>
  )
}
