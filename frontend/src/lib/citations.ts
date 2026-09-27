/** A piece of an answer: prose, an inline code span, or a resolved `[n]` marker. */
export type AnswerSegment =
  | { kind: "text"; text: string }
  | { kind: "code"; text: string }
  | { kind: "citation"; index: number }

// One pass over both tokens, so a marker inside a code span stays literal.
// Group 1 = citation number, group 2 = inline code contents.
const TOKEN = /\[(\d{1,2})\]|`([^`\n]+)`/g

/**
 * Split answer text into prose, inline code and citation markers.
 *
 * `sourceCount` bounds which markers are honoured: a model that invents `[9]`
 * against five sources gets that bracket rendered as literal text rather than a
 * chip pointing at nothing.
 *
 * Backticks are handled because models reliably emit them for operators and
 * identifiers, and raw backticks in the bubble read as a rendering bug. This is
 * deliberately not a markdown parser -- just the one token worth the cost.
 */
export function parseCitations(text: string, sourceCount: number): AnswerSegment[] {
  const segments: AnswerSegment[] = []
  let cursor = 0

  const push = (end: number) => {
    if (end > cursor) segments.push({ kind: "text", text: text.slice(cursor, end) })
  }

  for (const match of text.matchAll(TOKEN)) {
    const [raw, citation, code] = match
    const start = match.index

    if (code !== undefined) {
      push(start)
      segments.push({ kind: "code", text: code })
      cursor = start + raw.length
      continue
    }

    const index = Number(citation)
    if (index < 1 || index > sourceCount) continue

    push(start)
    segments.push({ kind: "citation", index })
    cursor = start + raw.length
  }

  push(text.length)
  return segments
}
