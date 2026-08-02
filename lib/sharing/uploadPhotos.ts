/**
 * Загрузка фотографий коллекции и превращение заготовки снимка в снимок.
 *
 * Запускается в браузере: только там есть IndexedDB с оригиналами и canvas,
 * которым их уменьшать. Сервер участвует ровно дважды — выдаёт токен на путь
 * и говорит, что уже загружено.
 */

import { putBlob } from './blobUpload'
import { photosRepository } from '../repositories/photosRepository'
import { hashBlob, PUBLIC_PHOTO_MAX_SIZE, resizeToJpeg } from '../images'
import { publicPhotoPath } from './photoPaths'
import type {
  CollectionSnapshot,
  CollectionSnapshotDraft,
  SnapshotPhoto,
  SnapshotPlant,
} from './types'

const TOKEN_ENDPOINT = '/api/publish/photos'

export type UploadPhase = 'preparing' | 'checking' | 'uploading'

export interface UploadProgress {
  phase: UploadPhase
  /** Сколько фотографий обработано на текущем этапе */
  done: number
  /** Сколько всего фотографий в публикации */
  total: number
  /** Сколько не пришлось загружать: уже лежали в хранилище */
  reused: number
}

export interface UploadCallbacks {
  onProgress?: (progress: UploadProgress) => void
  /**
   * Прервать загрузку. Проверяется между фотографиями: отменить уже начатую
   * отправку одного файла нельзя, а вот не начинать следующую — можно.
   */
  signal?: AbortSignal
}

/** Подготовленная к загрузке фотография: уменьшенная, посчитанная, с путём. */
interface PreparedPhoto {
  key: string
  path: string
  blob: Blob
  width: number
  height: number
}

/**
 * Загрузить фотографии заготовки и собрать готовый снимок.
 *
 * Порядок работы: сначала все фотографии уменьшаются и считаются их хеши,
 * потом одним запросом выясняется, чего в хранилище ещё нет, и только
 * недостающее уходит по сети. Так индикатор прогресса показывает правду —
 * «загружаю 3 из 30», а не «загружаю 30», когда двадцать девять уже там.
 *
 * Одинаковые фотографии внутри одной коллекции подготавливаются один раз:
 * ключи в IndexedDB у них разные, а содержимое одно, и в хранилище им
 * положено одно место.
 */
export async function uploadDraftPhotos(
  draft: CollectionSnapshotDraft,
  { onProgress, signal }: UploadCallbacks = {}
): Promise<CollectionSnapshot> {
  const allKeys = draft.plants.flatMap((plant) => plant.photoKeys)
  const total = allKeys.length

  const report = (phase: UploadPhase, done: number, reused: number) =>
    onProgress?.({ phase, done, total, reused })

  report('preparing', 0, 0)

  // Ключ → подготовленная фотография. Разные ключи с одинаковым содержимым
  // указывают на один и тот же объект: путь считается из содержимого.
  const prepared = new Map<string, PreparedPhoto>()
  const byPath = new Map<string, PreparedPhoto>()

  let processed = 0

  for (const key of allKeys) {
    throwIfAborted(signal)

    if (prepared.has(key)) {
      processed++
      report('preparing', processed, 0)
      continue
    }

    const original = await photosRepository.getBlobById(key)
    const resized = await resizeToJpeg(original, PUBLIC_PHOTO_MAX_SIZE)
    const hash = await hashBlob(resized.blob)
    const path = publicPhotoPath(hash)

    const photo: PreparedPhoto = {
      key,
      path,
      blob: resized.blob,
      width: resized.width,
      height: resized.height,
    }

    prepared.set(key, photo)
    if (!byPath.has(path)) byPath.set(path, photo)

    processed++
    report('preparing', processed, 0)
  }

  throwIfAborted(signal)

  const uniquePaths = [...byPath.keys()]
  report('checking', 0, 0)

  const existing = await fetchExistingPaths(uniquePaths, signal)
  const toUpload = uniquePaths.filter((path) => !existing.has(path))

  // Уже лежащие в хранилище считаются загруженными сразу: с точки зрения
  // пользователя работа по ним сделана.
  const reused = total - countKeysForPaths(prepared, toUpload)
  let uploaded = reused
  report('uploading', uploaded, reused)

  for (const path of toUpload) {
    throwIfAborted(signal)

    const photo = byPath.get(path)!
    await putBlob(TOKEN_ENDPOINT, path, photo.blob, signal)

    // Один путь может относиться к нескольким ключам — считаем все
    uploaded += countKeysForPaths(prepared, [path])
    report('uploading', uploaded, reused)
  }

  return {
    version: draft.version,
    ...(draft.title === undefined ? {} : { title: draft.title }),
    ...(draft.totalPrice === undefined ? {} : { totalPrice: draft.totalPrice }),
    ...(draft.allowIndexing ? { allowIndexing: true } : {}),
    plants: draft.plants.map((plant): SnapshotPlant => {
      const { photoKeys, ...rest } = plant
      const photos: SnapshotPhoto[] = photoKeys.map((key) => {
        const photo = prepared.get(key)!
        return { path: photo.path, width: photo.width, height: photo.height }
      })

      return { ...rest, photos }
    }),
  }
}

/**
 * Спросить сервер, какие пути уже загружены.
 *
 * Отказ проверки не должен ронять публикацию: не выяснили — значит загрузим
 * всё заново. Лишний трафик неприятен, потерянная публикация хуже.
 */
async function fetchExistingPaths(paths: string[], signal?: AbortSignal): Promise<Set<string>> {
  if (paths.length === 0) return new Set()

  try {
    const query = new URLSearchParams({ paths: paths.join(',') })
    const response = await fetch(`${TOKEN_ENDPOINT}?${query}`, { signal })
    if (!response.ok) return new Set()

    const { existing } = (await response.json()) as { existing?: string[] }
    return new Set(existing ?? [])
  } catch (error) {
    if (signal?.aborted) throw error
    console.warn('Не удалось проверить уже загруженные фотографии, загружаем все', error)
    return new Set()
  }
}

function countKeysForPaths(prepared: Map<string, PreparedPhoto>, paths: string[]): number {
  const wanted = new Set(paths)
  let count = 0
  for (const photo of prepared.values()) {
    if (wanted.has(photo.path)) count++
  }
  return count
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Publishing cancelled', 'AbortError')
}
