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
import { SNAPSHOT_VERSION, type CollectionSnapshot, type SnapshotPhoto, type SnapshotPlant } from './types'

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

function validatePlant(value: unknown, index: number): ValidationResult {
  const where = `plant ${index + 1}`

  if (!isObject(value)) return fail(`${where}: must be an object`)

  if (typeof value.name !== 'string' || value.name.trim() === '') {
    return fail(`${where}: name is required`)
  }
  if (value.name.length > LIMITS.name) return fail(`${where}: name is too long`)

  if (!Number.isInteger(value.position) || (value.position as number) < 0) {
    return fail(`${where}: invalid position`)
  }

  for (const [field, limit] of [
    ['species', LIMITS.species],
    ['source', LIMITS.source],
    ['notes', LIMITS.notes],
  ] as const) {
    const fieldValue = value[field]
    if (fieldValue === undefined) continue
    if (typeof fieldValue !== 'string') return fail(`${where}: ${field} must be a string`)
    if (fieldValue.length > limit) return fail(`${where}: ${field} is too long`)
  }

  if (value.price !== undefined && !isFinitePrice(value.price)) {
    return fail(`${where}: invalid price`)
  }

  // Календарная дата, а не метка времени — см. модель растения
  if (value.acquiredOn !== undefined) {
    if (typeof value.acquiredOn !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.acquiredOn)) {
      return fail(`${where}: acquisition date must look like YYYY-MM-DD`)
    }
  }

  if (!Array.isArray(value.photos)) return fail(`${where}: photo list is missing`)
  if (value.photos.length === 0) return fail(`${where}: at least one photo is required`)
  if (value.photos.length > LIMITS.photosPerPlant) {
    return fail(`${where}: too many photos`)
  }

  for (const photo of value.photos) {
    const result = validatePhoto(photo, where)
    if (!result.ok) return result
  }

  return { ok: true }
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
