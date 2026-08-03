/**
 * Публикация коллекции.
 *
 * Принимает снимок, кладёт его в базу и возвращает адрес. Фотографии к этому
 * моменту уже в хранилище — их отправил клиент (тикет C3).
 *
 * Повторная публикация не меняет адрес: клиент присылает свой `collectionId` и
 * токен отзыва, содержимое заменяется целиком. Так решено в `DECISIONS.md`,
 * запись 1: ссылку уже отправили в тред, и ломать её нельзя.
 */

import { revalidatePath } from 'next/cache'
import { NextResponse } from 'next/server'
import { newPublicId, newRevokeToken } from '@/lib/ids'
import { deleteUnreferencedBlobs } from '@/lib/server/blobCleanup'
import { sha256Hex, sql } from '@/lib/server/db'
import { checkPublishRateLimit } from '@/lib/server/rateLimit'
import { asSnapshot, LIMITS, validateSnapshot } from '@/lib/sharing/limits'
import { speciesKey } from '@/lib/species'
import type { CollectionSnapshot } from '@/lib/sharing/types'

interface PublishRequest {
  snapshot: unknown
  /** Есть при повторной публикации: обновляем существующую коллекцию. */
  collectionId?: unknown
  revokeToken?: unknown
}

export async function POST(request: Request): Promise<NextResponse> {
  const rate = await checkPublishRateLimit(request)
  if (!rate.allowed) {
    return NextResponse.json(
      { error: `Too many publishes: at most ${rate.limit} per hour. Try again later.` },
      { status: 429 }
    )
  }

  let body: PublishRequest
  try {
    const raw = await request.text()
    if (raw.length > LIMITS.bodyBytes) {
      return NextResponse.json({ error: 'Snapshot is too large' }, { status: 413 })
    }
    body = JSON.parse(raw) as PublishRequest
  } catch {
    return NextResponse.json({ error: 'Could not parse request body' }, { status: 400 })
  }

  const validation = validateSnapshot(body.snapshot)
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 })
  }

  const snapshot = asSnapshot(body.snapshot)

  try {
    const isUpdate = typeof body.collectionId === 'string' && typeof body.revokeToken === 'string'

    const { id, revokeToken } = isUpdate
      ? await updateCollection(body.collectionId as string, body.revokeToken as string, snapshot)
      : await createCollection(snapshot)

    // Публичная страница кешируется, и это не прихоть: без кеша всплеск
    // внимания сжигает бесплатные CU-часы Neon (см. DECISIONS.md, запись 1).
    // Но повторная публикация обязана быть видна сразу — иначе владелец
    // обновляет коллекцию, открывает ссылку и видит прошлую версию. Сброс
    // точно по адресу вместо ожидания истечения времени: дёшево и мгновенно.
    revalidatePath(`/c/${id}`)

    return NextResponse.json({ id, revokeToken, path: `/c/${id}` })
  } catch (error) {
    if (error instanceof PublishError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    console.error('Публикация не удалась:', error)
    return NextResponse.json({ error: 'Could not publish the collection' }, { status: 500 })
  }
}

class PublishError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

/**
 * Завести публикацию.
 *
 * **Одной транзакцией, и это не про аккуратность, а про необратимость.**
 *
 * Раньше строка коллекции вставлялась отдельно, а растения — следом, по одному
 * запросу на каждое. Сбой на середине вставки давал клиенту 500, и он **никогда
 * не узнавал токен отзыва**: токен возвращается только в успешном ответе, а в
 * базе лежит его хеш. Коллекция при этом уже существовала и была видна по
 * ссылке. Отозвать её было нечем — навсегда. Единственное необратимое состояние,
 * которое нашло независимое ревью (F3), отсюда и очередь этого тикета.
 *
 * Драйвер Neon ходит по HTTP и интерактивных транзакций не умеет, но умеет
 * `transaction()`: массив запросов уезжает одним запросом и выполняется внутри
 * одной транзакции. Все наши запросы известны заранее, так что этого достаточно.
 */
async function createCollection(snapshot: CollectionSnapshot) {
  const db = sql()
  const id = newPublicId()
  const revokeToken = newRevokeToken()
  // Хеш считается до сборки массива: внутри него `await` уже негде.
  const tokenHash = await sha256Hex(revokeToken)

  await db.transaction([
    db`
      insert into collections (
        id, snapshot_version, title, total_price, allow_indexing, revoke_token_hash
      )
      values (
        ${id},
        ${snapshot.version},
        ${snapshot.title ?? null},
        ${snapshot.totalPrice ?? null},
        ${snapshot.allowIndexing === true},
        ${tokenHash}
      )
    `,
    ...plantInserts(db, id, snapshot),
  ])

  return { id, revokeToken }
}

async function updateCollection(id: string, revokeToken: string, snapshot: CollectionSnapshot) {
  const db = sql()

  const rows = (await db`
    select revoke_token_hash, revoked_at from collections where id = ${id}
  `) as { revoke_token_hash: string; revoked_at: string | null }[]
  const existing = rows[0]
  const previousPaths = (await db`
    select distinct jsonb_array_elements(photos)->>'path' as path
    from collection_plants
    where collection_id = ${id}
  `) as { path: string }[]

  // Отсутствующая и отозванная коллекции отвечают одинаково: подсказывать, что
  // такой id когда-то существовал, незачем.
  if (!existing || existing.revoked_at) {
    throw new PublishError('Collection not found', 404)
  }

  if (existing.revoke_token_hash !== (await sha256Hex(revokeToken))) {
    throw new PublishError('Not allowed to update this collection', 403)
  }

  /*
   * Тоже одной транзакцией. Здесь сбой на середине не создавал неотзываемых
   * коллекций, но давал читателю по живой ссылке усечённую коллекцию — скажем
   * «3 plants» при сумме за все сорок, потому что строка `collections` со
   * стоимостью обновлялась первой. Владелец видел ошибку и не знал, в каком
   * состоянии осталась его публикация.
   *
   * Порядок внутри транзакции важен: сначала обновить коллекцию и убрать старые
   * растения, потом вставить новые. Уникальность `(collection_id, position)`
   * иначе не даст вставить строку с уже занятой позицией.
   */
  await db.transaction([
    db`
      update collections
      set snapshot_version = ${snapshot.version},
          title = ${snapshot.title ?? null},
          total_price = ${snapshot.totalPrice ?? null},
          allow_indexing = ${snapshot.allowIndexing === true},
          updated_at = now()
      where id = ${id}
    `,
    // Растения заменяются целиком: снимок это состояние коллекции на момент
    // публикации, а не набор правок.
    db`delete from collection_plants where collection_id = ${id}`,
    ...plantInserts(db, id, snapshot),
  ])

  /*
   * Файлы, отвязанные этим обновлением, удаляются из хранилища.
   *
   * Это второй источник сирот из тикета X6: замена строк растений оставляла
   * файлы удалённых растений в хранилище навсегда. Ни отзыв, ни следующее
   * обновление их бы не убрали — отзыв смотрит только на текущие строки, а тех
   * путей в них уже нет. То есть «опубликовал → удалил растение → опубликовал
   * заново → отозвал» оставляло фотографию удалённого растения публично
   * доступной, хотя диалог обещал, что фотографии удалены из хранилища.
   *
   * После транзакции, а не до: проверка ссылок должна видеть уже новый состав
   * коллекции, иначе оставшиеся в ней фотографии выглядели бы отвязанными.
   * Исключать коллекцию из проверки поэтому и не нужно.
   *
   * Отказ уборки не роняет обновление: снимок уже сохранён, и говорить владельцу
   * «не получилось» из-за оставшегося файла — врать о главном.
   */
  await deleteUnreferencedBlobs(
    previousPaths.map((row) => row.path),
    { reason: `обновление ${id}` }
  )

  return { id, revokeToken }
}

/**
 * Запросы на вставку растений — **не выполненные**, для передачи в транзакцию.
 *
 * Раньше эта функция сама их и выполняла, по одному `await` на растение. Теперь
 * возвращает массив: драйвер отправит его одним запросом внутри транзакции.
 * `db` передаётся параметром, а не берётся из `sql()` заново, чтобы запросы
 * принадлежали тому же соединению, что и остальная транзакция.
 */
function plantInserts(db: ReturnType<typeof sql>, collectionId: string, snapshot: CollectionSnapshot) {
  return snapshot.plants.map(
    (plant) => db`
      insert into collection_plants (
        collection_id, position, name, species, species_key,
        price, acquired_on, source, notes, photos
      )
      values (
        ${collectionId},
        ${plant.position},
        ${plant.name.trim()},
        ${plant.species ?? null},
        ${plant.species ? speciesKey(plant.species) : null},
        ${plant.price ?? null},
        ${plant.acquiredOn ?? null},
        ${plant.source ?? null},
        ${plant.notes ?? null},
        ${JSON.stringify(plant.photos)}
      )
    `
  )
}
