/**
 * Plant Data Model
 *
 * Represents a plant entity in the system.
 * This model does NOT include photo blobs - photos are stored separately
 * and referenced by their string keys in the photos array.
 */

export interface Plant {
  id: string
  /** Как владелец зовёт этот конкретный экземпляр. */
  name: string
  /**
   * Вид — то, по чему коллекции сопоставляются между собой.
   *
   * Свободный текст: справочника нет, пользователь пишет что хочет, вплоть до
   * сорта или бытового названия. Необязательное — у записей, заведённых до
   * появления поля, его нет, и заполнять за пользователя мы не беремся.
   *
   * Сравнивать напрямую нельзя, только через `speciesKey` из `lib/species.ts`.
   */
  species?: string
  photos: string[] // Array of photo keys (IndexedDB keys, not blobs)
  price: number
  /**
   * Когда растение появилось в коллекции — календарная дата `YYYY-MM-DD`.
   *
   * Именно дата, а не метка времени, и потому формат отличается от
   * `createdAt`. У покупки нет часа: сохрани мы ISO-метку, выбранное первое
   * августа в UTC+3 легло бы в базу как `2026-07-31T21:00:00Z` и показалось
   * бы июлем. `YYYY-MM-DD` часового пояса не имеет и приезжает ровно тем, что
   * выбрали. Это же отдаёт `<input type="date">`.
   */
  acquiredOn?: string
  /** Откуда взялось: магазин, питомник, человек, «черенок от соседки». */
  source?: string
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
