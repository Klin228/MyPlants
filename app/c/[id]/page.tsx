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
import { unstable_noStore as noStore } from 'next/cache'
import { sql } from '@/lib/server/db'
import { formatCalendarDate } from '@/lib/dates'
import { frameRatio } from '@/lib/photoRatio'
import { collectionLines, describeCollection } from '@/lib/collectionSummary'
import PublicPageBeacon from '@/components/PublicPageBeacon'
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

/**
 * Три исхода, а не два.
 *
 * «Коллекции нет» и «не смогли её прочитать» — разные вещи, и посетителю их
 * надо говорить по-разному: в первом случае возвращаться незачем, во втором
 * стоит зайти через минуту. Раньше сбой базы просто выбрасывался наружу и
 * превращался в пятисотку с пустым телом.
 */
type LoadResult =
  | { status: 'ok'; collection: CollectionRow; plants: PlantRow[] }
  | { status: 'missing' }
  | { status: 'failed' }

async function loadCollection(id: string): Promise<LoadResult> {
  try {
    const db = sql()

    const collections = (await db`
      select id, title, total_price, allow_indexing, revoked_at
      from collections
      where id = ${id}
    `) as CollectionRow[]

    const collection = collections[0]
    if (!collection || collection.revoked_at) return { status: 'missing' }

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

    return { status: 'ok', collection, plants }
  } catch (cause) {
    // В журнал сервера ошибка попадает целиком, посетителю не показывается
    // ничего: в сообщении драйвера базы вполне может оказаться адрес
    // подключения.
    console.error(`Не удалось прочитать коллекцию ${id}:`, cause)
    return { status: 'failed' }
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const data = await loadCollection(params.id)

  if (data.status === 'missing') {
    return { title: 'Collection not found', robots: { index: false, follow: false } }
  }

  if (data.status === 'failed') {
    return { title: 'Collection unavailable', robots: { index: false, follow: false } }
  }

  const { collection, plants } = data
  const title = collection.title || 'Plant collection'
  const description = describeCollection(plants.length)

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

  if (data.status === 'missing') return <Missing />

  if (data.status === 'failed') {
    // Обязательно до возврата: без этого неудачная отрисовка попадёт в кеш
    // маршрута на тот же час, что и удачная, и секундный сбой базы превратится
    // в час нерабочей ссылки. `noStore` помечает конкретно эту отрисовку
    // динамической, кеширование остальных не трогая.
    noStore()
    return <Unavailable id={params.id} />
  }

  const { collection, plants } = data
  const base = blobBaseUrl()

  return (
    <div className="showcase">
      {/*
        Шапка — тот же плотный столбик, что на главной (тикет G7): название и
        сумма тёмным, число растений серым. Классы общие с внутренним экраном
        намеренно — столбик это голос продукта, и по обе стороны ссылки он обязан
        выглядеть одинаково.

        Сумма показывается только если владелец разрешил публиковать цены; она
        стоит второй строкой, чтобы тёмные строки шли подряд, а серая была снизу.
      */}
      <header className="showcase-header">
        <div className="headline">
          <h1 className="headline-line">{collection.title || 'Plant collection'}</h1>

          {collection.total_price !== null && (
            <p className="headline-line">${Number(collection.total_price).toFixed(2)}</p>
          )}

          {collectionLines(plants.length).map((line) => (
            <p key={line} className="headline-line headline-line--quiet">
              {line}
            </p>
          ))}
        </div>
      </header>

      {plants.length === 0 ? (
        // Опубликовать пустую коллекцию нельзя — маршрут требует хотя бы одно
        // растение с фотографией. Но «нельзя» держится на проверке в одном
        // месте, а витрина без этой ветки показала бы голый заголовок и ничего
        // больше, и понять из неё что-либо было бы невозможно.
        <p className="showcase-empty">There is nothing in this collection yet.</p>
      ) : (
        <div className="showcase-grid">
          {plants.map((plant, index) => (
            <article className="showcase-card" key={index}>
              <Photos base={base} plant={plant} eager={index === 0} />

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
      )}

      {/*
        Полоса с кнопкой липкая (тикет J3): она прижата к нижнему краю экрана,
        пока коллекция прокручивается, и садится на своё место в конце страницы.

        `position: sticky` выбран вместо `fixed` ровно ради второго: у длинной
        коллекции кнопка видна всегда, у короткой — просто стоит внизу, не
        закрывая собой две карточки из шести.

        Ссылка отдана клиентскому компоненту ради двух событий воронки. Сама
        ссылка при этом по-прежнему приезжает в серверной разметке — такой
        компонент отрисовывается и на сервере.
      */}
      <footer className="showcase-cta">
        <PublicPageBeacon />
      </footer>
    </div>
  )
}

/**
 * По этому адресу коллекции нет.
 *
 * Несуществующая ссылка и отозванная коллекция выглядят одинаково намеренно:
 * «здесь что-то было, но его убрали» — уже сведение о чужой коллекции, и
 * сообщать его тому, у кого доступа нет, незачем.
 *
 * Отрисовывается прямо в странице, а не через `notFound()`. Причина неприятная
 * и её стоит знать: в Next 14 содержимое `not-found.tsx` **не попадает в
 * серверный HTML** — оно уезжает в скрипт гидратации и появляется только после
 * запуска JavaScript. Проверено на пустых пробных маршрутах: и с
 * `not-found.tsx` в самом сегменте, и с корневым тело ответа остаётся пустым.
 * То есть штатный путь давал ровно то, что этот тикет должен убрать, — белый
 * экран у человека, открывшего чужую ссылку.
 *
 * Цена решения: ответ 200 вместо 404. Разобрано в `DECISIONS.md`, запись 9.
 */
function Missing() {
  return (
    <main className="notice">
      <h1 className="notice-title">This collection is not here</h1>
      <p className="notice-text">
        The address may be mistyped, or the person who shared it may have taken the link down. A
        published collection stays available until its owner removes it.
      </p>
      <p className="notice-action">
        <a href="/">Make one like this — no account, free</a>
      </p>
    </main>
  )
}

/**
 * Коллекция есть, но прочитать её не вышло.
 *
 * Отличается от «здесь ничего нет» тем, что советует вернуться: ссылка живая,
 * это у нас временно не получилось. «Try again» — обычная ссылка на тот же
 * адрес, потому что перезагрузка страницы не должна зависеть от JavaScript.
 */
function Unavailable({ id }: { id: string }) {
  return (
    <main className="notice">
      <h1 className="notice-title">This collection could not be loaded</h1>
      <p className="notice-text">
        Something went wrong on our side — the link itself is fine. Try again in a moment.
      </p>
      <p className="notice-action">
        <a href={`/c/${encodeURIComponent(id)}`}>Try again</a>
      </p>
    </main>
  )
}

/**
 * Лента фотографий одного растения — и то, что показывается вместо неё.
 *
 * Фотографии могут не приехать двумя разными способами, и оба должны выглядеть
 * осмысленно, а не превращать карточку в пустое место.
 *
 * Первый: адрес хранилища не удалось определить, то есть сломана настройка на
 * нашей стороне. Раньше полоса просто не отрисовывалась, и коллекция целиком
 * выглядела как собрание безымянных подписей — по такой странице невозможно
 * догадаться, что что-то не так.
 *
 * Второй: адрес есть, а конкретный файл не отдаётся.
 *
 * Оба закрываются одним и тем же: под каждой фотографией лежит плитка с
 * подписью, а сама фотография кладётся поверх и закрывает её собой. Не
 * загрузилась — видно подпись. Скрипт для этого не нужен, что здесь важно:
 * страницу открывают по чужой ссылке в чужом браузере.
 *
 * Первая версия полагалась на то, что браузер сам нарисует `alt` на месте
 * непогрузившейся картинки. В жизни это выглядело по-разному даже у соседних
 * карточек одной страницы: где-то подпись прижата к верхнему краю пустого
 * прямоугольника рядом со значком битой ссылки, где-то её нет совсем.
 *
 * Отсюда же `alt=""`: название растения стоит текстом прямо под плиткой, и
 * повторять его для читалки экрана незачем — картинка здесь оформительская.
 *
 * Мелкий значок непогрузившейся картинки в углу плитки при этом остаётся:
 * его рисует сам браузер, и убрать его без скрипта нельзя — проверено на
 * `alt=""`, на отсутствии `alt` и на обнулённом размере шрифта. Рядом с
 * подписью он читается как то, чем и является.
 */
function Photos({ base, plant, eager }: { base: string | null; plant: PlantRow; eager: boolean }) {
  /*
   * Форму рамки задаёт обложка — первая фотография (тикет X5).
   *
   * Те же данные и то же правило, что у карточки в коллекции: размеры лежат в
   * снимке у каждой фотографии, а зажимает пропорцию общий `frameRatio`. Иначе
   * владелец кадрирует под один кроп у себя, а гость по ссылке видит другой.
   *
   * Остальные фотографии растения кадрируются в ту же рамку: своя высота у каждой
   * означала бы, что лента дёргается по вертикали при листании.
   */
  const ratio = frameRatio(plant.photos[0])
  const frameStyle = { '--frame-ratio': String(ratio) } as React.CSSProperties

  if (!base || plant.photos.length === 0) {
    return (
      <div className="showcase-strip">
        <Frame style={frameStyle} />
      </div>
    )
  }

  return (
    <div className="showcase-strip">
      {plant.photos.map((photo, photoIndex) => (
        /*
         * Ключ с номером, а не один путь: путь это хеш содержимого, и одна и та
         * же фотография у одного растения давала два одинаковых ключа. Публикация
         * теперь такие отбрасывает (`uploadPhotos.ts`), но уже опубликованные
         * снимки живут в базе годами и переписывать их мы не станем — витрина
         * обязана рисовать и их. Найдено ревью F3.
         */
        <Frame key={`${photo.path}-${photoIndex}`} style={frameStyle}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="showcase-photo"
            src={`${base}/${photo.path}`}
            width={photo.width}
            height={photo.height}
            // Жадно грузится ровно одна картинка — первая у первой карточки.
            // Остальные либо ниже по странице, либо правее в ленте, и до них
            // ещё надо долистать.
            loading={eager && photoIndex === 0 ? 'eager' : 'lazy'}
            decoding="async"
            alt=""
          />
        </Frame>
      ))}
    </div>
  )
}

function Frame({ children, style }: { children?: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="showcase-frame" style={style}>
      {/*
        Подпись лежит в разметке всегда — она подложка, а не сообщение. Отсюда
        `aria-hidden`: узнать, загрузилась ли картинка, разметка не может, и без
        него читалка экрана объявляла бы «фотографии нет» над каждой нормально
        показанной фотографией. Ничего при этом не теряется: сама картинка
        помечена оформительской, а название растения идёт текстом следом.
      */}
      <span className="showcase-frame-note" aria-hidden="true">
        Photo unavailable
      </span>
      {children}
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

