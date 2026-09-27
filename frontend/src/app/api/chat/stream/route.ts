import { API_URL } from "@/lib/api"

/**
 * SSE passthrough to the backend's chat stream.
 *
 * The browser cannot reach the backend directly (in Docker its hostname does
 * not resolve outside the network), so Next relays the stream. Forwarding
 * `request.signal` is what makes the Stop button actually abort generation
 * upstream rather than just stopping the client from reading.
 */
export async function POST(request: Request) {
  const body = await request.text()

  let upstream: Response
  try {
    upstream = await fetch(`${API_URL}/api/v1/chat/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: request.signal,
      // Required by undici when a body is streamed; not in the DOM lib types.
      // @ts-expect-error -- Node fetch extension
      duplex: "half",
    })
  } catch {
    return sse({ error: `Could not reach the API at ${API_URL}. Is the backend running?` })
  }

  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => "")
    return sse({ error: detail.slice(0, 300) || `The API returned ${upstream.status}.` })
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}

/** Deliver a transport-level failure as a stream frame the client already handles. */
function sse(event: Record<string, unknown>) {
  return new Response(`data: ${JSON.stringify(event)}\n\n`, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform" },
  })
}
