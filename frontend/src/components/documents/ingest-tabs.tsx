"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { ClipboardType, Link2, Loader2, UploadCloud } from "lucide-react"
import { motion } from "motion/react"
import { toast } from "sonner"

import { ingestTextAction, ingestUrlAction } from "@/actions/documents"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

const ACCEPT = ".pdf,.txt,.md,.markdown,.text"

export function IngestTabs() {
  return (
    <Tabs defaultValue="upload" className="glass rounded-3xl p-4 sm:p-5">
      <TabsList className="w-full">
        <TabsTrigger value="upload" className="flex-1">
          <UploadCloud className="size-4" />
          Upload
        </TabsTrigger>
        <TabsTrigger value="paste" className="flex-1">
          <ClipboardType className="size-4" />
          Paste
        </TabsTrigger>
        <TabsTrigger value="url" className="flex-1">
          <Link2 className="size-4" />
          URL
        </TabsTrigger>
      </TabsList>

      <div className="pt-4">
        <TabsContent value="upload">
          <Panel>
            <UploadForm />
          </Panel>
        </TabsContent>
        <TabsContent value="paste">
          <Panel>
            <PasteForm />
          </Panel>
        </TabsContent>
        <TabsContent value="url">
          <Panel>
            <UrlForm />
          </Panel>
        </TabsContent>
      </div>
    </Tabs>
  )
}

/** Mount transition for a tab panel.
 *
 * A plain motion.div, not AnimatePresence: each panel has exactly one child and
 * Radix unmounts the whole TabsContent on switch, so there is no exit to wait
 * for -- and AnimatePresence around a keyless child never resolves its enter,
 * leaving the panel stuck at the initial opacity.
 */
function Panel({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
    >
      {children}
    </motion.div>
  )
}

function UploadForm() {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)

  async function upload(file: File) {
    setBusy(true)
    const body = new FormData()
    body.append("file", file)

    try {
      // Straight to a Route Handler: a PDF would exceed the Server Action
      // body-size cap, and multipart is cheapest forwarded untouched.
      const response = await fetch("/api/documents/upload", { method: "POST", body })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        toast.error(payload?.detail ?? "Upload failed.")
        return
      }
      toast.success(`Indexing "${file.name}"…`)
      router.refresh()
    } catch {
      toast.error("Could not reach the server.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault()
        setDragging(false)
        const file = event.dataTransfer.files?.[0]
        if (file) void upload(file)
      }}
      className={cn(
        "flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition",
        dragging ? "border-brand-400 bg-brand-50/70" : "border-border bg-white/40",
      )}
    >
      {busy ? (
        <Loader2 className="size-7 animate-spin text-brand-500" />
      ) : (
        <UploadCloud className="size-7 text-brand-500" />
      )}
      <div className="space-y-1">
        <p className="text-sm font-medium">Drop a PDF, TXT or Markdown file</p>
        <p className="text-xs text-muted-foreground">
          Text is extracted, chunked and embedded in the background.
        </p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void upload(file)
          event.target.value = ""
        }}
      />
      <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
        Choose a file
      </Button>
    </div>
  )
}

function PasteForm() {
  const [title, setTitle] = useState("")
  const [content, setContent] = useState("")
  const [pending, startTransition] = useTransition()

  function submit() {
    startTransition(async () => {
      const result = await ingestTextAction(title, content)
      if (result.ok) {
        toast.success("Indexing pasted text…")
        setTitle("")
        setContent("")
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="paste-title">Title</Label>
        <Input
          id="paste-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Meeting notes, 27 Sep"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="paste-content">Text</Label>
        <Textarea
          id="paste-content"
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder="Paste anything you want to be able to ask about…"
          rows={8}
          className="resize-y scrollbar-slim"
        />
        <p className="text-[11px] text-muted-foreground">{content.length.toLocaleString()} characters</p>
      </div>
      <Button type="button" onClick={submit} disabled={pending || !title.trim() || !content.trim()}>
        {pending && <Loader2 className="size-4 animate-spin" />}
        Add to knowledge base
      </Button>
    </div>
  )
}

function UrlForm() {
  const [url, setUrl] = useState("")
  const [pending, startTransition] = useTransition()

  function submit() {
    startTransition(async () => {
      const result = await ingestUrlAction(url)
      if (result.ok) {
        toast.success("Scraped and indexing…")
        setUrl("")
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="ingest-url">Page URL</Label>
        <Input
          id="ingest-url"
          type="url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") submit()
          }}
          placeholder="https://example.com/article"
        />
        <p className="text-[11px] text-muted-foreground">
          Main article text is extracted; navigation and boilerplate are dropped.
        </p>
      </div>
      <Button type="button" onClick={submit} disabled={pending || !url.trim()}>
        {pending && <Loader2 className="size-4 animate-spin" />}
        Fetch and index
      </Button>
    </div>
  )
}
