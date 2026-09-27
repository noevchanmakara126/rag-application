import { revalidatePath } from "next/cache"

import { API_URL } from "@/lib/api"

/**
 * Multipart upload passthrough.
 *
 * A Route Handler rather than a Server Action on purpose: Server Actions are
 * capped by `serverActions.bodySizeLimit`, and a PDF routinely exceeds any
 * sensible value for it. Here the multipart body is forwarded untouched.
 */
export async function POST(request: Request) {
  const formData = await request.formData()

  let upstream: Response
  try {
    upstream = await fetch(`${API_URL}/api/v1/documents/upload`, {
      method: "POST",
      body: formData,
    })
  } catch {
    return Response.json(
      { detail: `Could not reach the API at ${API_URL}. Is the backend running?` },
      { status: 502 },
    )
  }

  const payload = await upstream.json().catch(() => ({ detail: "Upload failed." }))
  if (upstream.ok) revalidatePath("/documents")
  return Response.json(payload, { status: upstream.status })
}
