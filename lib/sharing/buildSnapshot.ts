/**
 * Сборка заготовки снимка из локальной коллекции.
 *
 * Единственное место, где локальная модель превращается в то, что уедет на
 * сервер. Всё, что не перечислено здесь явно, не уезжает — поэтому добавление
 * поля в `Plant` не приводит к его молчаливой публикации.
 */

import type { Plant } from '../models/plant'
import { normalizeSpeciesInput } from '../species'
import {
  DEFAULT_PUBLISH_OPTIONS,
  SNAPSHOT_VERSION,
  type CollectionSnapshotDraft,
  type PublishOptions,
  type SnapshotDraftPlant,
} from './types'

interface BuildOptions {
  title?: string
  /** Чего не передали — считается выключенным. */
  options?: Partial<PublishOptions>
}

/**
 * Собрать заготовку снимка.
 *
 * Растения без фотографий отбрасываются: публичная страница — витрина, и
 * карточка с «No photo» её только портит. Это отражено в возвращаемом
 * `skipped`, чтобы диалог публикации мог сказать об этом вслух, а не молча
 * потерять часть коллекции.
 *
 * @param plants - коллекция как она лежит в IndexedDB
 * @returns заготовка и список отброшенных названий
 */
export function buildSnapshotDraft(
  plants: Plant[],
  { title, options }: BuildOptions = {}
): { draft: CollectionSnapshotDraft; skipped: string[] } {
  const publishOptions: PublishOptions = { ...DEFAULT_PUBLISH_OPTIONS, ...options }

  const skipped: string[] = []
  const publishable: Plant[] = []

  for (const plant of plants) {
    if (!plant.photos || plant.photos.length === 0) {
      skipped.push(plant.name)
      continue
    }
    publishable.push(plant)
  }

  const draftPlants: SnapshotDraftPlant[] = publishable.map((plant, index) => {
    const draftPlant: SnapshotDraftPlant = {
      name: plant.name.trim(),
      photoKeys: [...plant.photos],
      position: index,
    }

    // Необязательные поля добавляются только когда есть что добавить: пустая
    // строка и undefined в JSON выглядят по-разному, а значат одно и то же.
    const species = plant.species && normalizeSpeciesInput(plant.species)
    if (species) draftPlant.species = species

    if (plant.acquiredOn) draftPlant.acquiredOn = plant.acquiredOn

    if (publishOptions.includePrices) draftPlant.price = plant.price

    if (publishOptions.includeSource) {
      const source = plant.source?.trim()
      if (source) draftPlant.source = source
    }

    if (publishOptions.includeNotes) {
      const notes = plant.notes?.trim()
      if (notes) draftPlant.notes = notes
    }

    return draftPlant
  })

  const draft: CollectionSnapshotDraft = {
    version: SNAPSHOT_VERSION,
    options: publishOptions,
    plants: draftPlants,
  }

  // Единственный флаг, который едет значением, а не отсутствием полей
  if (publishOptions.allowIndexing) draft.allowIndexing = true

  const trimmedTitle = title?.trim()
  if (trimmedTitle) draft.title = trimmedTitle

  // Сумма считается по тому, что действительно уезжает, а не по всей
  // коллекции: иначе по опубликованной части и общей сумме можно было бы
  // вычислить стоимость скрытого.
  if (publishOptions.includePrices) {
    draft.totalPrice = publishable.reduce((sum, plant) => sum + plant.price, 0)
  }

  return { draft, skipped }
}
