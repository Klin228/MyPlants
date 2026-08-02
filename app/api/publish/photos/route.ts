/**
 * Загрузка публикуемых фотографий в блоб-хранилище.
 *
 * Байты идут из браузера прямо в хранилище, минуя это приложение: у функций
 * Vercel предел на тело запроса, а проксировать десятки мегабайт через свой
 * же сервер значит платить за трафик дважды. Маршрут только выдаёт токен на
 * конкретный путь.
 *
 * POST — выдача токена (протокол `handleUpload` из `@vercel/blob/client`).
 * GET  — какие из перечисленных путей уже загружены.
 *
 * **Авторизации здесь нет**, потому что нет и аккаунтов: опубликовать
 * коллекцию может любой. Единственное, что стоит между хранилищем и
 * произвольной записью, — проверки ниже: путь обязан быть хешем содержимого,
 * тип обязан быть JPEG, размер ограничен. Ограничение частоты запросов и
 * размера публикации — тикет C4, и до него этот маршрут остаётся открытым.
 */

// handleUpload живёт в /client, хотя вызывается на сервере: это серверная
// половина клиентского протокола загрузки, а не клиентский код.
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client'
import { NextResponse } from 'next/server'
import { isPublicPhotoPath, MAX_PUBLIC_PHOTO_BYTES } from '@/lib/sharing/photoPaths'

/** Сколько путей проверяем за один запрос: столько же, сколько фотографий в разумной коллекции. */
const MAX_PATHS_PER_CHECK = 200

/** Сколько ждём ответа хранилища о существовании одного файла. */
const HEAD_TIMEOUT_MS = 5_000

/**
 * Адрес, по которому хранилище отдаёт публичные файлы.
 *
 * Выводится из `BLOB_STORE_ID`: `store_Qp5MPvSlboWmbt6A` соответствует хосту
 * `qp5mpvslbowmbt6a.public.blob.vercel-storage.com`. Соответствие проверено на
 * ответе самого хранилища, но Vercel его не документирует — поэтому при любой
 * неожиданности возвращаем null, и проверка существования просто отключается.
 */
function publicBlobBaseUrl(): string | null {
  const storeId = process.env.BLOB_STORE_ID
  if (!storeId) return null

  const host = storeId.replace(/^store_/, '').toLowerCase()
  if (!/^[a-z0-9]+$/.test(host)) return null

  return `https://${host}.public.blob.vercel-storage.com`
}

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody

  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname: string) => {
        if (!isPublicPhotoPath(pathname)) {
          // Клиент считает путь из хеша содержимого. Всё остальное — либо
          // ошибка, либо попытка записать в хранилище что-то своё.
          throw new Error('Invalid photo path')
        }

        return {
          allowedContentTypes: ['image/jpeg'],
          maximumSizeInBytes: MAX_PUBLIC_PHOTO_BYTES,
          // Путь и есть хеш содержимого: случайный суффикс сломал бы
          // адресацию, и повторная публикация плодила бы копии.
          addRandomSuffix: false,
          // По умолчанию хранилище отвечает на повторную запись ошибкой. Но
          // одинаковый путь здесь означает одинаковые байты, так что перезапись
          // безвредна — а без неё повторная публикация падала бы на каждой
          // неизменившейся фотографии.
          allowOverwrite: true,
        }
      },
      onUploadCompleted: async () => {
        // Ничего не делаем: снимок коллекции складывается отдельным запросом
        // (тикет C4), и загруженная фотография сама по себе ни на что не
        // влияет. Обработчик обязателен по протоколу.
      },
    })

    return NextResponse.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not issue upload token'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

/**
 * Отфильтровать уже загруженные пути.
 *
 * Позволяет не гонять по сети фотографии, которые в хранилище уже лежат:
 * повторная публикация коллекции обычно меняет одну карточку из тридцати.
 *
 * Проверка идёт обычным `HEAD` по публичному адресу. Так короче, чем через
 * `head()` из пакета: авторизация публичному файлу не нужна, а сам пакет в
 * этом проекте на подобных вызовах молчит вместо ответа (см. `DECISIONS.md`,
 * запись 3).
 */
export async function GET(request: Request): Promise<NextResponse> {
  const raw = new URL(request.url).searchParams.get('paths')
  if (!raw) {
    return NextResponse.json({ existing: [] })
  }

  const paths = raw.split(',').map((path) => path.trim()).filter(Boolean)

  if (paths.length > MAX_PATHS_PER_CHECK) {
    return NextResponse.json({ error: 'Too many paths in one request' }, { status: 400 })
  }

  if (paths.some((path) => !isPublicPhotoPath(path))) {
    return NextResponse.json({ error: 'Invalid photo path' }, { status: 400 })
  }

  const baseUrl = publicBlobBaseUrl()
  if (!baseUrl) {
    // Не смогли определить адрес хранилища — значит просто не знаем, что там
    // лежит. Пустой ответ заставит клиента загрузить всё заново: лишний трафик
    // неприятен, сорванная публикация хуже.
    return NextResponse.json({ existing: [] })
  }

  // Предел ожидания обязателен: это оптимизация, а не необходимость. Если
  // хранилище тянет с ответом, честнее сказать «не знаю», чем держать функцию
  // и заставлять пользователя смотреть в никуда.
  const results = await Promise.allSettled(
    paths.map((path) =>
      fetch(`${baseUrl}/${path}`, {
        method: 'HEAD',
        cache: 'no-store',
        signal: AbortSignal.timeout(HEAD_TIMEOUT_MS),
      })
    )
  )

  const existing = paths.filter(
    (_, index) => results[index].status === 'fulfilled' && results[index].value.ok
  )

  return NextResponse.json({ existing })
}
