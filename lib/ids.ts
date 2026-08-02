/**
 * Identifier generation.
 *
 * Plant ids used to be `Date.now().toString()`. Two plants added within the
 * same millisecond got the same id, and the second one was silently rejected
 * by IndexedDB. Timestamps would also collide across devices once collections
 * start syncing, so ids are UUIDs now.
 */

/**
 * Generate a random identifier for a new record.
 *
 * `crypto.randomUUID` exists only in secure contexts. Opening the dev server
 * from a phone over the local network (`npm run dev -- -H 0.0.0.0`, the flow
 * documented in CLAUDE.md) is plain http, so there it is undefined and calling
 * it would throw on every attempt to add a plant. `crypto.getRandomValues`
 * carries no such restriction, so the fallback assembles the same v4 UUID by
 * hand.
 */
export function newId(): string {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)

  bytes[6] = (bytes[6] & 0x0f) | 0x40 // версия 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80 // вариант RFC 4122

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'))

  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10, 16).join(''),
  ].join('-')
}
