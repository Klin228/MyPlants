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
 * Сохранить фотографию и вернуть её ключ
 */
export async function addPhoto(plantId: string, blob: Blob): Promise<string> {
  const db = await initDB()

  const key = `photo_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.PHOTOS], 'readwrite')
    const store = transaction.objectStore(STORES.PHOTOS)
    const request = store.put(blob, key)

    request.onsuccess = () => {
      resolve(key)
    }

    request.onerror = () => {
      console.error('Error adding photo:', request.error)
      reject(request.error)
    }
  })
}

/**
 * Удалить фотографию по ключу
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
 * Удалить несколько фотографий
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
 * Получить сырой блоб. Нужен для выгрузки и будущей отправки на сервер —
 * там object URL бесполезен.
 */
export async function getBlobById(photoKey: string): Promise<Blob> {
  const db = await initDB()
  return readBlob(db, photoKey)
}

export const photosRepository = {
  getByPlantId,
  revokeUrls,
  addPhoto,
  deletePhoto,
  deletePhotos,
  getPhotoById,
  getBlobById
}
