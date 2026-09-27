import type { Source } from "@/lib/api"

export type StreamEvent =
  | { sources: Source[] }
  | { delta: string }
  | { done: true }
  | { error: string }

/**
 * Parse an SSE body into decoded events.
 *
 * Frames are split on the blank-line delimiter rather than per chunk: a
 * multi-byte grapheme can straddle two network chunks, and
 * `TextDecoder({stream: true})` plus a boundary-aware buffer is what keeps it
 * from being cut in half.
 */
export async function* readSSE(body: ReadableStream<Uint8Array>): AsyncGenerator<StreamEvent> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      let boundary = buffer.indexOf("\n\n")
      while (boundary !== -1) {
        const event = parseFrame(buffer.slice(0, boundary))
        buffer = buffer.slice(boundary + 2)
        if (event) yield event
        boundary = buffer.indexOf("\n\n")
      }
    }

    const tail = parseFrame(buffer)
    if (tail) yield tail
  } finally {
    reader.releaseLock()
  }
}

function parseFrame(frame: string): StreamEvent | null {
  const line = frame.split("\n").find((l) => l.startsWith("data:"))
  if (!line) return null
  try {
    return JSON.parse(line.slice(5).trim()) as StreamEvent
  } catch {
    return null
  }
}
