'use client'

/**
 * Лента фотографий внутри карточки растения.
 *
 * Этот файл долго значился переписанным — и в `CLAUDE.md`, и в `REVIEW.md`, —
 * а на деле оставался исходным и нарушал почти каждое правило, которое там
 * записано как решённое. Разбор в тикете D1, исправление здесь. Образцом при
 * переписывании служил `FullscreenPhotoViewer.tsx`: он был переписан
 * по-настоящему, и расходиться с ним двумя разными жестами в одном приложении
 * незачем.
 *
 * Что здесь важно и почему — по порядку, потому что каждый пункт когда-то был
 * сломан именно так:
 *
 * - **Object URL освобождаются.** `getByPlantId` возвращает указатели на
 *   блобы, а не копии, и владелец обязан их отпустить. Двадцать карточек в
 *   списке без этого держат в памяти всю коллекцию до перезагрузки вкладки.
 * - **Зависимость эффекта — по содержимому массива ключей.** `plant.photos`
 *   приходит новым массивом при каждом чтении из IndexedDB, поэтому `[photos]`
 *   перечитывает все фотографии на каждую перерисовку родителя.
 * - **Ось жеста выбирается один раз за касание.** Пошло вертикально — это
 *   прокрутка страницы, и мы больше не вмешиваемся. Без этого прокрутка ленты
 *   случайно открывала фото на весь экран.
 * - **Ни одного глобального слушателя.** Компонент рендерится списком:
 *   `window.addEventListener('keydown')` здесь означал двадцать слушателей и
 *   стрелку, листающую все карточки одновременно. Клавиатура работает через
 *   `onKeyDown` на самом контейнере — точки это настоящие кнопки, фокус на них
 *   попадает табом, и событие всплывает сюда.
 * - **Тап определяется по сдвигу и времени**, а не по отсутствию `touchmove`:
 *   на живом пальце дрожание есть всегда.
 * - **Лента следует за пальцем** во время жеста, а не прыгает на отпускании.
 */

import { useState, useRef, useEffect } from 'react'
import { photosRepository } from '@/lib/repositories/photosRepository'
import FullscreenPhotoViewer from './FullscreenPhotoViewer'

interface PhotoGalleryProps {
  photos: string[] // ключи фотографий в IndexedDB
  alt: string
  /**
   * Пропорция рамки — ширина, поделённая на высоту (тикет X5).
   *
   * Приходит от родителя, а не считается здесь: то же число нужно кладке для
   * предсказания высоты карточки, и считать его дважды из одних данных значит
   * однажды разойтись. Не передали — рамка возьмёт значение из токена.
   */
  ratio?: number
}

/** Пороги те же, что в просмотрщике: один жест не должен вести себя двояко. */
const SWIPE_THRESHOLD = 60
const TAP_SLOP = 10
const TAP_DURATION = 400
const FLICK_DURATION = 250
const FLICK_DISTANCE = 25

/**
 * `idle` — палец на экране, ось ещё не выбрана.
 * `swipe` — листаем ленту, горизонталь наша.
 * `scroll` — вертикаль, страница прокручивается сама, мы не мешаем.
 */
type Mode = 'idle' | 'swipe' | 'scroll'

export default function PhotoGallery({ photos, alt, ratio }: PhotoGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [photoUrls, setPhotoUrls] = useState<string[]>([])
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false)
  const [drag, setDrag] = useState(0)
  const [mode, setMode] = useState<Mode>('scroll')

  const gesture = useRef({ startX: 0, startY: 0, startTime: 0 })
  const dragRef = useRef(0)
  /**
   * Режим жеста хранится в ref, а состояние нужно только для отрисовки.
   *
   * Читать его из состояния нельзя, и это не вкусовщина: `touchstart` и
   * `touchend` — разные события, а между ними React может не успеть
   * перерисоваться. При быстром тапе обработчик отпускания видел режим от
   * предыдущего жеста и тап не срабатывал вовсе. Ref обновляется сразу.
   */
  const modeRef = useRef<Mode>('scroll')
  /**
   * Когда закончился последний жест. Нужно, чтобы `click`, который браузер
   * присылает после `touchend`, не открыл просмотрщик повторно вслед за тапом
   * и не открыл его вообще после свайпа.
   */
  const lastTouchEnd = useRef(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const photoKeys = photos.join('|')

  useEffect(() => {
    if (photos.length === 0) {
      setPhotoUrls([])
      return
    }

    let cancelled = false
    let created: string[] = []

    photosRepository
      .getByPlantId(photos)
      .then((urls) => {
        created = urls
        // Эффект успел отмениться, пока читали базу: показывать некому, а
        // указатели уже созданы — освобождаем сразу, иначе они утекут.
        if (cancelled) {
          photosRepository.revokeUrls(urls)
          return
        }
        setPhotoUrls(urls)
      })
      .catch((error) => {
        console.error('Error loading photos:', error)
        if (!cancelled) setPhotoUrls([])
      })

    return () => {
      cancelled = true
      photosRepository.revokeUrls(created)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoKeys])

  // Набор фотографий сменился — прежний индекс может указывать в пустоту
  useEffect(() => {
    setActiveIndex(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoKeys])

  const setDragValue = (value: number) => {
    dragRef.current = value
    setDrag(value)
  }

  const setModeValue = (value: Mode) => {
    modeRef.current = value
    setMode(value)
  }

  const goTo = (index: number) => {
    setActiveIndex(Math.min(Math.max(index, 0), photoUrls.length - 1))
  }

  const onTouchStart = (event: React.TouchEvent) => {
    // Второй палец — это щипок или что-то ещё, лента в этом не участвует
    if (event.touches.length !== 1) {
      setModeValue('scroll')
      return
    }

    const touch = event.touches[0]
    gesture.current = { startX: touch.clientX, startY: touch.clientY, startTime: Date.now() }
    setDragValue(0)
    setModeValue('idle')
  }

  const onTouchMove = (event: React.TouchEvent) => {
    if (event.touches.length !== 1) return

    const touch = event.touches[0]
    const dx = touch.clientX - gesture.current.startX
    const dy = touch.clientY - gesture.current.startY

    // Ось выбирается один раз и дальше не меняется. Пока сдвиг в пределах
    // дрожания — не решаем ничего: иначе первый же случайный пиксель по
    // вертикали объявил бы жест прокруткой, а по горизонтали — свайпом.
    if (modeRef.current === 'idle') {
      if (Math.abs(dx) < TAP_SLOP && Math.abs(dy) < TAP_SLOP) return
      setModeValue(Math.abs(dx) > Math.abs(dy) ? 'swipe' : 'scroll')
      return
    }

    if (modeRef.current !== 'swipe') return

    // На краях лента сопротивляется, а не уезжает в пустоту
    const atStart = activeIndex === 0 && dx > 0
    const atEnd = activeIndex === photoUrls.length - 1 && dx < 0
    setDragValue(atStart || atEnd ? dx / 3 : dx)
  }

  const onTouchEnd = () => {
    const dx = dragRef.current
    const elapsed = Date.now() - gesture.current.startTime
    const finishedMode = modeRef.current

    lastTouchEnd.current = Date.now()
    setDragValue(0)
    setModeValue('scroll')

    if (finishedMode === 'idle') {
      // Ось так и не выбралась, то есть палец почти не двигался. Короткое
      // касание — тап, долгое — удержание, и открывать по нему нечего.
      if (elapsed < TAP_DURATION) setIsFullscreenOpen(true)
      return
    }

    if (finishedMode !== 'swipe') return

    const width = containerRef.current?.clientWidth ?? 0
    const isFlick = elapsed < FLICK_DURATION && Math.abs(dx) > FLICK_DISTANCE
    const passed = Math.abs(dx) > Math.min(SWIPE_THRESHOLD, width * 0.22)
    if (!passed && !isFlick) return

    if (dx < 0) goTo(activeIndex + 1)
    else if (dx > 0) goTo(activeIndex - 1)
  }

  /**
   * Мышь. На тач-устройстве браузер присылает `click` вслед за `touchend`, и
   * без этой проверки свайп заканчивался открытием фотографии на весь экран.
   */
  const onClick = () => {
    if (Date.now() - lastTouchEnd.current < 500) return
    setIsFullscreenOpen(true)
  }

  /**
   * Стрелки работают, когда фокус внутри галереи — на одной из точек. Это и
   * есть разница с прежним `window.addEventListener`: слушатель живёт на
   * контейнере, поэтому соседние карточки в списке о нажатии не знают.
   */
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      goTo(activeIndex - 1)
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      goTo(activeIndex + 1)
    }
  }

  /*
   * Пропорция рамки — инлайновым свойством, и это оговорённое исключение из
   * правила «инлайновый style только для покадровых значений жеста»: значение
   * приходит из данных фотографии, классом его не выразить. Правило и исключение
   * записаны в `CLAUDE.md`.
   */
  const frameStyle =
    ratio === undefined ? undefined : ({ '--frame-ratio': String(ratio) } as React.CSSProperties)

  // Фотографии есть, но ещё читаются из базы: на их месте скелетон той же
  // пропорции. Надпись «Loading photos...» занимала другую высоту, и вёрстка
  // прыгала в момент подстановки картинки.
  if (photos.length > 0 && photoUrls.length === 0) {
    return (
      <div
        className="gallery-skeleton skeleton"
        style={frameStyle}
        aria-label="Loading photo"
        role="img"
      />
    )
  }

  // А это не загрузка, а факт: у растения нет ни одной фотографии. Пульсировать
  // тут нечему — ждать нечего.
  if (photos.length === 0) {
    return <div className="gallery-empty" style={frameStyle}>No photo</div>
  }

  const isSwiping = mode === 'swipe'

  return (
    <div ref={containerRef} className="gallery" style={frameStyle} onKeyDown={onKeyDown}>
      {/*
        Обработчики касаний висят на ленте, а не на контейнере. Точки —
        сиблинги ленты и лежат поверх неё, так что тап по точке до этих
        обработчиков не доходит. На контейнере они приняли бы такой тап за тап
        по фотографии и открыли бы просмотрщик вместе с переключением кадра.

        `touch-action` инлайном, а не в globals.css, — намеренно, рядом с
        обработчиками, которые от него зависят.
      */}
      <div
        className="gallery-track"
        style={{
          transform: `translate3d(calc(${-activeIndex * 100}% + ${drag}px), 0, 0)`,
          // Во время жеста лента идёт за пальцем без сглаживания, после —
          // доезжает сама.
          transition: isSwiping ? 'none' : 'transform 0.28s cubic-bezier(0.22, 0.61, 0.36, 1)',
          touchAction: 'pan-y',
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        {photoUrls.map((photoUrl, index) => (
          <div key={index} className="gallery-slide">
            {photoUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={photoUrl}
                alt={`${alt} — photo ${index + 1}`}
                onClick={onClick}
                draggable={false}
                decoding="async"
              />
            ) : (
              /*
               * Ключ есть, а блоба под ним нет: `getByPlantId` возвращает на
               * это место пустую строку, чтобы одна пропавшая фотография не
               * обрушила остальные. Раньше здесь оказывался `<img src="">`.
               */
              <span className="gallery-missing">Photo unavailable</span>
            )}
          </div>
        ))}
      </div>

      {photoUrls.length > 1 && (
        <div className="gallery-dots">
          {photoUrls.map((_, index) => (
            <button
              key={index}
              onClick={() => setActiveIndex(index)}
              className={`gallery-dot${activeIndex === index ? ' gallery-dot--active' : ''}`}
              aria-label={`Go to photo ${index + 1}`}
              aria-current={activeIndex === index}
            />
          ))}
        </div>
      )}

      {isFullscreenOpen && (
        <FullscreenPhotoViewer
          photos={photos}
          initialIndex={activeIndex}
          alt={alt}
          onClose={(lastIndex) => {
            setIsFullscreenOpen(false)
            // Закрыли на другой фотографии — карточка догоняет, иначе лента
            // остаётся на прежнем кадре и это выглядит как сбой.
            if (typeof lastIndex === 'number') goTo(lastIndex)
          }}
        />
      )}
    </div>
  )
}
