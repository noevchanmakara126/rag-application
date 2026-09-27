"use client"

import { useState } from "react"
import { ChevronDown, Quote } from "lucide-react"
import { motion } from "motion/react"

import type { Source } from "@/lib/api"
import { CitationChip, SourceCard } from "@/components/chat/source-card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { parseCitations } from "@/lib/citations"
import { cn } from "@/lib/utils"

export type ChatMessage = {
  id: string
  role: "user" | "assistant"
  content: string
  sources?: Source[]
  error?: string
}

export function MessageBubble({
  message,
  streaming = false,
}: {
  message: ChatMessage
  streaming?: boolean
}) {
  const [open, setOpen] = useState(false)
  const isUser = message.role === "user"
  const sources = message.sources ?? []

  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}
    >
      <div className={cn("max-w-[85%] space-y-2", isUser && "flex flex-col items-end")}>
        <div
          className={cn(
            "break-anywhere rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
            isUser
              ? "bg-primary text-primary-foreground shadow-sm shadow-brand-700/20"
              : "glass text-foreground",
            message.error && "border-destructive/40 bg-destructive/10 text-destructive",
          )}
        >
          {message.error ? (
            message.error
          ) : isUser ? (
            message.content
          ) : (
            <AnswerText text={message.content} sources={sources} />
          )}
          {streaming && (
            <span className="ml-1 inline-block h-3.5 w-[2px] translate-y-0.5 animate-pulse-soft bg-current align-middle" />
          )}
        </div>

        {!isUser && sources.length > 0 && (
          <Collapsible open={open} onOpenChange={setOpen}>
            <CollapsibleTrigger className="flex items-center gap-1.5 rounded-lg px-1 py-0.5 text-xs font-medium text-muted-foreground transition hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
              <Quote className="size-3" />
              {sources.length} {sources.length === 1 ? "source" : "sources"}
              <ChevronDown
                className={cn("size-3 transition-transform", open && "rotate-180")}
              />
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 space-y-2">
              {sources.map((source, i) => (
                <SourceCard key={source.id} source={source} index={i + 1} />
              ))}
            </CollapsibleContent>
          </Collapsible>
        )}
      </div>
    </motion.div>
  )
}

/** Answer prose with `[n]` markers swapped for clickable chips. */
function AnswerText({ text, sources }: { text: string; sources: Source[] }) {
  if (sources.length === 0) return <>{text}</>

  return (
    <>
      {parseCitations(text, sources.length).map((segment, i) => {
        if (segment.kind === "text") return <span key={i}>{segment.text}</span>
        if (segment.kind === "code") {
          return (
            <code
              key={i}
              className="rounded-md bg-brand-100/70 px-1 py-0.5 font-mono text-[0.85em] text-brand-800"
            >
              {segment.text}
            </code>
          )
        }
        return <CitationChip key={i} index={segment.index} source={sources[segment.index - 1]} />
      })}
    </>
  )
}
