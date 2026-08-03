/**
 * Пределы публикации и проверка присланного снимка.
 *
 * Маршрут публикации открыт: аккаунтов нет, поделиться коллекцией может любой.
 * Значит на входе недоверенные данные, и всё, что ниже, — единственное, что
 * стоит между базой и произвольным содержимым.
 *
 * Проверка не переиспользует типы из `types.ts`: типы описывают, каким снимок
 * должен быть, а здесь выясняется, таков ли он на самом деле. TypeScript в
 * рантайме не участвует.
 */

import { isPublicPhotoPath } from './photoPaths'
import {
  SNAPSHOT_VERSION,
  type CollectionSnapshot,
  type CollectionSnapshotDraft,
  type SnapshotPhoto,
  type SnapshotPlant,
} from './types'

export const LIMITS = {
  /** Растений в одной публикации. Ста хватает даже большой коллекции. */
  plants: 100,
  /** Фотографий у одного растения — столько же, сколько разумно в галерее. */
  photosPerPlant: 10,
  /** Длины текстовых полей. */
  title: 120,
  name: 200,
  species: 200,
  source: 200,
  notes: 2000,
  /** Цена. Верхняя граница отсекает не жадность, а мусор вроде 1e308. */
  maxPrice: 10_000_000,
  /** Размер тела запроса. Снимок без фотографий это килобайты. */
  bodyBytes: 512 * 1024,
} as const

export interface ValidationResult {
  ok: boolean
  error?: string
}

/**
 * Проверить снимок целиком.
 *
 * Возвращает первую же найденную причину отказа: подробный разбор всех ошибок
 * недоверенного ввода никому не нужен, а вот понять, что именно не так,
 * своему же клиенту полезно.
 */
export function validateSnapshot(value: unknown): ValidationResult {
  if (!isObject(value)) return fail('Snapshot must be an object')

  if (value.version !== SNAPSHOT_VERSION) {
    return fail(`Unsupported snapshot version: ${String(value.version)}`)
  }

  if (value.title !== undefined) {
    if (typeof value.title !== 'string') return fail('Title must be a string')
    if (value.title.length > LIMITS.title) return fail('Title is too long')
  }

  if (value.totalPrice !== undefined && !isFinitePrice(value.totalPrice)) {
    return fail('Collection total is not a valid number')
  }

  if (value.allowIndexing !== undefined && typeof value.allowIndexing !== 'boolean') {
    return fail('allowIndexing must be a boolean')
  }

  if (!Array.isArray(value.plants)) return fail('Plant list is missing')
  if (value.plants.length === 0) return fail('Snapshot contains no plants')
  if (value.plants.length > LIMITS.plants) {
    return fail(`Too many plants: at most ${LIMITS.plants}`)
  }

  const positions = new Set<number>()

  for (const [index, plant] of value.plants.entries()) {
    const result = validatePlant(plant, index)
    if (!result.ok) return result

    const position = (plant as SnapshotPlant).position
    if (positions.has(position)) return fail(`Duplicate position: ${position}`)
    positions.add(position)
  }

  return { ok: true }
}

/**
 * Проверить заготовку снимка — до загрузки фотографий.
 *
 * Раньше пределы жили только здесь, в маршруте публикации, и проверялись после
 * того, как клиент уже уменьшил и загрузил все фотографии. Коллекция из 101
 * растения означала несколько минут ожидания и десятки мегабайт трафика, а в
 * конце — «Too many plants: at most 100». Загруженные файлы при этом оставались
 * в хранилище (тикет X6). Найдено ревью F3.
 *
 * Проверяется то же самое и теми же функциями, что на сервере: расходиться этим
 * двум проверкам нельзя. Разница одна — у заготовки вместо путей в хранилище
 * лежат ключи в IndexedDB, поэтому фотографии здесь считаются, а не разбираются.
 *
 * **Серверную проверку это не отменяет.** Маршрут публикации открыт, и то, что
 * наш собственный клиент проверил данные до отправки, о содержимом чужого
 * запроса не говорит ничего.
 */
export function validateDraft(draft: CollectionSnapshotDraft): ValidationResult {
  if (draft.title !== undefined && draft.title.length > LIMITS.title) {
    return fail(`The title is too long (${draft.title.length} characters, at most ${LIMITS.title})`)
  }

  if (draft.plants.length > LIMITS.plants) {
    return fail(`Too many plants (${draft.plants.length} with photos, at most ${LIMITS.plants})`)
  }

  if (draft.totalPrice !== undefined && !isFinitePrice(draft.totalPrice)) {
    return fail('The collection total is not a valid number')
  }

  let photoCount = 0

  for (const [index, plant] of draft.plants.entries()) {
    const where = describePlant(index, plant.name)

    const fields = validatePlantFields(plant as unknown as Record<string, unknown>, where)
    if (!fields.ok) return fields

    if (plant.photoKeys.length > LIMITS.photosPerPlant) {
      return fail(
        `${where}: too many photos (${plant.photoKeys.length}, at most ${LIMITS.photosPerPlant})`
      )
    }

    photoCount += plant.photoKeys.length
  }

  /*
   * Размер тела запроса — единственный предел, который здесь можно только
   * оценить: настоящий снимок соберётся из путей в хранилище, а их ещё нет.
   *
   * Оценка идёт заведомо сверху. Вместо каждого пути с размерами (около 110
   * символов) в заготовке лежит ключ (около 40), разницу добавляем с запасом; а
   * `options`, которых в снимке не будет, из заготовки не вычитаем. Так проверка
   * не пропустит того, что потом не поместится, — а слишком строгой окажется
   * только у коллекции, которая и так стоит на самой границе.
   *
   * Обычную коллекцию это не касается, и запас измерен: сто растений, набитых по
   * пределу во всех полях, дают около 280 тысяч символов при пределе в 512, а те
   * же сто с заметками из одних кавычек — 478 тысяч. Кавычки и обратные слэши
   * `JSON.stringify` удваивает, поэтому заметка из двух тысяч кавычек весит
   * четыре тысячи; управляющие символы он расписывает шестью каждый — на них
   * оценка и превышает предел.
   *
   * Сам предел в байтах только по названию: маршрут сравнивает с ним длину
   * строки, то есть число кодовых единиц. Оценка считает так же.
   */
  const estimate = JSON.stringify(draft).length + photoCount * PHOTO_ENTRY_OVERHEAD
  if (estimate > LIMITS.bodyBytes) {
    return fail(
      `Too much text to publish, shorten some notes ` +
        `(about ${Math.round(estimate / 1024)} KB, at most ${Math.round(LIMITS.bodyBytes / 1024)} KB)`
    )
  }

  return { ok: true }
}

/**
 * На сколько символов запись фотографии в снимке длиннее ключа в заготовке.
 *
 * Взято с запасом: путь `c/<64 шестнадцатеричных>.jpg` с двумя размерами это
 * около 110 символов JSON против сорока у ключа.
 */
const PHOTO_ENTRY_OVERHEAD = 100

function validatePlant(value: unknown, index: number): ValidationResult {
  if (!isObject(value)) return fail(`plant ${index + 1}: must be an object`)

  const where = describePlant(index, value.name)

  const fields = validatePlantFields(value, where)
  if (!fields.ok) return fields

  if (!Number.isInteger(value.position) || (value.position as number) < 0) {
    return fail(`${where}: invalid position`)
  }

  if (!Array.isArray(value.photos)) return fail(`${where}: photo list is missing`)
  if (value.photos.length === 0) return fail(`${where}: at least one photo is required`)
  if (value.photos.length > LIMITS.photosPerPlant) {
    return fail(
      `${where}: too many photos (${value.photos.length}, at most ${LIMITS.photosPerPlant})`
    )
  }

  for (const photo of value.photos) {
    const result = validatePhoto(photo, where)
    if (!result.ok) return result
  }

  return { ok: true }
}

/**
 * Текстовые поля, цена и дата — общее для снимка и заготовки.
 *
 * Принимает `Record<string, unknown>`, а не типизированное растение, хотя одна
 * из двух сторон типизирована: заготовка собирается из того, что лежит в
 * IndexedDB, а туда попадает и восстановленное из резервной копии, где формат
 * даты никто не проверял (`lib/backup.ts` берёт `acquiredOn` любой строкой).
 * Проверять недоверенное одинаково с двух сторон дешевле, чем помнить, какая
 * сторона доверенная.
 */
function validatePlantFields(value: Record<string, unknown>, where: string): ValidationResult {
  if (typeof value.name !== 'string' || value.name.trim() === '') {
    return fail(`${where}: name is required`)
  }
  if (value.name.length > LIMITS.name) {
    return fail(`${where}: the name is too long (${value.name.length} characters, at most ${LIMITS.name})`)
  }

  for (const [field, limit] of [
    ['species', LIMITS.species],
    ['source', LIMITS.source],
    ['notes', LIMITS.notes],
  ] as const) {
    const fieldValue = value[field]
    if (fieldValue === undefined) continue
    if (typeof fieldValue !== 'string') return fail(`${where}: ${field} must be a string`)
    if (fieldValue.length > limit) {
      return fail(`${where}: the ${field} field is too long (${fieldValue.length} characters, at most ${limit})`)
    }
  }

  if (value.price !== undefined && !isFinitePrice(value.price)) {
    return fail(`${where}: the price is not a valid number (at most ${LIMITS.maxPrice})`)
  }

  // Календарная дата, а не метка времени — см. модель растения
  if (value.acquiredOn !== undefined) {
    if (typeof value.acquiredOn !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.acquiredOn)) {
      return fail(`${where}: acquisition date must look like YYYY-MM-DD`)
    }
  }

  return { ok: true }
}

/** Сколько символов названия попадает в сообщение об ошибке. */
const NAME_IN_MESSAGE = 40

/**
 * Как назвать растение в сообщении об ошибке.
 *
 * По имени, а не по номеру: «plant 37» в коллекции из сорока растений не
 * говорит, что править, — нумерация внутри снимка своя и в приложении нигде не
 * видна. Найдено ревью F3.
 *
 * Название приходит от пользователя и может быть любым, включая то самое
 * слишком длинное, из-за которого сообщение и появилось, — поэтому обрезается.
 * Переводы строк сворачиваются: сообщение показывается одной строкой.
 * Безымянное растение остаётся номером, иначе называть его нечем.
 */
function describePlant(index: number, name: unknown): string {
  if (typeof name === 'string') {
    const trimmed = name.trim().replace(/\s+/g, ' ')
    if (trimmed) {
      const short =
        trimmed.length > NAME_IN_MESSAGE ? `${trimmed.slice(0, NAME_IN_MESSAGE)}…` : trimmed
      return `“${short}”`
    }
  }

  return `plant ${index + 1}`
}

function validatePhoto(value: unknown, where: string): ValidationResult {
  if (!isObject(value)) return fail(`${where}: photo must be an object`)

  // Ключевая проверка: путь обязан быть хешем в нашей папке. Иначе снимок
  // сослался бы на произвольный адрес, и публичная страница показывала бы
  // что угодно с чужого домена от нашего имени.
  if (typeof value.path !== 'string' || !isPublicPhotoPath(value.path)) {
    return fail(`${where}: invalid photo path`)
  }

  for (const side of ['width', 'height'] as const) {
    const size = value[side]
    if (!Number.isInteger(size) || (size as number) < 1 || (size as number) > 10_000) {
      return fail(`${where}: invalid photo dimensions`)
    }
  }

  return { ok: true }
}

/**
 * Привести проверенный снимок к типу.
 *
 * Вызывать только после `validateSnapshot`: функция ничего не проверяет, она
 * лишь избавляет вызывающий код от россыпи приведений.
 */
export function asSnapshot(value: unknown): CollectionSnapshot {
  return value as CollectionSnapshot
}

export type { SnapshotPhoto }

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFinitePrice(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= LIMITS.maxPrice
}

function fail(error: string): ValidationResult {
  return { ok: false, error }
}
