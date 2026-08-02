/**
 * Подключение к Neon на стороне сервера.
 *
 * Отдельно от `lib/db`, где живёт IndexedDB: то браузерное хранилище
 * пользователя, это база опубликованных коллекций. Общего у них только слово
 * «база», и путать их не стоит.
 */

import { neon } from '@neondatabase/serverless'

let cached: ReturnType<typeof neon> | null = null

/**
 * Драйвер ходит по HTTP и соединения не держит, так что кешировать особо нечего
 * — но и разбирать строку подключения на каждый запрос незачем.
 */
export function sql() {
  if (cached) return cached

  const url = process.env.DATABASE_URL
  if (!url) throw new Error('DATABASE_URL не задана')

  cached = neon(url)
  return cached
}

/**
 * Хеш для того, что хранить в открытом виде не нужно: токенов отзыва и
 * адресов клиентов.
 *
 * `crypto.subtle` на сервере Vercel есть всегда — это не браузер по http, где
 * с ним пришлось считаться в `lib/images.ts`.
 */
export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}
