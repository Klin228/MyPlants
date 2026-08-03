/**
 * Photos Repository
 *
 * Хранит блобы фотографий отдельно от метаданных растения.
 *
 * ВАЖНО про формат возврата. Раньше блоб конвертировался в base64 через
 * FileReader.readAsDataURL. Это была главная причина тормозов: base64 на треть
 * больше двоичных данных, целиком лежит в памяти строкой и заново декодируется
 * при каждой перерисовке. Теперь возвращается object URL — указатель на блоб,
 * а не его копия.
 *
 * Плата: object URL надо освобождать вручную. Тот, кто вызвал getByPlantId
 * или getPhotoById, обязан вызвать revokeUrls при размонтировании, иначе блобы
 * останутся в памяти до перезагрузки вкладки.
 */

import { initDB } from '../db'
import { STORES } from '../db/schema'
import { measureImage } from '../images'

/**
 * Прочитать один блоб по ключу
 */
function readBlob(db: IDBDatabase, key: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.PHOTOS], 'readonly')
    const store = transaction.objectStore(STORES.PHOTOS)
    const request = store.get(key)

    request.onsuccess = () => {
      const blob: Blob | undefined = request.result
      if (!blob) {
        reject(new Error(`Photo with key ${key} not found`))
        return
      }
      resolve(blob)
    }

    request.onerror = () => {
      console.error('Error getting photo:', request.error)
      reject(request.error)
    }
  })
}

/**
 * Получить фотографии по ключам как object URL.
 *
 * Отсутствующие фото не роняют весь список — на их месте будет пустая строка.
 * Раньше один битый ключ обрушивал Promise.all и карточка оставалась вообще
 * без фотографий.
 *
 * @param keys - ключи фотографий
 * @returns массив object URL той же длины и в том же порядке, что keys
 */
export async function getByPlantId(keys: string[]): Promise<string[]> {
  if (keys.length === 0) {
    return []
  }

  const db = await initDB()

  const results = await Promise.allSettled(
    keys.map(key => readBlob(db, key))
  )

  return results.map((result, index) => {
    if (result.status === 'fulfilled') {
      return URL.createObjectURL(result.value)
    }
    console.warn(`Photo ${keys[index]} unavailable:`, result.reason)
    return ''
  })
}

/**
 * Освободить object URL. Вызывать при размонтировании компонента.
 * Пустые строки (места отсутствующих фото) пропускаются.
 */
export function revokeUrls(urls: string[]): void {
  urls.forEach(url => {
    if (url && url.startsWith('blob:')) {
      URL.revokeObjectURL(url)
    }
  })
}

/**
 * Размеры фотографии. Из них берётся форма карточки — см. `lib/photoRatio.ts`.
 */
export interface PhotoSize {
  width: number
  height: number
}

/**
 * Сохранить фотографию и вернуть её ключ.
 *
 * Размеры пишутся рядом, в той же транзакции: тот, кто уменьшал фотографию, их
 * уже знает (`resizeToJpeg` возвращает настоящие размеры результата), и выбросить
 * их значило бы расшифровывать блоб заново при первом показе карточки.
 */
export async function addPhoto(plantId: string, blob: Blob, size?: PhotoSize): Promise<string> {
  const db = await initDB()

  const key = `photo_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.PHOTOS, STORES.PHOTO_SIZES], 'readwrite')
    transaction.objectStore(STORES.PHOTOS).put(blob, key)
    if (size) transaction.objectStore(STORES.PHOTO_SIZES).put(size, key)

    transaction.oncomplete = () => resolve(key)
    transaction.onabort = () => {
      console.error('Error adding photo:', transaction.error)
      reject(transaction.error ?? new Error('Could not save the photo'))
    }
  })
}

/**
 * Размеры фотографий по ключам.
 *
 * Чего нет в сторе размеров — обмеряется по блобу и дописывается. Так фотографии,
 * сохранённые до версии 3, получают пропорцию при первом же показе, без переноса
 * данных при обновлении базы. Первый показ такой карточки может дрогнуть: до
 * обмера её форма неизвестна и берётся значение по умолчанию.
 *
 * Ключи без блоба и нерасшифровываемые блобы просто отсутствуют в ответе —
 * карточка возьмёт форму по умолчанию, а не сломается.
 */
export async function getSizes(keys: string[]): Promise<Record<string, PhotoSize>> {
  if (keys.length === 0) return {}

  const db = await initDB()
  const unique = [...new Set(keys)]

  const known = await new Promise<Record<string, PhotoSize>>((resolve, reject) => {
    const transaction = db.transaction([STORES.PHOTO_SIZES], 'readonly')
    const store = transaction.objectStore(STORES.PHOTO_SIZES)
    const found: Record<string, PhotoSize> = {}

    for (const key of unique) {
      const request = store.get(key)
      request.onsuccess = () => {
        const size = request.result as PhotoSize | undefined
        if (size && size.width > 0 && size.height > 0) found[key] = size
      }
    }

    transaction.oncomplete = () => resolve(found)
    transaction.onabort = () => reject(transaction.error)
  })

  const missing = unique.filter((key) => !known[key])
  if (missing.length === 0) return known

  const measured = await Promise.all(
    missing.map(async (key) => {
      try {
        const blob = await readBlob(db, key)
        return [key, await measureImage(blob)] as const
      } catch (error) {
        console.warn(`Не удалось обмерить фотографию ${key}:`, error)
        return null
      }
    })
  )

  const fresh = measured.filter((entry): entry is readonly [string, PhotoSize] => entry !== null)
  if (fresh.length > 0) {
    await new Promise<void>((resolve) => {
      const transaction = db.transaction([STORES.PHOTO_SIZES], 'readwrite')
      const store = transaction.objectStore(STORES.PHOTO_SIZES)
      for (const [key, size] of fresh) store.put(size, key)
      // Не дописали размеры — не беда: обмерим в следующий раз
      transaction.oncomplete = () => resolve()
      transaction.onabort = () => resolve()
    })
  }

  return { ...known, ...Object.fromEntries(fresh) }
}

/**
 * Записать фотографию под заданным ключом.
 *
 * Нужно восстановлению из резервной копии: `addPhoto` придумывает ключ сам, а
 * здесь ключи должны совпасть с теми, что записаны у растений в копии. `put`, а
 * не `add`: один и тот же блоб под тем же ключом — это то же самое фото, и
 * перезапись безобидна.
 */
export async function restorePhoto(key: string, blob: Blob): Promise<void> {
  const db = await initDB()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.PHOTOS], 'readwrite')
    const request = transaction.objectStore(STORES.PHOTOS).put(blob, key)

    request.onsuccess = () => resolve()
    request.onerror = () => {
      console.error('Error restoring photo:', request.error)
      reject(request.error)
    }
  })
}

/**
 * Удалить фотографию по ключу.
 *
 * **Ссылки не проверяются, и своей транзакцией эта функция ничего не
 * согласовывает.** Удаление блобов при правке и удалении растения живёт в
 * `plantsRepository.dropUnreferencedPhotos`: только там в один момент известны
 * прежний набор ключей, новый и все остальные растения, и всё это делается той
 * же транзакцией, что пишет растение. Прямой вызов отсюда вынесет фотографию,
 * даже если на неё ссылается другое растение (тикет X7).
 */
export async function deletePhoto(photoId: string): Promise<void> {
  const db = await initDB()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.PHOTOS], 'readwrite')
    const store = transaction.objectStore(STORES.PHOTOS)
    const request = store.delete(photoId)

    request.onsuccess = () => {
      resolve()
    }

    request.onerror = () => {
      console.error('Error deleting photo:', request.error)
      reject(request.error)
    }
  })
}

/**
 * Удалить несколько фотографий. Та же оговорка, что у `deletePhoto`: ссылки не
 * проверяются, транзакция на каждый ключ своя.
 */
export async function deletePhotos(photoIds: string[]): Promise<void> {
  await Promise.all(photoIds.map(key => deletePhoto(key)))
}

/**
 * Получить одну фотографию как object URL.
 * Вызывающий обязан освободить её через revokeUrls.
 */
export async function getPhotoById(photoKey: string): Promise<string> {
  const db = await initDB()
  const blob = await readBlob(db, photoKey)
  return URL.createObjectURL(blob)
}

/**
 * Ключи всех фотографий и их вес — без расшифровки и без чтения байтов.
 *
 * `blob.size` это метаданные: значение из IndexedDB приезжает ссылкой на файл, а
 * не содержимым, поэтому перебрать так можно и сотню снимков по восемь мегабайт.
 * Нужно разовому уменьшению (`lib/shrinkPhotos.ts`), чтобы понять, есть ли что
 * уменьшать, не заставляя человека ждать.
 */
export async function listPhotos(): Promise<{ key: string; bytes: number }[]> {
  const db = await initDB()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.PHOTOS], 'readonly')
    const request = transaction.objectStore(STORES.PHOTOS).openCursor()
    const entries: { key: string; bytes: number }[] = []

    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor) return

      const blob = cursor.value as Blob | undefined
      if (blob) entries.push({ key: String(cursor.key), bytes: blob.size })
      cursor.continue()
    }

    transaction.oncomplete = () => resolve(entries)
    transaction.onabort = () => {
      console.error('Error listing photos:', transaction.error)
      reject(transaction.error)
    }
  })
}

/**
 * Только записанные размеры, без обмера отсутствующих.
 *
 * Отличается от `getSizes` именно этим: там отсутствующие обмеряются
 * расшифровкой, а здесь вызывающий сам решает, что делать с пробелами. Разовому
 * уменьшению это нужно, потому что оно всё равно расшифровывает блоб и обмерить
 * может заодно.
 */
export async function getStoredSizes(keys: string[]): Promise<Record<string, PhotoSize>> {
  if (keys.length === 0) return {}

  const db = await initDB()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.PHOTO_SIZES], 'readonly')
    const store = transaction.objectStore(STORES.PHOTO_SIZES)
    const found: Record<string, PhotoSize> = {}

    for (const key of [...new Set(keys)]) {
      const request = store.get(key)
      request.onsuccess = () => {
        const size = request.result as PhotoSize | undefined
        if (size && size.width > 0 && size.height > 0) found[key] = size
      }
    }

    transaction.oncomplete = () => resolve(found)
    transaction.onabort = () => reject(transaction.error)
  })
}

/**
 * Запомнить размеры фотографии, не трогая сам блоб.
 */
export async function rememberSize(key: string, size: PhotoSize): Promise<void> {
  const db = await initDB()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.PHOTO_SIZES], 'readwrite')
    transaction.objectStore(STORES.PHOTO_SIZES).put(size, key)

    transaction.oncomplete = () => resolve()
    transaction.onabort = () => reject(transaction.error)
  })
}

/**
 * Заменить фотографию под тем же ключом — блоб и его размеры одной транзакцией.
 *
 * Одним `put`, а не «удалить и записать»: ни в один момент ключ не остаётся без
 * блоба, поэтому прерывание не может потерять фотографию. Размеры пишутся здесь
 * же — после уменьшения они другие, а из них берётся форма карточки (X5), и
 * разойтись им нельзя.
 */
export async function replacePhoto(key: string, blob: Blob, size: PhotoSize): Promise<void> {
  const db = await initDB()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.PHOTOS, STORES.PHOTO_SIZES], 'readwrite')
    transaction.objectStore(STORES.PHOTOS).put(blob, key)
    transaction.objectStore(STORES.PHOTO_SIZES).put(size, key)

    transaction.oncomplete = () => resolve()
    transaction.onabort = () => {
      console.error('Error replacing photo:', transaction.error)
      reject(transaction.error ?? new Error('Could not replace the photo'))
    }
  })
}

/**
 * Получить сырой блоб. Нужен для выгрузки и будущей отправки на сервер —
 * там object URL бесполезен.
 */
export async function getBlobById(photoKey: string): Promise<Blob> {
  const db = await initDB()
  return readBlob(db, photoKey)
}

export const photosRepository = {
  restorePhoto,
  getByPlantId,
  getSizes,
  getStoredSizes,
  listPhotos,
  rememberSize,
  replacePhoto,
  revokeUrls,
  addPhoto,
  deletePhoto,
  deletePhotos,
  getPhotoById,
  getBlobById
}
