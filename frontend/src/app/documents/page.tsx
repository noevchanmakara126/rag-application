import { AlertTriangle } from "lucide-react"

import { DocumentList } from "@/components/documents/document-list"
import { IngestTabs } from "@/components/documents/ingest-tabs"
import { SearchPanel } from "@/components/documents/search-panel"
import { type DocumentSummary, listDocuments } from "@/lib/api"

export const metadata = { title: "Documents · RAG Playground" }

export default async function DocumentsPage() {
  let documents: DocumentSummary[] = []
  let loadError: string | null = null

  try {
    documents = await listDocuments()
  } catch (error) {
    // A dead backend should still render the page; the ingest forms report
    // their own failures, and this explains the empty list.
    loadError = error instanceof Error ? error.message : "Could not load documents."
  }

  return (
    <div className="space-y-5 pt-6">
      <header className="space-y-1 px-1">
        <h1 className="text-xl font-semibold tracking-tight">Knowledge base</h1>
        <p className="text-sm text-muted-foreground">
          Everything here is chunked, embedded and stored in pgvector.
        </p>
      </header>

      <IngestTabs />
      <SearchPanel />

      {loadError && (
        <div className="flex items-start gap-2 rounded-2xl border border-destructive/30 bg-destructive/8 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          {loadError}
        </div>
      )}

      <DocumentList documents={documents} />
    </div>
  )
}
