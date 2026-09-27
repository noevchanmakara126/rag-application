"use client"

import { useEffect, useRef, useState } from "react"
import { ArrowUp, Loader2, Search, Square } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"

import type { Source } from "@/lib/api"
import { type ChatMessage, MessageBubble } from "@/components/chat/message-bubble"
import { EmptyState } from "@/components/chat/empty-state"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { readSSE } from "@/lib/stream"
import { cn } from "@/lib/utils"

const TOP_K_CHOICES = [3, 5, 8]

export function ChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState("")
  const [streamingText, setStreamingText] = useState("")
  const [sources, setSources] = useState<Source[]>([])
  const [phase, setPhase] = useState<"idle" | "retrieving" | "generating">("idle")
  const [topK, setTopK] = useState(5)

  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  // Only auto-scroll while the user is already at the bottom, so reading back
  // through an answer is not yanked away by the next token.
  const pinnedToBottom = useRef(true)

  const busy = phase !== "idle"

  useEffect(() => {
    if (pinnedToBottom.current) {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
    }
  }, [messages, streamingText])

  function handleScroll() {
    const el = scrollRef.current
    if (!el) return
    pinnedToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48
  }

  function stop() {
    abortRef.current?.abort()
  }

  async function send() {
    const content = draft.trim()
    if (!content || busy) return

    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", content }
    const history = messages
      .filter((m) => !m.error)
      .map((m) => ({ role: m.role, content: m.content }))

    setMessages((prev) => [...prev, userMessage])
    setDraft("")
    setStreamingText("")
    setSources([])
    setPhase("retrieving")
    pinnedToBottom.current = true

    const controller = new AbortController()
    abortRef.current = controller

    let text = ""
    let received: Source[] = []
    let failure: string | null = null

    try {
      const response = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, history, top_k: topK }),
        signal: controller.signal,
      })

      if (!response.body) throw new Error("The server returned no stream.")

      for await (const event of readSSE(response.body)) {
        if ("sources" in event) {
          received = event.sources
          setSources(received)
          setPhase("generating")
        } else if ("delta" in event) {
          text += event.delta
          setStreamingText(text)
        } else if ("error" in event) {
          failure = event.error
          break
        }
      }
    } catch (error) {
      // An abort is the user pressing Stop — keep whatever already streamed.
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        failure = "Could not reach the server. Is it running?"
      }
    }

    setMessages((prev) => [
      ...prev,
      failure !== null && !text
        ? { id: crypto.randomUUID(), role: "assistant", content: "", error: failure }
        : {
            id: crypto.randomUUID(),
            role: "assistant",
            content: text,
            sources: received,
            error: failure ?? undefined,
          },
    ])
    setStreamingText("")
    setSources([])
    setPhase("idle")
    abortRef.current = null
  }

  return (
    <div className="glass-strong flex h-[calc(100dvh-10rem)] min-h-[28rem] flex-col overflow-hidden rounded-3xl">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 space-y-4 overflow-y-auto scrollbar-slim px-4 py-5 sm:px-6"
      >
        {messages.length === 0 && !busy ? (
          <EmptyState onPick={setDraft} />
        ) : (
          <AnimatePresence initial={false}>
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
          </AnimatePresence>
        )}

        {phase === "retrieving" && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 text-xs text-muted-foreground"
          >
            <Search className="size-3.5 animate-pulse-soft" />
            Searching the knowledge base…
          </motion.div>
        )}

        {phase === "generating" && (
          <MessageBubble
            streaming
            message={{
              id: "streaming",
              role: "assistant",
              content: streamingText,
              sources,
            }}
          />
        )}
      </div>

      <div className="border-t border-white/50 px-3 py-3 sm:px-4">
        <div className="flex items-end gap-2">
          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              // Enter sends; Shift+Enter is a newline.
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault()
                void send()
              }
            }}
            placeholder="Ask something about your documents…"
            rows={1}
            className="max-h-40 min-h-11 resize-none border-0 bg-white/60 shadow-none focus-visible:ring-1"
          />
          {busy ? (
            <Button
              type="button"
              size="icon"
              variant="secondary"
              onClick={stop}
              aria-label="Stop generating"
              className="size-11 shrink-0"
            >
              <Square className="size-4" />
            </Button>
          ) : (
            <Button
              type="button"
              size="icon"
              onClick={() => void send()}
              disabled={!draft.trim()}
              aria-label="Send"
              className="size-11 shrink-0"
            >
              <ArrowUp className="size-4" />
            </Button>
          )}
        </div>

        <div className="mt-2 flex items-center gap-2 px-1">
          <span className="text-[11px] text-muted-foreground">Passages retrieved</span>
          {TOP_K_CHOICES.map((choice) => (
            <button
              key={choice}
              type="button"
              onClick={() => setTopK(choice)}
              aria-pressed={topK === choice}
              className={cn(
                "rounded-md px-1.5 py-0.5 text-[11px] font-medium transition",
                topK === choice
                  ? "bg-brand-100 text-brand-700"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {choice}
            </button>
          ))}
          {busy && <Loader2 className="ml-auto size-3.5 animate-spin text-muted-foreground" />}
        </div>
      </div>
    </div>
  )
}
