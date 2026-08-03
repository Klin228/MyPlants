/**
 * Уборка файлов из блоб-хранилища.
 *
 * Одно правило на все три случая уборки — отзыв публикации, замену растений при
 * обновлении и отказ публикации на середине: **удаляется только тот файл, на
 * который не ссылается ни одна неотозванная коллекция.**
 *
 * Почему правило именно такое. Путь файла это SHA-256 его содержимого, поэтому
 * две коллекции с одинаковой фотографией ссылаются на один и тот же файл.
 * Удалить его вслепую значит выбить картинку из чужой живой публикации — а
 * восстановить её будет нечем: у нас нет ни оригинала, ни права его спросить.
 *
 * Правило это жило внутри маршрута отзыва, и остальным двум случаям пришлось бы
 * его повторить. Третья копия такого условия — это способ однажды разойтись с
 * первыми двумя, поэтому оно здесь одно.
 */

import { sql } from './db'

const BLOB_API = 'https://blob.vercel-storage.com'

/** Сколько ждём ответа хранилища на удаление. */
const DELETE_TIMEOUT_MS = 15_000

export interface CleanupOptions {
  /**
   * Не считать ссылками строки этой коллекции.
   *
   * Нужно отзыву: он вызывает уборку, когда строки растений ещё на месте, —
   * иначе каждый файл выглядел бы используемым самой отзываемой коллекцией.
   * Обновлению и отказу публикации это не нужно: там состояние базы уже
   * окончательное.
   */
  exceptCollection?: string
  /** Для журнала: по какому поводу убираем. */
  reason: string
}

/**
 * Удалить из хранилища те из перечисленных путей, на которые больше никто не
 * ссылается.
 *
 * Ошибки наружу не выбрасываются. Уборка это всегда следствие уже состоявшегося
 * действия — отзыва, обновления, отказа публикации, — и сказать «не получилось»
 * из-за оставшегося файла значило бы соврать о главном. Всё, что не удалось,
 * попадает в журнал сервера.
 *
 * @returns сколько файлов удалено
 */
export async function deleteUnreferencedBlobs(
  paths: string[],
  { exceptCollection, reason }: CleanupOptions
): Promise<number> {
  const candidates = [...new Set(paths)]
  if (candidates.length === 0) return 0

  let unreferenced: string[]
  try {
    unreferenced = await filterUnreferenced(candidates, exceptCollection)
  } catch (error) {
    // Не выяснили, кто на что ссылается — не удаляем ничего. Лишний файл в
    // хранилище неприятен, удалённая чужая фотография необратима.
    console.error(`Уборка (${reason}): не удалось проверить ссылки, файлы оставлены:`, error)
    return 0
  }

  if (unreferenced.length === 0) return 0

  const token = process.env.BLOB_READ_WRITE_TOKEN
  if (!token) {
    console.error(`Уборка (${reason}): BLOB_READ_WRITE_TOKEN не задан, файлы остались в хранилище`)
    return 0
  }

  const base = publicBlobBaseUrl()
  if (!base) {
    console.error(`Уборка (${reason}): не удалось определить адрес хранилища, файлы остались`)
    return 0
  }

  try {
    const response = await fetch(`${BLOB_API}/delete`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ urls: unreferenced.map((path) => `${base}/${path}`) }),
      signal: AbortSignal.timeout(DELETE_TIMEOUT_MS),
    })

    const body = await response.text()

    if (!response.ok) {
      console.error(`Уборка (${reason}): HTTP ${response.status} ${body.slice(0, 200)}`)
      return 0
    }

    console.log(`Уборка (${reason}): удалено файлов ${unreferenced.length}`)
    return unreferenced.length
  } catch (error) {
    console.error(`Уборка (${reason}): запрос на удаление не удался:`, error)
    return 0
  }
}

/**
 * Оставить только те пути, на которые не ссылается ни одна живая коллекция.
 *
 * Проверка на стороне базы, а не по списку от клиента: маршрут отказа
 * публикации открыт, и присланный список означает «эти файлы можно попробовать
 * убрать», а не «эти файлы ничьи».
 */
async function filterUnreferenced(
  candidates: string[],
  exceptCollection?: string
): Promise<string[]> {
  const db = sql()

  /*
   * Сверяемся только по интересующим нас путям, а не выгружаем все пути всех
   * коллекций: у отказа публикации в списке десяток путей, а коллекций в базе
   * со временем будут тысячи.
   *
   * `= any(${…}::text[])` вместо `in (…)`: список переменной длины в шаблонной
   * строке драйвера иначе не выразить, а приведение нужно потому, что массив
   * доезжает до базы литералом.
   *
   * Два запроса вместо одного с условием внутри: ветка `exceptCollection` в
   * `where` читалась бы вдвое хуже, чем два коротких запроса, из которых
   * выполняется один.
   */
  const rows = (
    exceptCollection === undefined
      ? await db`
          select distinct photo.path as path
          from collection_plants cp
          join collections c on c.id = cp.collection_id
          cross join lateral (
            select jsonb_array_elements(cp.photos)->>'path' as path
          ) photo
          where c.revoked_at is null
            and photo.path = any(${candidates}::text[])
        `
      : await db`
          select distinct photo.path as path
          from collection_plants cp
          join collections c on c.id = cp.collection_id
          cross join lateral (
            select jsonb_array_elements(cp.photos)->>'path' as path
          ) photo
          where c.revoked_at is null
            and cp.collection_id <> ${exceptCollection}
            and photo.path = any(${candidates}::text[])
        `
  ) as { path: string }[]

  const referenced = new Set(rows.map((row) => row.path))

  return candidates.filter((path) => !referenced.has(path))
}

/**
 * Адрес, по которому хранилище отдаёт публичные файлы.
 *
 * Выводится из `BLOB_STORE_ID`: `store_Qp5MPvSlboWmbt6A` соответствует хосту
 * `qp5mpvslbowmbt6a.public.blob.vercel-storage.com`. Соответствие проверено на
 * ответе самого хранилища, но Vercel его не документирует — поэтому при любой
 * неожиданности возвращаем null, и место вызова решает, что делать без адреса.
 */
export function publicBlobBaseUrl(): string | null {
  const storeId = process.env.BLOB_STORE_ID
  if (!storeId) return null

  const host = storeId.replace(/^store_/, '').toLowerCase()
  return /^[a-z0-9]+$/.test(host) ? `https://${host}.public.blob.vercel-storage.com` : null
}
