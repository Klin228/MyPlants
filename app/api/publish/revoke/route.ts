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
import { deleteUnreferencedBlobs } from '@/lib/server/blobCleanup'
import { sha256Hex, sql } from '@/lib/server/db'

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
 * Само правило и работа с хранилищем живут в `lib/server/blobCleanup.ts`: тем же
 * правилом теперь пользуются обновление публикации и отказ публикации на
 * середине (тикет X6). Здесь остаётся только «какие пути считать своими».
 *
 * `exceptCollection` обязателен: строки растений этой коллекции на момент вызова
 * ещё на месте, и без исключения каждый файл выглядел бы используемым — самой
 * отзываемой коллекцией.
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

  return deleteUnreferencedBlobs(
    mine.map((row) => row.path),
    { exceptCollection: collectionId, reason: `отзыв ${collectionId}` }
  )
}
