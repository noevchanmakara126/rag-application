import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Collision-free-enough id for a chat message.
 *
 * `crypto.randomUUID` is gated on a secure context, so it is simply absent when
 * the app is served over plain HTTP from anything other than localhost — which
 * is how a fresh deployment is usually reached first, by IP and without TLS
 * yet. Calling it there throws a TypeError out of the click handler and the
 * Send button does nothing at all. These ids are React keys for a
 * single client session, never persisted, so a counter is entirely sufficient.
 */
let messageSeq = 0
export function messageId() {
  messageSeq += 1
  return `m${messageSeq}`
}
