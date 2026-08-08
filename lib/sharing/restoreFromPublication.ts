/**
 * Восстановить коллекцию из своей публичной ссылки.
 *
 * Частичный путь, и это не оговорка мелким шрифтом, а суть. Три флага
 * публикации выключены по умолчанию, то есть в снимке сознательно нет ровно
 * тех полей, которые коллекционеру ценнее всего: цен, заметок, источника.
 * Вернётся то, что публиковалось: названия, виды, даты приобретения и
 * фотографии.
 *
 * Полный путь — резервная копия в файл, `lib/backup.ts`. Этот способ для
 * случая, когда файла нет, а ссылка есть: устройство потеряно, копию сделать
 * не успели.
 */

import { plantsRepository } from '../repositories/plantsRepository'
import { photosRepository } from '../repositories/photosRepository'
import type { Plant } from '../models/plant'

interface PublishedPlant {
  name: string
  species?: string
  price?: number
  acquiredOn?: string
  source?: string
  notes?: string
  position: number
  photos: string[]
}

interface PublishedCollection {
  id: string
  title: string | null
  plants: PublishedPlant[]
}

export interface PublicationPreview {
  id: string
  title: string | null
  plants: number
  photos: number
  /** Какие поля в этой публикации есть — по ним видно, что вернётся. */
  hasPrices: boolean
  hasNotes: boolean
  hasSource: boolean
}

export interface PublicationRestoreResult {
  added: number
  skipped: number
  photos: number
  /** Растения, у которых не удалось скачать хотя бы одну фотографию. */
  photoFailures: string[]
  /** Цены не публиковались — восстановлены нулями. */
  pricesMissing: boolean
}

/**
 * Вытащить идентификатор коллекции из того, что человек вставил в поле.
 *
 * Принимаем и полный адрес, и один идентификатор: человек может скопировать
 * ссылку целиком, а может — то, что запомнил. Чужой домен не отвергаем: ссылка
 * могла быть выдана с адреса развёртывания, а не с боевого, и придираться к
 * домену значит отказать человеку в восстановлении из-за формальности.
 */
export function parseCollectionId(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  // Похоже на адрес — берём последний непустой отрезок пути после /c/
  const match = trimmed.match(/\/c\/([A-Za-z0-9_-]+)/)
  if (match) return match[1]

  // Иначе это должен быть сам идентификатор: те же символы, что генерирует
  // `newPublicId`, и разумная длина — чтобы не идти на сервер за мусором.
  return /^[A-Za-z0-9_-]{10,64}$/.test(trimmed) ? trimmed : null
}

async function fetchCollection(id: string): Promise<PublishedCollection> {
  const response = await fetch(`/api/collections/${encodeURIComponent(id)}`)

  if (response.status === 404) {
    throw new Error('No published collection at this link. It may have been removed.')
  }
  if (!response.ok) {
    const { error } = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(error ?? `Could not read the collection (HTTP ${response.status})`)
  }

  const data = (await response.json()) as PublishedCollection
  if (!Array.isArray(data.plants)) throw new Error('The server returned something unexpected')

  return data
}

/**
 * Посмотреть, что лежит по ссылке, ничего не записывая.
 *
 * Отдельным шагом намеренно: человек должен увидеть, сколько растений придёт и
 * каких полей в публикации не было, **до** того как что-то попадёт в его
 * коллекцию. «Вернётся не всё» набранное заранее — обещание; то же, посчитанное
 * по его собственной публикации, — факт.
 */
export async function previewPublication(input: string): Promise<PublicationPreview> {
  const id = parseCollectionId(input)
  if (!id) throw new Error('This does not look like a collection link')

  const data = await fetchCollection(id)

  return {
    id: data.id,
    title: data.title,
    plants: data.plants.length,
    photos: data.plants.reduce((sum, plant) => sum + plant.photos.length, 0),
    hasPrices: data.plants.some((plant) => typeof plant.price === 'number'),
    hasNotes: data.plants.some((plant) => Boolean(plant.notes)),
    hasSource: data.plants.some((plant) => Boolean(plant.source)),
  }
}

/**
 * Восстановить.
 *
 * **Идентификатор растения выводится из идентификатора публикации и позиции.**
 * В снимке локальных `id` нет намеренно — они не нужны серверу, — поэтому взять
 * их оттуда нельзя, а придумывать новые каждый раз значило бы, что вторая
 * попытка восстановления заведёт полную копию коллекции. Пара «публикация плюс
 * место в ней» устойчива, и повторное восстановление по той же ссылке ничего не
 * делает.
 *
 * Оговорка, которую стоит знать: если владелец опубликует ту же коллекцию
 * заново в другом порядке, позиции сдвинутся и восстановление увидит другие
 * растения. Для основного случая — «потерял устройство, восстанавливаю по своей
 * ссылке» — это не мешает.
 */
export async function restoreFromPublication(input: string): Promise<PublicationRestoreResult> {
  const id = parseCollectionId(input)
  if (!id) throw new Error('This does not look like a collection link')

  const data = await fetchCollection(id)
  const now = new Date().toISOString()

  const result: PublicationRestoreResult = {
    added: 0,
    skipped: 0,
    photos: 0,
    photoFailures: [],
    pricesMissing: false,
  }

  for (const published of data.plants) {
    if (!published.name?.trim()) continue

    // Не `id`: внешний `id` — это идентификатор публикации, затенять его здесь
    // значило бы сбивать читателя на разнице в одну букву.
    const plantId = `pub_${data.id}_${published.position}`

    /*
     * Проверяем, что растения ещё нет, ДО скачивания фотографий.
     *
     * Иначе повторное восстановление по той же ссылке качало бы все фотографии
     * заново и записывало их в базу, а растение пропускало — блобы оставались
     * осиротевшими, и каждый повтор добавлял к занятому месту всю коллекцию.
     * Найдено замером: второй проход сообщал «Restored 0 plants with 6 photos»,
     * то есть шесть блобов записал впустую.
     */
    if (await plantsRepository.getById(plantId)) {
      result.skipped += 1
      continue
    }

    const keys: string[] = []
    let failed = false

    for (const url of published.photos) {
      try {
        const response = await fetch(url)
        if (!response.ok) throw new Error(`HTTP ${response.status}`)

        const blob = await response.blob()
        // Ключ придумывает репозиторий: это новая местная фотография, и путь в
        // хранилище к ней отношения не имеет.
        keys.push(await photosRepository.addPhoto('restored', blob))
        result.photos += 1
      } catch (error) {
        console.warn(`Фотография ${url} не скачалась:`, error)
        failed = true
      }
    }

    if (failed) result.photoFailures.push(published.name)

    /*
     * Цена в модели обязательна числом, а в публикации её могло не быть вовсе.
     * Ноль — не догадка о настоящей цене, а признак «не публиковалось»; человеку
     * об этом говорится прямо, чтобы он не решил, что растение досталось даром.
     */
    if (typeof published.price !== 'number') result.pricesMissing = true

    const plant: Plant = {
      id: plantId,
      name: published.name.trim(),
      species: published.species?.trim() || undefined,
      photos: keys,
      // Раньше здесь стоял ноль — цена была обязательной, и деться было некуда.
      // Теперь «не указана» выражается прямо (J5), и восстановленная коллекция
      // больше не утверждает, что все растения достались даром.
      price: typeof published.price === 'number' ? published.price : undefined,
      acquiredOn: published.acquiredOn || undefined,
      source: published.source?.trim() || undefined,
      notes: published.notes?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    }

    if (await plantsRepository.restore(plant)) result.added += 1
    else result.skipped += 1
  }

  return result
}
