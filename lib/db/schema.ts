/**
 * Database Schema Definitions
 *
 * This file defines the structure of our IndexedDB database.
 * It specifies object stores, their keys, and indexes.
 */

import { timestampFromLegacyId } from '../ids'

export const DB_NAME = 'plant-collection-db'

/**
 * Версия 2 добавила растениям createdAt и updatedAt. Схема при этом не
 * поменялась — сторы и ключи те же, — но существующим записям надо проставить
 * даты, а это делается в обработчике обновления.
 *
 * Версия 3 добавила стор с размерами фотографий: карточка берёт свою форму из
 * пропорции обложки (тикет X5), а по одному блобу этого не узнать, не расшифровав
 * его. Переноса данных здесь нет намеренно — размеры существующих фотографий
 * дописываются по первому чтению, см. `photosRepository.getSizes`. Расшифровать
 * сотню снимков внутри versionchange-транзакции всё равно нельзя: она закроется
 * на первом же await.
 */
export const DB_VERSION = 3

/**
 * Object Store Names
 */
export const STORES = {
  PLANTS: 'plants',
  PHOTOS: 'photos',
  /** Ключ фотографии → `{ width, height }`. Отдельно от блобов: так добавление
   *  размеров не требует перезаписи самих блобов. */
  PHOTO_SIZES: 'photoSizes'
} as const

/**
 * Database Schema
 * 
 * Object Stores:
 * - plants: Stores plant metadata (id, name, price, notes, photos array)
 *   - Key: id (string)
 *   - No indexes needed for current use cases
 * 
 * - photos: Stores photo blobs with string keys
 *   - Key: string (custom key, not auto-increment)
 *   - No indexes needed - photos are accessed directly by key
 */
export function createSchema(db: IDBDatabase): void {
  // Plants object store - stores plant metadata without blobs
  if (!db.objectStoreNames.contains(STORES.PLANTS)) {
    const plantsStore = db.createObjectStore(STORES.PLANTS, { keyPath: 'id' })
    // No indexes needed for current use cases
  }

  // Photos object store - stores photo blobs with string keys
  // This matches the existing system where photos use string keys like "photo_1234567890_abc123"
  if (!db.objectStoreNames.contains(STORES.PHOTOS)) {
    db.createObjectStore(STORES.PHOTOS)
    // No keyPath - we use string keys directly
    // No indexes needed - photos are accessed directly by key
  }

  // Размеры фотографий: тот же ключ, что у блоба, значение `{ width, height }`
  if (!db.objectStoreNames.contains(STORES.PHOTO_SIZES)) {
    db.createObjectStore(STORES.PHOTO_SIZES)
  }
}

/**
 * Миграции данных, идущие внутри versionchange-транзакции.
 *
 * Здесь им и место: транзакция обновления атомарна, выполняется ровно один раз
 * на устройство и гарантированно раньше любого чтения. Отдельная отметка
 * «уже мигрировали» не нужна — её роль играет номер версии базы.
 *
 * @param transaction - versionchange-транзакция открывающего запроса
 * @param oldVersion - версия, с которой обновляемся; 0 для новой базы
 */
export function upgradeData(transaction: IDBTransaction, oldVersion: number): void {
  if (oldVersion > 0 && oldVersion < 2) {
    backfillDates(transaction)
  }
}

/**
 * Проставить createdAt и updatedAt записям, созданным до версии 2.
 *
 * До перехода на UUID id растения был `Date.now().toString()`, так что у
 * старых записей возраст можно достать из самого id. У записей с UUID достать
 * его неоткуда — таким ставим текущий момент, и они окажутся самыми новыми.
 * Это то же поведение, что давала временная сортировка из тикета B1.
 */
function backfillDates(transaction: IDBTransaction): void {
  const store = transaction.objectStore(STORES.PLANTS)
  const request = store.openCursor()
  const fallback = new Date().toISOString()
  let touched = 0

  request.onsuccess = () => {
    const cursor = request.result
    if (!cursor) {
      if (touched > 0) {
        console.log(`Проставлены даты у ${touched} записи(ей)`)
      }
      return
    }

    const plant = cursor.value
    if (!plant.createdAt) {
      const createdAt = timestampFromLegacyId(plant.id) ?? fallback
      // Когда запись меняли в последний раз, мы не знаем: до этой версии такое
      // просто не сохранялось. Честнее всего приравнять к дате создания.
      cursor.update({ ...plant, createdAt, updatedAt: createdAt })
      touched++
    }

    cursor.continue()
  }

  request.onerror = () => {
    console.error('Не удалось проставить даты существующим записям:', request.error)
  }
}
