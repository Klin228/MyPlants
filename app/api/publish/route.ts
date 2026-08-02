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

async function createCollection(snapshot: CollectionSnapshot) {
  const db = sql()
  const id = newPublicId()
  const revokeToken = newRevokeToken()

  await db`
    insert into collections (
      id, snapshot_version, title, total_price, allow_indexing, revoke_token_hash
    )
    values (
      ${id},
      ${snapshot.version},
      ${snapshot.title ?? null},
      ${snapshot.totalPrice ?? null},
      ${snapshot.allowIndexing === true},
      ${await sha256Hex(revokeToken)}
    )
  `

  await insertPlants(id, snapshot)

  return { id, revokeToken }
}

async function updateCollection(id: string, revokeToken: string, snapshot: CollectionSnapshot) {
  const db = sql()

  const rows = (await db`
    select revoke_token_hash, revoked_at from collections where id = ${id}
  `) as { revoke_token_hash: string; revoked_at: string | null }[]
  const existing = rows[0]

  // Отсутствующая и отозванная коллекции отвечают одинаково: подсказывать, что
  // такой id когда-то существовал, незачем.
  if (!existing || existing.revoked_at) {
    throw new PublishError('Collection not found', 404)
  }

  if (existing.revoke_token_hash !== (await sha256Hex(revokeToken))) {
    throw new PublishError('Not allowed to update this collection', 403)
  }

  await db`
    update collections
    set snapshot_version = ${snapshot.version},
        title = ${snapshot.title ?? null},
        total_price = ${snapshot.totalPrice ?? null},
        allow_indexing = ${snapshot.allowIndexing === true},
        updated_at = now()
    where id = ${id}
  `

  // Растения заменяются целиком: снимок это состояние коллекции на момент
  // публикации, а не набор правок. Порядок уникален в пределах коллекции,
  // поэтому старые строки надо убрать до вставки новых.
  await db`delete from collection_plants where collection_id = ${id}`
  await insertPlants(id, snapshot)

  return { id, revokeToken }
}

async function insertPlants(collectionId: string, snapshot: CollectionSnapshot) {
  const db = sql()

  for (const plant of snapshot.plants) {
    await db`
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
  }
}
