"use client"

import { FileText } from "lucide-react"

import type { Source } from "@/lib/api"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

/** Shared body so an inline chip and a listed card show the same detail. */
function SourceDetail({ source, index }: { source: Source; index: number }) {
  return (
    <div className="space-y-2">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-md bg-primary text-[11px] font-semibold text-primary-foreground">
          {index}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{source.document_title}</p>
          <p className="text-xs text-muted-foreground">
            Section {source.ordinal + 1} · {Math.round(source.score * 100)}% match
          </p>
        </div>
      </div>
      <p className="max-h-56 overflow-y-auto scrollbar-slim break-anywhere rounded-lg bg-muted/70 p-2.5 text-xs leading-relaxed text-muted-foreground">
        {source.content}
      </p>
    </div>
  )
}

/** The `[n]` marker rendered inline in an answer. */
export function CitationChip({ source, index }: { source: Source; index: number }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Source ${index}: ${source.document_title}`}
          className="mx-px inline-grid size-4.5 translate-y-[-1px] place-items-center rounded-[5px] bg-brand-100 align-middle text-[10px] font-semibold text-brand-700 transition hover:bg-brand-200 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {index}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        <SourceDetail source={source} index={index} />
      </PopoverContent>
    </Popover>
  )
}

/** A source in the collapsible list under an answer. */
export function SourceCard({
  source,
  index,
  className,
}: {
  source: Source
  index: number
  className?: string
}) {
  return (
    <div className={cn("rounded-xl border bg-card/70 p-3", className)}>
      <SourceDetail source={source} index={index} />
    </div>
  )
}

/** Compact result row for the retrieval-only search panel. */
export function SearchResultRow({ source, index }: { source: Source; index: number }) {
  return (
    <div className="rounded-xl border bg-card/70 p-3">
      <div className="mb-1.5 flex items-center gap-2">
        <FileText className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate text-sm font-medium">{source.document_title}</span>
        <span className="ml-auto shrink-0 rounded-md bg-brand-100 px-1.5 py-0.5 text-[11px] font-semibold text-brand-700">
          {Math.round(source.score * 100)}%
        </span>
      </div>
      <p className="break-anywhere text-xs leading-relaxed text-muted-foreground">
        {source.content.length > 320 ? `${source.content.slice(0, 320).trimEnd()}…` : source.content}
      </p>
      <p className="mt-1.5 text-[11px] text-muted-foreground/70">
        Result {index} · section {source.ordinal + 1}
      </p>
    </div>
  )
}
