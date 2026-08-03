/**
 * Отзыв публикации.
 *
 * Аккаунтов нет, поэтому право убрать коллекцию подтверждается токеном,
 * выданным при публикации и сохранённым на устройстве владельца. В базе лежит
 * только его хеш.
 *
 * После отзыва ссылка обязана отдавать 404, а файлы — исчезнуть из хранилища.
 * И то и другое требует внимания к деталям, которые легко пропустить: кеш на
 * CDN и общие фотографии.
 */

import { revalidatePath } from 'next/cache'
import { NextResponse } from 'next/server'
import { sha256Hex, sql } from '@/lib/server/db'

const BLOB_API = 'https://blob.vercel-storage.com'

interface RevokeRequest {
  collectionId?: unknown
  revokeToken?: unknown
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: RevokeRequest
  try {
    body = (await request.json()) as RevokeRequest
  } catch {
    return NextResponse.json({ error: 'Could not parse request body' }, { status: 400 })
  }

  const { collectionId, revokeToken } = body
  if (typeof collectionId !== 'string' || typeof revokeToken !== 'string') {
    return NextResponse.json({ error: 'Collection id and token are required' }, { status: 400 })
  }

  const db = sql()

  const rows = (await db`
    select revoke_token_hash, revoked_at from collections where id = ${collectionId}
  `) as { revoke_token_hash: string; revoked_at: string | null }[]

  const collection = rows[0]

  // Уже отозванная или несуществующая коллекция — это успех, а не ошибка.
  // Запись на устройстве могла отстать от действительности: коллекцию убрали
  // с другого устройства или она не пережила чистку. Владельцу в любом случае
  // нужен один результат — «этого больше нет», и локальную запись он сотрёт.
  if (!collection || collection.revoked_at) {
    return NextResponse.json({ revoked: true, deletedFiles: 0, alreadyGone: true })
  }

  if (collection.revoke_token_hash !== (await sha256Hex(revokeToken))) {
    return NextResponse.json({ error: 'Not allowed to revoke this collection' }, { status: 403 })
  }

  const deletedFiles = await deletePhotos(collectionId)

  // Строки растений удаляются, сама коллекция остаётся помеченной. Так
  // идентификатор не переиспользуется, а повторная публикация с устаревшего
  // устройства не воскресит отозванное: маршрут публикации отвечает на
  // отозванную коллекцию «не найдено», и клиент заведёт новую.
  await db`delete from collection_plants where collection_id = ${collectionId}`
  await db`update collections set revoked_at = now() where id = ${collectionId}`

  // Без сброса кеша отозванная коллекция продолжит открываться, и требование
  // «после отзыва 404» будет выполнено только в базе.
  //
  // Два вызова с полными путями, а не один с областью 'layout': с литеральным
  // путём область не совпадает с ключом кеша страницы, и сброс молча ничего не
  // делает — проверено, отозванная коллекция продолжала отдавать 200. Картинка
  // превью живёт по своему адресу и требует отдельного вызова.
  revalidatePath(`/c/${collectionId}`)
  revalidatePath(`/c/${collectionId}/opengraph-image`)
  /*
   * И маршрут, который отдаёт коллекцию как JSON для восстановления. Он тоже
   * кешируется, и без этой строки после отзыва он ещё до десяти минут отдавал
   * всё текстовое содержимое снимка — включая цены и заметки, если владелец их
   * публиковал. Найдено независимым ревью (F3); проверка в E4 это пропустила,
   * потому что там отзывалась коллекция, чей JSON в кеш ещё не попадал.
   */
  revalidatePath(`/api/collections/${collectionId}`)

  return NextResponse.json({ revoked: true, deletedFiles })
}

/**
 * Удалить фотографии коллекции — но только те, которыми больше никто не
 * пользуется.
 *
 * Путь фотографии это хеш её содержимого, поэтому две коллекции с одинаковым
 * снимком ссылаются на один и тот же файл. Удалить его вслепую значит выбить
 * картинку из чужой живой публикации. Отсюда сверка со всеми остальными
 * коллекциями перед удалением.
 *
 * @returns сколько файлов удалено
 */
async function deletePhotos(collectionId: string): Promise<number> {
  const db = sql()

  const mine = (await db`
    select distinct jsonb_array_elements(photos)->>'path' as path
    from collection_plants
    where collection_id = ${collectionId}
  `) as { path: string }[]

  if (mine.length === 0) return 0

  const others = (await db`
    select distinct jsonb_array_elements(cp.photos)->>'path' as path
    from collection_plants cp
    join collections c on c.id = cp.collection_id
    where cp.collection_id <> ${collectionId}
      and c.revoked_at is null
  `) as { path: string }[]

  const stillUsed = new Set(others.map((row) => row.path))
  const toDelete = mine.map((row) => row.path).filter((path) => !stillUsed.has(path))

  if (toDelete.length === 0) return 0

  const token = process.env.BLOB_READ_WRITE_TOKEN
  if (!token) {
    // Данные уже недоступны, а файлы остались висеть. Публикация от этого не
    // воскресает — путь угадать нельзя, — но место в хранилище занято.
    console.error('BLOB_READ_WRITE_TOKEN не задан: файлы отозванной коллекции остались в хранилище')
    return 0
  }

  const base = publicBlobBaseUrl()
  if (!base) {
    console.error('Не удалось определить адрес хранилища: файлы отозванной коллекции остались')
    return 0
  }

  const response = await fetch(`${BLOB_API}/delete`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ urls: toDelete.map((path) => `${base}/${path}`) }),
    signal: AbortSignal.timeout(15_000),
  })

  const body = await response.text()

  if (!response.ok) {
    // Отзыв всё равно состоялся: страница отдаёт 404, данные из базы убраны.
    // Ронять запрос из-за оставшихся файлов значило бы сказать владельцу
    // «не получилось» там, где получилось главное.
    console.error(`Не удалось удалить файлы из хранилища: HTTP ${response.status} ${body.slice(0, 200)}`)
    return 0
  }

  console.log(`Отзыв ${collectionId}: удалено файлов ${toDelete.length}, ответ ${body.slice(0, 200)}`)

  return toDelete.length
}

function publicBlobBaseUrl(): string | null {
  const storeId = process.env.BLOB_STORE_ID
  if (!storeId) return null

  const host = storeId.replace(/^store_/, '').toLowerCase()
  return /^[a-z0-9]+$/.test(host) ? `https://${host}.public.blob.vercel-storage.com` : null
}
