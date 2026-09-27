"use server"

import { revalidatePath } from "next/cache"

import { ApiError, ApiUnreachableError, deleteDocument, ingestText, ingestUrl } from "@/lib/api"

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string }

/** Turn the api layer's thrown errors into a value the form can render. */
async function run(fn: () => Promise<{ id: string } | void>): Promise<ActionResult> {
  try {
    const result = await fn()
    revalidatePath("/documents")
    return { ok: true, id: result?.id }
  } catch (error) {
    if (error instanceof ApiError || error instanceof ApiUnreachableError) {
      return { ok: false, error: error.message }
    }
    return { ok: false, error: "Something went wrong. Please try again." }
  }
}

export async function ingestTextAction(title: string, content: string): Promise<ActionResult> {
  if (!title.trim()) return { ok: false, error: "Give the document a title." }
  if (!content.trim()) return { ok: false, error: "There is no text to ingest." }
  return run(() => ingestText(title.trim(), content))
}

export async function ingestUrlAction(url: string): Promise<ActionResult> {
  if (!url.trim()) return { ok: false, error: "Enter a URL." }
  return run(() => ingestUrl(url.trim()))
}

export async function deleteDocumentAction(id: string): Promise<ActionResult> {
  return run(() => deleteDocument(id))
}
