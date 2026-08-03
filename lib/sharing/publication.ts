/**
 * Память о том, что коллекция опубликована.
 *
 * Хранится на устройстве, потому что аккаунтов нет. Здесь лежит токен отзыва —
 * единственное доказательство права снять публикацию или обновить её, не меняя
 * адреса. Потерять эту запись значит потерять управление ссылкой: она
 * продолжит работать, а убрать её будет нечем.
 *
 * Поэтому `localStorage`, а не состояние React и не сессия: запись должна
 * пережить и перезагрузку, и закрытие вкладки.
 */

import type { PublishOptions } from './types'

const STORAGE_KEY = 'plant-collection-publication'

export interface Publication {
  id: string
  revokeToken: string
  /** Когда публиковали в последний раз, ISO 8601 */
  publishedAt: string
  /** С какими разрешениями — чтобы диалог открылся с прошлым выбором */
  options: PublishOptions
  title?: string
  /**
   * Сколько растений уехало в прошлый раз.
   *
   * Нужно диалогу повторной публикации: он говорит, сколько уедет сейчас, и если
   * число изменилось — чем именно обновление будет отличаться (тикет X3). Без
   * этого «уже опубликовано» скрывало ровно ту цифру, которая при обновлении и
   * интересна.
   *
   * Необязательное: у записей, сделанных до X3, поля нет, и диалог просто не
   * сравнивает. Никуда не уходит — лежит рядом с токеном в `localStorage`.
   */
  plants?: number
}

export function readPublication(): Publication | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null

    const value = JSON.parse(raw) as Publication
    // Без этих двух полей запись бесполезна, а битую лучше считать отсутствующей
    if (!value?.id || !value?.revokeToken) return null

    return value
  } catch {
    return null
  }
}

export function savePublication(publication: Publication): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(publication))
}

export function forgetPublication(): void {
  localStorage.removeItem(STORAGE_KEY)
}

/** Полный адрес публикации — то, что показывают и копируют. */
export function publicationUrl(id: string): string {
  return `${location.origin}/c/${id}`
}
