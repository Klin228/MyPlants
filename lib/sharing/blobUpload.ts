/**
 * Отправка файла в блоб-хранилище.
 *
 * **Почему не `upload()` из `@vercel/blob/client`.** Официальный клиент в этом
 * проекте не работает: вызов не возвращается, не падает и не делает ни одного
 * перехватываемого сетевого запроса. Проверено и на сервере (`put`, `list`,
 * `head`), и в браузере (`upload`), с обработчиком прогресса и без него. Он же
 * скрыл настоящую причину провала первой попытки — приватное хранилище
 * отвечало внятным `400`, а пакет просто молчал.
 *
 * Тот же запрос, отправленный руками, проходит за сотни миллисекунд. Поэтому
 * здесь один `PUT` с клиентским токеном, который выдаёт наш маршрут.
 *
 * Плата за это — зависимость от формы запроса, которую Vercel публично не
 * документирует. Она вся собрана в этом файле, и если API изменится, мы
 * получим внятный код ответа, а не тишину. Обратно на пакет стоит вернуться,
 * когда он начнёт работать: контракт функции этого не заметит.
 */

const BLOB_API = 'https://blob.vercel-storage.com'

export type UploadOutcome = 'uploaded' | 'reused'

/**
 * Загрузить файл по заданному пути.
 *
 * Токен запрашивается у своего маршрута на каждый путь: он одноразовый и
 * привязан к конкретному пути, поэтому его нельзя переиспользовать для
 * другого файла — в этом и смысл.
 *
 * @param tokenEndpoint - маршрут, выдающий клиентский токен
 * @returns `reused`, если такой файл в хранилище уже лежал
 */
export async function putBlob(
  tokenEndpoint: string,
  path: string,
  blob: Blob,
  signal?: AbortSignal
): Promise<UploadOutcome> {
  const clientToken = await requestClientToken(tokenEndpoint, path, signal)

  const response = await fetch(`${BLOB_API}/${path}`, {
    method: 'PUT',
    headers: { authorization: `Bearer ${clientToken}` },
    body: blob,
    signal,
  })

  if (response.ok) return 'uploaded'

  const text = await response.text()

  // Путь — хеш содержимого, поэтому «уже существует» означает, что там лежат
  // ровно эти байты. Это успех, а не ошибка. Токен выдаётся с allowOverwrite,
  // так что штатно этой ветки быть не должно — она страховка на случай, если
  // хранилище передумает про перезапись.
  if (response.status === 400 && text.includes('already exists')) {
    return 'reused'
  }

  throw new Error(`Хранилище отклонило файл (HTTP ${response.status}): ${text.slice(0, 200)}`)
}

async function requestClientToken(
  tokenEndpoint: string,
  pathname: string,
  signal?: AbortSignal
): Promise<string> {
  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    signal,
    body: JSON.stringify({
      type: 'blob.generate-client-token',
      payload: {
        pathname,
        callbackUrl: `${location.origin}${tokenEndpoint}`,
        clientPayload: null,
        multipart: false,
      },
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Не выдан токен на загрузку (HTTP ${response.status}): ${text.slice(0, 200)}`)
  }

  const { clientToken } = (await response.json()) as { clientToken?: string }
  if (!clientToken) throw new Error('Маршрут не вернул токен на загрузку')

  return clientToken
}
