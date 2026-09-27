"use client"

import Link from "next/link"
import { FileText, MessageSquareQuote } from "lucide-react"
import { motion } from "motion/react"

const SUGGESTIONS = [
  "Summarise the main argument in a few bullets.",
  "What does the source say about limitations?",
  "List every number or date mentioned.",
]

export function EmptyState({ onPick }: { onPick: (prompt: string) => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="flex h-full flex-col items-center justify-center gap-5 py-10 text-center"
    >
      <span className="grid size-14 place-items-center rounded-2xl bg-brand-100 text-brand-600">
        <MessageSquareQuote className="size-7" />
      </span>

      <div className="space-y-1.5">
        <h1 className="text-xl font-semibold tracking-tight">Ask your documents</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          Answers are built only from text retrieved out of pgvector, and every claim carries a
          citation you can open.
        </p>
      </div>

      <div className="flex w-full max-w-md flex-col gap-2">
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => onPick(suggestion)}
            className="rounded-xl border bg-card/60 px-3.5 py-2.5 text-left text-sm text-muted-foreground transition hover:border-brand-300 hover:bg-card hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {suggestion}
          </button>
        ))}
      </div>

      <Link
        href="/documents"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-700 underline-offset-4 hover:underline"
      >
        <FileText className="size-3.5" />
        Nothing indexed yet? Add a document
      </Link>
    </motion.div>
  )
}
