/**
 * Публикация коллекции: от локальных данных до готовой ссылки.
 *
 * Три шага, каждый уже написан отдельно: собрать заготовку снимка (C2),
 * загрузить фотографии (C3), отправить снимок на сервер (этот файл).
 */

import type { Plant } from '../models/plant'
import { buildSnapshotDraft } from './buildSnapshot'
import { validateDraft } from './limits'
import { forgetPublication, readPublication, savePublication, type Publication } from './publication'
import { uploadDraftPhotos, type UploadCallbacks, type UploadProgress } from './uploadPhotos'
import type { PublishOptions } from './types'
import { track } from '../analytics'

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

  /*
   * Пределы проверяются здесь — до `uploadDraftPhotos`, а не только на сервере
   * после него.
   *
   * Порядок был обратный, и коллекция из 101 растения означала несколько минут
   * уменьшения, десятки мегабайт трафика и «Too many plants» в конце. Файлы при
   * этом уже лежали в хранилище и не удалялись ничем (X6). Проверка идёт до
   * `publish_started`: работа не началась, и записывать начало нечего.
   */
  const check = validateDraft(draft)
  if (!check.ok) throw new Error(check.error)

  /*
   * Что эта попытка успела залить в хранилище.
   *
   * Собирается по ходу, а не в конце: если публикация сорвётся на середине
   * загрузки, в конец мы не попадём — а убрать за собой надо именно то, что
   * уехало (тикет X6).
   */
  const uploaded: string[] = []

  const uploadCallbacks: UploadCallbacks = {
    signal,
    onProgress: (progress) => onProgress?.({ ...progress, stage: progress.phase }),
    onUploaded: (path) => uploaded.push(path),
  }

  track({ name: 'publish_started', plants: draft.plants.length })

  try {
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
      // Сколько уехало — диалог следующей публикации скажет, что изменилось (X3)
      plants: draft.plants.length,
      ...(title?.trim() ? { title: title.trim() } : {}),
    }

    savePublication(publication)

    track({
      name: 'publish_completed',
      plants: draft.plants.length,
      photos: draft.plants.reduce((sum, plant) => sum + plant.photoKeys.length, 0),
    })

    return { publication, skipped, updated: Boolean(existing) && saved.reusedExisting }
  } catch (error) {
    // Публикация не состоялась — просим сервер убрать залитое. Отдельно от
    // `throw`: человек должен увидеть настоящую причину отказа, а не то, как
    // прошла уборка.
    await discardUploaded(uploaded)
    throw error
  }
}

/**
 * Попросить сервер убрать файлы сорвавшейся публикации.
 *
 * Ничего не выбрасывает и никого не ждёт дольше нужного: это уборка следов уже
 * провалившегося действия. Решает сервер — он удалит только те пути, на которые
 * не ссылается ни одна живая коллекция, поэтому список безопасно посылать целиком
 * (см. `app/api/publish/photos/discard/route.ts`).
 */
async function discardUploaded(paths: string[]): Promise<void> {
  if (paths.length === 0) return

  try {
    const response = await fetch('/api/publish/photos/discard', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ paths: [...new Set(paths)] }),
    })

    if (!response.ok) {
      console.warn(`Не удалось убрать файлы сорванной публикации: HTTP ${response.status}`)
    }
  } catch (error) {
    // Сеть могла отвалиться — она и была причиной отказа. Файлы останутся
    // мусором в хранилище, но следующая публикация тех же фотографий их
    // подберёт: путь это хеш содержимого.
    console.warn('Не удалось убрать файлы сорванной публикации:', error)
  }
}

export interface RevokeResult {
  /** Сколько файлов убрано из хранилища */
  deletedFiles: number
  /** Коллекции уже не было: запись на устройстве отстала от действительности */
  alreadyGone: boolean
}

/**
 * Отозвать публикацию.
 *
 * Локальная запись стирается в любом случае, когда сервер сказал «этого
 * больше нет» — включая случай, когда коллекции уже не было. Оставить запись
 * значило бы навсегда запереть владельца в состоянии, из которого он не может
 * ни обновить публикацию, ни отозвать её.
 */
export async function revokePublication(): Promise<RevokeResult> {
  const publication = readPublication()
  if (!publication) throw new Error('Nothing to revoke: no publication on this device')

  const response = await fetch('/api/publish/revoke', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      collectionId: publication.id,
      revokeToken: publication.revokeToken,
    }),
  })

  if (!response.ok) {
    const { error } = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(error ?? `Could not revoke (HTTP ${response.status})`)
  }

  const { deletedFiles, alreadyGone } = (await response.json()) as {
    deletedFiles?: number
    alreadyGone?: boolean
  }

  forgetPublication()

  return { deletedFiles: deletedFiles ?? 0, alreadyGone: alreadyGone ?? false }
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
