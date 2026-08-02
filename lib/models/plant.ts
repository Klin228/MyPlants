/**
 * Plant Data Model
 *
 * Represents a plant entity in the system.
 * This model does NOT include photo blobs - photos are stored separately
 * and referenced by their string keys in the photos array.
 */

export interface Plant {
  id: string
  name: string
  photos: string[] // Array of photo keys (IndexedDB keys, not blobs)
  price: number
  notes?: string
  /**
   * Даты в ISO 8601, UTC — то, что отдаёт `Date.prototype.toISOString`.
   *
   * Строка, а не число: она уедет в JSON снимка коллекции при шеринге как
   * есть, читается глазами в отладчике и сортируется обычным сравнением —
   * формат фиксированной длины и с одним часовым поясом.
   *
   * Раньше возраст записи доставали из `id`, который был временной меткой.
   * После перехода на UUID (тикет B1) доставать его стало неоткуда.
   */
  createdAt: string
  updatedAt: string
  // Photo blobs are stored separately in the photos repository
  // This keeps the plant entity lightweight and focused on metadata
}

/**
 * Поля, которые приходят из формы. Всё остальное проставляет репозиторий:
 * id и даты — не то, что должен передавать вызывающий код.
 */
export type NewPlant = Omit<Plant, 'id' | 'createdAt' | 'updatedAt'>
