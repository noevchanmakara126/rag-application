import "server-only"

/**
 * Server-only address of the FastAPI backend.
 *
 * Deliberately not `NEXT_PUBLIC_`: the browser talks to Next route handlers,
 * and Next talks to the backend. In Docker this is `http://backend:8000`, a
 * name that does not resolve from the browser at all.
 */
export const API_URL = process.env.BACKEND_INTERNAL_URL ?? "http://localhost:8000"

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = "ApiError"
  }
}

export class ApiUnreachableError extends Error {
  constructor(cause?: unknown) {
    super(`Could not reach the API at ${API_URL}. Is the backend running?`)
    this.name = "ApiUnreachableError"
    this.cause = cause
  }
}

type RequestOptions = Omit<RequestInit, "body"> & { body?: unknown }

/**
 * Typed fetch against the backend.
 *
 * Never cached: every read here is either a document list that a background job
 * is still mutating, or a retrieval result.
 */
export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, headers, ...rest } = options
  const isFormData = body instanceof FormData

  let response: Response
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...rest,
      cache: "no-store",
      headers: {
        ...(body !== undefined && !isFormData ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : isFormData ? body : JSON.stringify(body),
    })
  } catch (cause) {
    throw new ApiUnreachableError(cause)
  }

  if (!response.ok) {
    throw new ApiError(response.status, await readErrorDetail(response))
  }

  // 204 No Content has no body to parse — DELETE returns one.
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

/** FastAPI reports errors as `detail`: a string, or a list of validation issues. */
async function readErrorDetail(response: Response): Promise<string> {
  try {
    const payload = await response.json()
    const detail = payload?.detail
    if (typeof detail === "string") return detail
    if (Array.isArray(detail)) {
      return detail
        .map((issue) => {
          const field = Array.isArray(issue?.loc) ? issue.loc.slice(1).join(".") : ""
          return field ? `${field}: ${issue.msg}` : issue.msg
        })
        .join("; ")
    }
    return `Request failed with ${response.status}`
  } catch {
    return `Request failed with ${response.status}`
  }
}

// ── Types mirroring the backend schemas ──────────────────────────────────

export type DocumentStatus = "pending" | "embedding" | "ready" | "failed"
export type SourceType = "upload" | "paste" | "url"

export type DocumentSummary = {
  id: string
  title: string
  source_type: SourceType
  source_ref: string | null
  status: DocumentStatus
  error: string | null
  char_count: number
  chunk_count: number
  created_at: string
}

export type ChunkPreview = {
  id: string
  ordinal: number
  content: string
  char_count: number
}

export type DocumentDetail = DocumentSummary & { chunks: ChunkPreview[] }

export type Source = {
  id: string
  document_id: string
  document_title: string
  ordinal: number
  content: string
  score: number
}

/** The generation models this deployment can answer with. */
export type ChatModels = { models: string[]; default: string }

export type Health = {
  status: string
  environment: string
  database: { reachable: boolean }
  llm: { url: string; model: string; reachable: boolean }
  embedding: {
    url: string
    model: string
    reachable: boolean
    dim: number | null
    configured_dim: number
    dim_matches: boolean | null
  }
}

// ── Endpoints ────────────────────────────────────────────────────────────

export const getHealth = () => apiFetch<Health>("/health")

export const getChatModels = () => apiFetch<ChatModels>("/api/v1/chat/models")

export const listDocuments = () => apiFetch<DocumentSummary[]>("/api/v1/documents")

export const getDocument = (id: string) => apiFetch<DocumentDetail>(`/api/v1/documents/${id}`)

export const deleteDocument = (id: string) =>
  apiFetch<void>(`/api/v1/documents/${id}`, { method: "DELETE" })

export const ingestText = (title: string, content: string) =>
  apiFetch<DocumentSummary>("/api/v1/documents/text", {
    method: "POST",
    body: { title, content },
  })

export const ingestUrl = (url: string) =>
  apiFetch<DocumentSummary>("/api/v1/documents/url", { method: "POST", body: { url } })

export const searchChunks = (query: string, topK?: number) =>
  apiFetch<{ query: string; sources: Source[] }>("/api/v1/search", {
    method: "POST",
    body: { query, top_k: topK },
  })
