/**
 * Публичная страница коллекции — витрина продукта.
 *
 * Серверный компонент, и ни одной строчки клиентского кода: всё содержимое
 * приезжает в HTML. Это требование тикета, а не предпочтение — страницу
 * открывают по чужой ссылке в незнакомом браузере, и она обязана показать
 * коллекцию до и без всякого JavaScript.
 *
 * Единственное, что просилось бы в клиентское, — листание нескольких
 * фотографий. Оно сделано горизонтальной лентой на `scroll-snap`: палец и
 * колесо работают сами, обработчики не нужны.
 */

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { sql } from '@/lib/server/db'
import { formatCalendarDate } from '@/lib/dates'
import { speciesKey } from '@/lib/species'
import type { SnapshotPhoto } from '@/lib/sharing/types'

/**
 * Страховка к точечному сбросу кеша.
 *
 * Основной механизм — `revalidatePath` в маршруте публикации: он даёт
 * мгновенную свежесть. Часовое окно нужно на случай, когда сброс не случился:
 * ошибка, деплой, правка данных мимо маршрута. Без него такая страница
 * застревает навсегда — а «навсегда» здесь буквальное, срока жизни у
 * публикации нет.
 */
export const revalidate = 3600

interface PageProps {
  params: { id: string }
}

interface CollectionRow {
  id: string
  title: string | null
  total_price: string | null
  allow_indexing: boolean
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

async function loadCollection(id: string) {
  const db = sql()

  const collections = (await db`
    select id, title, total_price, allow_indexing, revoked_at
    from collections
    where id = ${id}
  `) as CollectionRow[]

  const collection = collections[0]
  if (!collection || collection.revoked_at) return null

  // acquired_on запрашивается текстом намеренно. Драйвер превращает колонку
  // date в объект Date, и календарная дата тут же становится меткой времени:
  // `String(date).slice(0, 10)` даёт «Tue Jan 10», а часовой пояс сервера
  // начинает влиять на то, какое число увидит читатель.
  const plants = (await db`
    select name, species, price,
           to_char(acquired_on, 'YYYY-MM-DD') as acquired_on,
           source, notes, photos
    from collection_plants
    where collection_id = ${id}
    order by position
  `) as unknown as PlantRow[]

  return { collection, plants }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const data = await loadCollection(params.id)

  if (!data) {
    return { title: 'Collection not found', robots: { index: false, follow: false } }
  }

  const { collection, plants } = data
  const title = collection.title || 'Plant collection'
  const species = new Set(plants.map((plant) => speciesKey(plant.species ?? '')).filter(Boolean))
  const description = describe(plants.length, species.size)

  return {
    title,
    description,
    // Картинку в og:image и twitter:image Next подставит сам из соседнего
    // opengraph-image.tsx — здесь только остальные теги.
    openGraph: { title, description, type: 'website' },
    twitter: { card: 'summary_large_image', title, description },
    // Индексация только по явному разрешению владельца. Ссылка секретна тем,
    // что её нельзя угадать; отправивший её двоим друзьям соглашался на это, а
    // не на выдачу в поиске.
    robots: collection.allow_indexing
      ? { index: true, follow: true }
      : { index: false, follow: false },
  }
}

export default async function CollectionPage({ params }: PageProps) {
  const data = await loadCollection(params.id)

  // Отозванная коллекция отвечает так же, как несуществующая: подтверждать,
  // что по этому адресу когда-то что-то было, незачем. Человеческий вид этих
  // состояний — тикет C8.
  if (!data) notFound()

  const { collection, plants } = data
  const base = blobBaseUrl()
  const species = new Set(plants.map((plant) => speciesKey(plant.species ?? '')).filter(Boolean))

  return (
    <div className="showcase">
      <header className="showcase-header">
        <h1 className="showcase-title">{collection.title || 'Plant collection'}</h1>
        <p className="showcase-summary">{describe(plants.length, species.size)}</p>

        {collection.total_price !== null && (
          <p className="showcase-total">${Number(collection.total_price).toFixed(2)}</p>
        )}
      </header>

      <div className="showcase-grid">
        {plants.map((plant, index) => (
          <article className="showcase-card" key={index}>
            {base && plant.photos.length > 0 && (
              <div className="showcase-strip">
                {plant.photos.map((photo, photoIndex) => (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    key={photo.path}
                    className="showcase-photo"
                    src={`${base}/${photo.path}`}
                    width={photo.width}
                    height={photo.height}
                    // Жадно грузится ровно одна картинка — первая у первой
                    // карточки. Остальные либо ниже по странице, либо правее в
                    // ленте, и до них ещё надо долистать. Размеры проставлены
                    // атрибутами, так что место зарезервировано и ничего не
                    // прыгает при подгрузке.
                    loading={index === 0 && photoIndex === 0 ? 'eager' : 'lazy'}
                    decoding="async"
                    alt={plant.name}
                  />
                ))}
              </div>
            )}

            <div className="showcase-body">
              <h2 className="showcase-name">{plant.name}</h2>
              {plant.species && <p className="showcase-species">{plant.species}</p>}

              {plant.price !== null && (
                <p className="showcase-price">${Number(plant.price).toFixed(2)}</p>
              )}

              <Provenance acquiredOn={plant.acquired_on} source={plant.source} />

              {plant.notes && <p className="showcase-notes">{plant.notes}</p>}
            </div>
          </article>
        ))}
      </div>

      <footer className="showcase-footer">
        <a href="/">Made with MyPlants — build your own collection</a>
      </footer>
    </div>
  )
}

/**
 * Дата приобретения и источник одной строкой.
 *
 * Список собирается заранее отфильтрованным, чтобы пустое поле не оставило
 * висящий разделитель.
 */
function Provenance({ acquiredOn, source }: { acquiredOn: string | null; source: string | null }) {
  const parts = [acquiredOn && formatCalendarDate(acquiredOn), source?.trim()].filter(Boolean)
  if (parts.length === 0) return null

  return <p className="showcase-meta">{parts.join(' · ')}</p>
}

function describe(plantCount: number, speciesCount: number): string {
  const plants = `${plantCount} ${plantCount === 1 ? 'plant' : 'plants'}`
  if (speciesCount === 0) return plants

  return `${plants} · ${speciesCount} ${speciesCount === 1 ? 'species' : 'species'}`
}
