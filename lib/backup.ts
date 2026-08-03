/**
 * Резервная копия коллекции: выгрузка в файл и восстановление из него.
 *
 * **Публикация резервной копией не является, и это правильно.** Три флага
 * `includePrices`, `includeNotes`, `includeSource` выключены по умолчанию, то
 * есть в публикацию сознательно не уходят ровно те поля, которые коллекционеру
 * ценнее всего. Хранить на сервере полные данные, а показывать урезанные,
 * значило бы нарушить обещание из `CLAUDE.md`, оставив в интерфейсе видимость
 * его соблюдения. Поэтому сохранность живёт отдельно и целиком на устройстве:
 * файл никуда не отправляется.
 *
 * Формат — `.zip`: описание коллекции одним JSON плюс фотографии отдельными
 * файлами. Не JSON с base64 внутри: фотографии сорока растений дали бы файл
 * на треть больше нужного, и его пришлось бы целиком держать в памяти строкой.
 */

import { plantsRepository } from './repositories/plantsRepository'
import { photosRepository } from './repositories/photosRepository'
import { createZip, readZip } from './zip'
import type { Plant } from './models/plant'

/** Имя описания внутри архива. */
const MANIFEST = 'collection.json'

/** Папка с фотографиями внутри архива. */
const PHOTOS_DIR = 'photos/'

/**
 * Метка формата. Проверяется при восстановлении, чтобы на попытку загрузить
 * чужой архив ответить понятным сообщением, а не разбором мусора.
 */
const FORMAT = 'myplants-backup'

/** Версия описания. Пригодится, когда модель растения изменится. */
const VERSION = 1

interface Manifest {
  format: string
  version: number
  exportedAt: string
  plants: Plant[]
}

export interface BackupResult {
  blob: Blob
  filename: string
  plants: number
  photos: number
}

/**
 * Собрать резервную копию.
 *
 * Фотографии читаются сырыми блобами через `getBlobById`, а не object URL:
 * указатель здесь бесполезен, нужны сами байты. Отсюда и отсутствие возни с
 * освобождением — освобождать нечего.
 *
 * Пропавшая фотография не роняет выгрузку. Ключ есть, а блоба нет — такое
 * бывает после сбоя, и потерять из-за одной битой ссылки всю копию было бы
 * обиднее, чем выгрузить коллекцию без неё. Ключ при этом убирается из
 * описания, чтобы восстановление не искало то, чего в архиве нет.
 */
export async function createBackup(now: Date): Promise<BackupResult> {
  const plants = await plantsRepository.getAll()

  const files: { name: string; data: Uint8Array }[] = []
  const exported: Plant[] = []
  let photoCount = 0

  for (const plant of plants) {
    const keys: string[] = []

    for (const key of plant.photos ?? []) {
      try {
        const blob = await photosRepository.getBlobById(key)
        const bytes = new Uint8Array(await blob.arrayBuffer())
        files.push({ name: `${PHOTOS_DIR}${key}.jpg`, data: bytes })
        keys.push(key)
        photoCount += 1
      } catch (error) {
        console.warn(`Фотография ${key} недоступна, в копию не попадёт:`, error)
      }
    }

    exported.push({ ...plant, photos: keys })
  }

  const manifest: Manifest = {
    format: FORMAT,
    version: VERSION,
    exportedAt: now.toISOString(),
    plants: exported,
  }

  files.unshift({
    name: MANIFEST,
    data: new TextEncoder().encode(JSON.stringify(manifest, null, 2)),
  })

  const zip = createZip(files, now)

  return {
    // Копия в новый массив: `createZip` отдаёт представление над своим буфером,
    // и передавать его в Blob как есть — значит зависеть от того, что буфер
    // больше никто не тронет.
    blob: new Blob([zip.slice()], { type: 'application/zip' }),
    filename: `myplants-backup-${now.toISOString().slice(0, 10)}.zip`,
    plants: exported.length,
    photos: photoCount,
  }
}

export interface RestoreResult {
  /** Сколько растений добавлено. */
  added: number
  /** Сколько пропущено, потому что уже есть на устройстве. */
  skipped: number
  /** Сколько фотографий записано. */
  photos: number
  /** Названия растений, у которых в архиве не нашлось фотографий. */
  missingPhotos: string[]
}

/**
 * Восстановить коллекцию из файла.
 *
 * **Восстановление добавляет, а не заменяет.** Коллекция на устройстве не
 * стирается ни при каком исходе: человек мог выбрать файл по ошибке, и
 * потерять из-за этого живые данные — худшее, что может сделать средство
 * сохранности.
 *
 * Растения различаются по id, поэтому повторная загрузка того же файла ничего
 * не делает: все записи уже на месте, все пропущены. Это же позволяет свести
 * две половины коллекции с разных устройств.
 */
export async function restoreBackup(file: Blob): Promise<RestoreResult> {
  const entries = readZip(new Uint8Array(await file.arrayBuffer()))

  const manifestEntry = entries.find((entry) => entry.name === MANIFEST)
  if (!manifestEntry) {
    throw new Error('This zip is not a MyPlants backup: collection.json is missing')
  }

  let manifest: Manifest
  try {
    manifest = JSON.parse(new TextDecoder().decode(manifestEntry.data)) as Manifest
  } catch {
    throw new Error('The backup description is damaged and cannot be read')
  }

  if (manifest.format !== FORMAT) {
    throw new Error('This zip is not a MyPlants backup')
  }
  if (typeof manifest.version !== 'number' || manifest.version > VERSION) {
    throw new Error('This backup was made by a newer version of the app')
  }
  if (!Array.isArray(manifest.plants)) {
    throw new Error('The backup description is damaged: no plants inside')
  }

  // Фотографии из архива — по ключу, каким он записан у растения. Папки
  // архиваторы пишут отдельными записями нулевой длины, их отбрасываем.
  const photos = new Map<string, Uint8Array>()
  for (const entry of entries) {
    if (!entry.name.startsWith(PHOTOS_DIR) || entry.data.length === 0) continue
    const key = entry.name.slice(PHOTOS_DIR.length).replace(/\.jpg$/, '')
    if (key) photos.set(key, entry.data)
  }

  const result: RestoreResult = { added: 0, skipped: 0, photos: 0, missingPhotos: [] }

  for (const raw of manifest.plants) {
    const plant = validatePlant(raw)
    if (!plant) continue

    // Фотографии пишутся до растения: если запись растения не удастся, в базе
    // останутся осиротевшие блобы — неприятно, но безобидно. Обратный порядок
    // дал бы растение со ссылками в пустоту, то есть видимую поломку.
    const written: string[] = []
    for (const key of plant.photos) {
      const data = photos.get(key)
      if (!data) continue
      await photosRepository.restorePhoto(key, new Blob([data.slice()], { type: 'image/jpeg' }))
      written.push(key)
      result.photos += 1
    }

    if (written.length < plant.photos.length) result.missingPhotos.push(plant.name)

    const stored = await plantsRepository.restore({ ...plant, photos: written })
    if (stored) result.added += 1
    else result.skipped += 1
  }

  return result
}

/**
 * Проверить запись из архива.
 *
 * Файл человек выбирает руками, и он может быть подправлен, обрезан или собран
 * чем угодно. Молча положить в базу растение без названия или с ценой строкой
 * значит получить сломанный экран позже и не понять, откуда.
 *
 * @returns запись с приведёнными полями, либо null — такую пропускаем
 */
function validatePlant(raw: unknown): Plant | null {
  if (!raw || typeof raw !== 'object') return null
  const value = raw as Record<string, unknown>

  const id = typeof value.id === 'string' ? value.id.trim() : ''
  const name = typeof value.name === 'string' ? value.name.trim() : ''
  const price = typeof value.price === 'number' && Number.isFinite(value.price) ? value.price : null

  if (!id || !name || price === null) {
    console.warn('Запись в копии пропущена: нет id, названия или цены', raw)
    return null
  }

  const text = (field: unknown) =>
    typeof field === 'string' && field.trim() ? field.trim() : undefined

  const iso = (field: unknown) =>
    typeof field === 'string' && !Number.isNaN(Date.parse(field)) ? field : new Date().toISOString()

  return {
    id,
    name,
    price,
    photos: Array.isArray(value.photos) ? value.photos.filter((k): k is string => typeof k === 'string') : [],
    species: text(value.species),
    acquiredOn: text(value.acquiredOn),
    source: text(value.source),
    notes: text(value.notes),
    createdAt: iso(value.createdAt),
    updatedAt: iso(value.updatedAt),
  }
}
