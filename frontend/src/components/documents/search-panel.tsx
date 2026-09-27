"use client"

import { useState, useTransition } from "react"
import { Loader2, Search } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"

import { searchAction } from "@/actions/search"
import type { Source } from "@/lib/api"
import { SearchResultRow } from "@/components/chat/source-card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

/**
 * Retrieval without generation.
 *
 * Worth its own panel: when an answer looks wrong this is what tells you
 * whether the retrieval or the model is at fault.
 */
export function SearchPanel() {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<Source[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function submit() {
    if (!query.trim()) return
    startTransition(async () => {
      const result = await searchAction(query)
      if (result.ok) {
        setResults(result.sources)
        setError(null)
      } else {
        setResults(null)
        setError(result.error)
      }
    })
  }

  return (
    <div className="glass rounded-3xl p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") submit()
          }}
          placeholder="Test retrieval — no model involved"
          className="bg-white/60"
        />
        <Button type="button" onClick={submit} disabled={pending || !query.trim()} size="icon" aria-label="Search">
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
        </Button>
      </div>

      {error && <p className="mt-3 text-xs text-destructive">{error}</p>}

      <AnimatePresence mode="wait">
        {results !== null && (
          <motion.div
            key={results.map((r) => r.id).join()}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="mt-3 space-y-2"
          >
            {results.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Nothing cleared the similarity threshold. Either the corpus does not cover this, or
                MIN_SCORE is too high.
              </p>
            ) : (
              results.map((source, i) => (
                <SearchResultRow key={source.id} source={source} index={i + 1} />
              ))
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
