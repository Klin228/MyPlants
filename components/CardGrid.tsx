'use client'

/**
 * Кладка для карточек разной высоты.
 *
 * Понадобилась вместе с родной пропорцией фотографии (тикет X5): у карточек больше
 * нет общей высоты, а обычная сетка выравнивает строки по самой высокой карточке и
 * оставляет под короткими дыры.
 *
 * **Кладки в CSS нет.** Проверено в Chrome 148 прямо на машине разработки:
 * `CSS.supports('grid-template-rows', 'masonry')` — false, `item-flow` — тоже.
 * Поэтому раскладка своя.
 *
 * Как устроено и почему именно так:
 *
 * - **Колонки — обычные флексы, карточки в них раскладываются потоком.** Без
 *   абсолютного позиционирования: не надо мерить каждую карточку, не надо
 *   пересчитывать раскладку при загрузке фотографий, поиске и фильтре.
 * - **Высота карточки предсказывается, а не измеряется.** Пропорция обложки
 *   известна заранее, ширина колонки тоже, а тело карточки почти постоянно —
 *   этого хватает, чтобы разложить карточки по колонкам ровно. Ошибка предсказания
 *   (длинное название в две строки) делает колонки чуть неравными, но не двигает
 *   ничего после отрисовки.
 * - **Меряется ровно одна величина — ширина контейнера**, и то через
 *   `ResizeObserver`, а не по событию окна: контейнер сужается и без изменения
 *   размера окна (например когда появляется полоса прокрутки).
 * - **Порядок сохраняется настолько, насколько это возможно.** Карточка уходит в
 *   самую короткую колонку, поэтому первые N попадают в разные колонки, и первый
 *   ряд читается слева направо, как в обычной сетке.
 *
 * Цена, которую стоит назвать: в DOM карточки идут по колонкам, а не по рядам, —
 * значит скринридер и таб проходят колонку целиком, потом следующую. Для списка
 * независимых карточек это терпимо (так же устроен Pinterest), но это цена.
 */

import { useEffect, useRef, useState } from 'react'

/**
 * Сколько высоты добавляет тело карточки: название, вид, цена, ряд действий.
 *
 * Замерено на настоящей карточке (341 пиксель фотографии при высоте 522), а не
 * взято на глаз. Число участвует только в раскладке по колонкам: ошибка в
 * несколько пикселей меняет распределение, а не вид карточки.
 */
const CARD_BODY_HEIGHT = 181

/** Столько же, сколько у `--card-min` и `--space-lg` в `globals.css`. */
const CARD_MIN_WIDTH = 320
const GAP = 16

export interface CardGridItem {
  key: string
  /** Ширина, поделённая на высоту. Из `lib/photoRatio.ts`. */
  ratio: number
  node: React.ReactNode
}

export default function CardGrid({ items }: { items: CardGridItem[] }) {
  const containerRef = useRef<HTMLDivElement>(null)
  /**
   * Сколько колонок и какой ширины. `null` — ещё не мерили.
   *
   * До измерения рисуем одну колонку: это тот же вид, что на телефоне, и он верен
   * для самого узкого экрана. Обратный выбор (сразу три) на телефоне дал бы
   * заметный перескок раскладки на первом кадре.
   *
   * Обе величины в одном состоянии, а не читаются из DOM при отрисовке: чтение
   * геометрии посреди рендера делает результат зависящим от того, когда React
   * решил перерисовать.
   */
  const [layout, setLayout] = useState<{ columns: number; columnWidth: number } | null>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const measure = (width: number) => {
      if (width <= 0) return
      // Та же арифметика, что у `repeat(auto-fill, minmax(320px, 1fr))`
      const columns = Math.max(1, Math.floor((width + GAP) / (CARD_MIN_WIDTH + GAP)))
      setLayout({ columns, columnWidth: (width - GAP * (columns - 1)) / columns })
    }

    measure(container.getBoundingClientRect().width)

    if (typeof ResizeObserver === 'undefined') return

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) measure(entry.contentRect.width)
    })
    observer.observe(container)

    return () => observer.disconnect()
  }, [])

  const columnCount = layout?.columns ?? 1
  const columnWidth = layout?.columnWidth ?? CARD_MIN_WIDTH
  const buckets: CardGridItem[][] = Array.from({ length: columnCount }, () => [])
  const heights = new Array<number>(columnCount).fill(0)

  for (const item of items) {
    let shortest = 0
    for (let i = 1; i < columnCount; i++) {
      if (heights[i] < heights[shortest]) shortest = i
    }

    buckets[shortest].push(item)
    heights[shortest] += columnWidth / item.ratio + CARD_BODY_HEIGHT + GAP
  }

  return (
    <div ref={containerRef} className="masonry">
      {buckets.map((bucket, index) => (
        <div key={index} className="masonry-column">
          {bucket.map((item) => (
            <div key={item.key} className="masonry-cell">
              {item.node}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
