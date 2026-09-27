"use client"

import { useEffect, useTransition } from "react"
import { useRouter } from "next/navigation"
import { AlertCircle, ClipboardType, Link2, Loader2, Trash2, UploadCloud } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"
import { toast } from "sonner"

import { deleteDocumentAction } from "@/actions/documents"
import type { DocumentStatus, DocumentSummary, SourceType } from "@/lib/api"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

const POLL_MS = 1500

const STATUS_LABEL: Record<DocumentStatus, string> = {
  pending: "Queued",
  embedding: "Embedding",
  ready: "Ready",
  failed: "Failed",
}

const SOURCE_ICON: Record<SourceType, typeof UploadCloud> = {
  upload: UploadCloud,
  paste: ClipboardType,
  url: Link2,
}

export function DocumentList({ documents }: { documents: DocumentSummary[] }) {
  const router = useRouter()
  const settling = documents.some((d) => d.status === "pending" || d.status === "embedding")

  // Embedding happens in a backend BackgroundTask, so the server component's
  // data goes stale on its own. Poll only while something is still in flight.
  useEffect(() => {
    if (!settling) return
    const timer = setInterval(() => router.refresh(), POLL_MS)
    return () => clearInterval(timer)
  }, [settling, router])

  if (documents.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed bg-white/40 px-6 py-12 text-center">
        <p className="text-sm font-medium">No documents yet</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Add one above and it becomes queryable as soon as it finishes embedding.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <AnimatePresence initial={false}>
        {documents.map((document) => (
          <DocumentRow key={document.id} document={document} />
        ))}
      </AnimatePresence>
    </div>
  )
}

function DocumentRow({ document }: { document: DocumentSummary }) {
  const [pending, startTransition] = useTransition()
  const Icon = SOURCE_ICON[document.source_type]
  const busy = document.status === "pending" || document.status === "embedding"

  function remove() {
    startTransition(async () => {
      const result = await deleteDocumentAction(document.id)
      if (!result.ok) toast.error(result.error)
    })
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginBottom: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="glass-subtle flex items-center gap-3 rounded-2xl px-3.5 py-3"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-100 text-brand-600">
        <Icon className="size-4" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{document.title}</p>
        <p className="truncate text-xs text-muted-foreground">
          {document.char_count.toLocaleString()} chars
          {document.chunk_count > 0 && ` · ${document.chunk_count} chunks`}
          {document.source_ref && document.source_type === "url" && ` · ${document.source_ref}`}
        </p>
      </div>

      <StatusBadge status={document.status} error={document.error} busy={busy} />

      <Button
        type="button"
        size="icon"
        variant="ghost"
        onClick={remove}
        disabled={pending}
        aria-label={`Delete ${document.title}`}
        className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
      </Button>
    </motion.div>
  )
}

function StatusBadge({
  status,
  error,
  busy,
}: {
  status: DocumentStatus
  error: string | null
  busy: boolean
}) {
  const badge = (
    <Badge
      variant="outline"
      className={cn(
        "shrink-0 gap-1 border-transparent text-[11px]",
        status === "ready" && "bg-brand-100 text-brand-700",
        status === "failed" && "bg-destructive/12 text-destructive",
        busy && "bg-muted text-muted-foreground",
      )}
    >
      {busy && <Loader2 className="size-3 animate-spin" />}
      {status === "failed" && <AlertCircle className="size-3" />}
      {STATUS_LABEL[status]}
    </Badge>
  )

  // The failure reason is the only thing worth a tooltip here — it is what tells
  // you whether the embedding server is down or the PDF was a scan.
  if (status !== "failed" || !error) return badge

  return (
    <Tooltip>
      <TooltipTrigger asChild>{badge}</TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs">{error}</TooltipContent>
    </Tooltip>
  )
}
