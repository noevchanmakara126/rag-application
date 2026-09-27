"use server"

import { ApiError, ApiUnreachableError, type Source, searchChunks } from "@/lib/api"

export type SearchActionResult =
  | { ok: true; sources: Source[] }
  | { ok: false; error: string }

export async function searchAction(query: string, topK?: number): Promise<SearchActionResult> {
  if (!query.trim()) return { ok: false, error: "Enter a query." }
  try {
    const { sources } = await searchChunks(query.trim(), topK)
    return { ok: true, sources }
  } catch (error) {
    if (error instanceof ApiError || error instanceof ApiUnreachableError) {
      return { ok: false, error: error.message }
    }
    return { ok: false, error: "Search failed. Please try again." }
  }
}
