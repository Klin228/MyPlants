/**
 * Публикация коллекции: от локальных данных до готовой ссылки.
 *
 * Три шага, каждый уже написан отдельно: собрать заготовку снимка (C2),
 * загрузить фотографии (C3), отправить снимок на сервер (этот файл).
 */

import type { Plant } from '../models/plant'
import { buildSnapshotDraft } from './buildSnapshot'
import { forgetPublication, readPublication, savePublication, type Publication } from './publication'
import { uploadDraftPhotos, type UploadCallbacks, type UploadProgress } from './uploadPhotos'
import type { PublishOptions } from './types'

export interface PublishRequest {
  plants: Plant[]
  title?: string
  options: PublishOptions
}

export interface PublishResult {
  publication: Publication
  /** Названия растений, не попавших в публикацию из-за отсутствия фотографий */
  skipped: string[]
  /** Впервые опубликовано или обновлена существующая ссылка */
  updated: boolean
}

export type PublishStage = UploadProgress['phase'] | 'saving'

export interface PublishProgress {
  stage: PublishStage
  done: number
  total: number
  reused: number
}

export interface PublishCallbacks {
  onProgress?: (progress: PublishProgress) => void
  signal?: AbortSignal
}

/**
 * Опубликовать коллекцию.
 *
 * Если на устройстве есть запись о прошлой публикации, обновляется она же —
 * адрес не меняется. Это решение из `DECISIONS.md`: ссылку могли уже куда-то
 * отправить.
 */
export async function publishCollection(
  { plants, title, options }: PublishRequest,
  { onProgress, signal }: PublishCallbacks = {}
): Promise<PublishResult> {
  const { draft, skipped } = buildSnapshotDraft(plants, { title, options })

  if (draft.plants.length === 0) {
    throw new Error('Nothing to publish: none of the plants has a photo')
  }

  const uploadCallbacks: UploadCallbacks = {
    signal,
    onProgress: (progress) => onProgress?.({ ...progress, stage: progress.phase }),
  }

  const snapshot = await uploadDraftPhotos(draft, uploadCallbacks)

  const photoCount = draft.plants.reduce((sum, plant) => sum + plant.photoKeys.length, 0)
  onProgress?.({ stage: 'saving', done: photoCount, total: photoCount, reused: 0 })

  const existing = readPublication()

  let saved = await send(snapshot, existing, signal)

  // Запись на устройстве может ссылаться на коллекцию, которой уже нет: её
  // отозвали с другого устройства или удалили. Без этой ветки такой
  // пользователь не смог бы опубликовать коллекцию больше никогда — сервер
  // отвечал бы «не найдено» на каждую попытку обновить призрак.
  if (!saved.ok && existing && (saved.status === 404 || saved.status === 403)) {
    forgetPublication()
    saved = await send(snapshot, null, signal)
  }

  if (!saved.ok) {
    throw new Error(saved.error ?? `Publishing failed (HTTP ${saved.status})`)
  }

  const { id, revokeToken } = saved

  const publication: Publication = {
    id,
    revokeToken,
    publishedAt: new Date().toISOString(),
    options,
    ...(title?.trim() ? { title: title.trim() } : {}),
  }

  savePublication(publication)

  return { publication, skipped, updated: Boolean(existing) && saved.reusedExisting }
}

type SendResult =
  | { ok: true; id: string; revokeToken: string; reusedExisting: boolean }
  | { ok: false; status: number; error?: string }

async function send(
  snapshot: unknown,
  existing: Publication | null,
  signal?: AbortSignal
): Promise<SendResult> {
  const response = await fetch('/api/publish', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    signal,
    body: JSON.stringify({
      snapshot,
      collectionId: existing?.id,
      revokeToken: existing?.revokeToken,
    }),
  })

  if (!response.ok) {
    const { error } = (await response.json().catch(() => ({}))) as { error?: string }
    return { ok: false, status: response.status, error }
  }

  const { id, revokeToken } = (await response.json()) as { id: string; revokeToken: string }
  return { ok: true, id, revokeToken, reusedExisting: Boolean(existing) }
}
