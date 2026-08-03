/**
 * Отдать опубликованную коллекцию как JSON.
 *
 * Нужно восстановлению из публикации: человек потерял устройство, но у него
 * осталась ссылка, и данные лежат на сервере. Разбирать для этого HTML
 * публичной страницы было бы дурно — она вёрстка, а не формат обмена.
 *
 * **Нового доступа это не открывает, и это стоит проговорить.** Кто знает
 * идентификатор, тот и так видит те же поля на `/c/[id]`: те же названия, виды,
 * даты и фотографии, и ровно те цены и заметки, которые владелец разрешил.
 * Идентификатор не угадывается, а сам маршрут ничего не добавляет к тому, что
 * уже отдаёт страница.
 *
 * Чего здесь нет и не должно быть: полей, которых нет в снимке. Если владелец
 * публиковал без цен, цен в базе нет вовсе — восстановить их неоткуда, и это
 * следствие обещания из `CLAUDE.md`, а не недоделка.
 */

import { NextResponse } from 'next/server'
import { sql } from '@/lib/server/db'
import type { SnapshotPhoto } from '@/lib/sharing/types'

/**
 * Кешируется на тот же час, что и публичная страница: содержимое то же, и
 * незачем будить базу на каждый запрос. Публикация и отзыв сбрасывают кеш
 * страницы по её адресу; здесь адрес другой, поэтому окно короче — десять
 * минут. Восстановление это редкое разовое действие, десять минут задержки
 * после повторной публикации никого не задевают.
 */
export const revalidate = 600

interface CollectionRow {
  title: string | null
  revoked_at: string | null
}

interface PlantRow {
  name: string
  species: string | null
  price: string | null
  acquired_on: string | null
  source: string | null
  notes: string | null
  photos: SnapshotPhoto[]
  position: number
}

function blobBaseUrl(): string | null {
  const storeId = process.env.BLOB_STORE_ID
  if (!storeId) return null

  const host = storeId.replace(/^store_/, '').toLowerCase()
  return /^[a-z0-9]+$/.test(host) ? `https://${host}.public.blob.vercel-storage.com` : null
}

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  try {
    const db = sql()

    const collections = (await db`
      select title, revoked_at from collections where id = ${params.id}
    `) as CollectionRow[]

    const collection = collections[0]

    // Отозванная отвечает так же, как несуществующая — то же решение, что на
    // публичной странице: подтверждать, что здесь что-то было, незачем.
    if (!collection || collection.revoked_at) {
      return NextResponse.json({ error: 'Collection not found' }, { status: 404 })
    }

    const plants = (await db`
      select name, species, price,
             to_char(acquired_on, 'YYYY-MM-DD') as acquired_on,
             source, notes, photos, position
      from collection_plants
      where collection_id = ${params.id}
      order by position
    `) as unknown as PlantRow[]

    const base = blobBaseUrl()

    return NextResponse.json({
      id: params.id,
      title: collection.title,
      plants: plants.map((plant) => ({
        name: plant.name,
        species: plant.species ?? undefined,
        // Цена приезжает из базы строкой: тип numeric драйвер не превращает в
        // число, чтобы не терять точность на больших значениях.
        price: plant.price === null ? undefined : Number(plant.price),
        acquiredOn: plant.acquired_on ?? undefined,
        source: plant.source ?? undefined,
        notes: plant.notes ?? undefined,
        position: plant.position,
        /*
         * Полные адреса, а не пути: домен хранилища выводится из переменной
         * окружения, и клиенту незачем знать эту механику. Если адрес
         * определить не удалось, отдаём пустой список — восстановление скажет,
         * что фотографии недоступны, вместо того чтобы качать мусор.
         */
        photos: base ? plant.photos.map((photo) => `${base}/${photo.path}`) : [],
      })),
    })
  } catch (error) {
    console.error(`Не удалось отдать коллекцию ${params.id}:`, error)
    return NextResponse.json({ error: 'Could not read the collection' }, { status: 500 })
  }
}
