/**
 * Публичная страница коллекции.
 *
 * НАМЕРЕННО МИНИМАЛЬНАЯ. Тикет C4 требует убедиться, что опубликованная ссылка
 * открывается и коллекция видна; оформление, разметка для соцсетей и —
 * обязательно — кеширование на CDN это тикет C5. Кеширование там не украшение:
 * в `DECISIONS.md`, запись 1, объяснено, что без него всплеск внимания сжигает
 * бесплатные CU-часы Neon за пару недель.
 */

import { notFound } from 'next/navigation'
import { sql } from '@/lib/server/db'
import { formatCalendarDate } from '@/lib/dates'
import type { SnapshotPhoto } from '@/lib/sharing/types'

interface PageProps {
  params: { id: string }
}

interface PlantRow {
  name: string
  species: string | null
  price: string | null
  acquired_on: string | null
  source: string | null
  notes: string | null
  photos: SnapshotPhoto[]
}

/**
 * Адрес, по которому хранилище отдаёт фотографии.
 *
 * Выводится из `BLOB_STORE_ID` — соответствие проверено на ответе хранилища,
 * но Vercel его не документирует (см. `DECISIONS.md`, запись 3).
 */
function blobBaseUrl(): string | null {
  const storeId = process.env.BLOB_STORE_ID
  if (!storeId) return null

  const host = storeId.replace(/^store_/, '').toLowerCase()
  return /^[a-z0-9]+$/.test(host) ? `https://${host}.public.blob.vercel-storage.com` : null
}

export default async function CollectionPage({ params }: PageProps) {
  const db = sql()

  const collections = (await db`
    select id, title, total_price, revoked_at
    from collections
    where id = ${params.id}
  `) as { id: string; title: string | null; total_price: string | null; revoked_at: string | null }[]
  const collection = collections[0]

  // Отозванная коллекция отвечает так же, как несуществующая: подтверждать,
  // что по этому адресу когда-то что-то было, незачем.
  if (!collection || collection.revoked_at) notFound()

  // acquired_on запрашивается текстом намеренно. Драйвер превращает колонку
  // date в объект Date, и календарная дата тут же становится меткой времени со
  // всеми последствиями: `String(date).slice(0, 10)` даёт «Tue Jan 10», а часовой
  // пояс сервера начинает влиять на то, какое число увидит читатель. to_char
  // отдаёт ровно то, что лежит в базе.
  const plants = (await db`
    select name, species, price,
           to_char(acquired_on, 'YYYY-MM-DD') as acquired_on,
           source, notes, photos
    from collection_plants
    where collection_id = ${params.id}
    order by position
  `) as unknown as PlantRow[]

  const base = blobBaseUrl()

  return (
    <main className="page">
      <h1 className="page-title">{collection.title || 'Plant collection'}</h1>

      {collection.total_price !== null && (
        <p className="card-meta">Total: ${Number(collection.total_price).toFixed(2)}</p>
      )}

      <div className="plant-list">
        {plants.map((plant, index) => {
          const provenance = [
            plant.acquired_on && formatCalendarDate(plant.acquired_on),
            plant.source,
          ].filter(Boolean)

          return (
            <article className="card" key={index}>
              {base && plant.photos[0] && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  className="public-photo"
                  src={`${base}/${plant.photos[0].path}`}
                  width={plant.photos[0].width}
                  height={plant.photos[0].height}
                  alt={plant.name}
                />
              )}

              <div className="card-body">
                <h2 className="card-title">{plant.name}</h2>
                {plant.species && <p className="card-species">{plant.species}</p>}
                {plant.price !== null && (
                  <p className="card-price">${Number(plant.price).toFixed(2)}</p>
                )}
                {provenance.length > 0 && <p className="card-meta">{provenance.join(' · ')}</p>}
                {plant.notes && (
                  <div className="card-notes">
                    <p>{plant.notes}</p>
                  </div>
                )}
              </div>
            </article>
          )
        })}
      </div>
    </main>
  )
}
