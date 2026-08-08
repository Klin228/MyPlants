'use client'

/**
 * Карточка растения в сетке (переделана в тикете G4).
 *
 * На лице осталось три вещи: фотография, название и цена. Вид, дата, источник и
 * заметки уехали на экран растения, действия — в меню «…».
 *
 * Так пришлось сделать не ради чистоты: в две колонки на телефоне карточке
 * остаётся около 170 пикселей ширины, и прежний ряд кнопок Edit с Delete съедал
 * половину этой ширины. Это отмена решения D4, где кнопки сознательно жили в теле
 * карточки, — причина отмены записана в `DECISIONS.md`.
 *
 * Что сохранено из прежнего устройства:
 *
 * - **удаление в два шага** — действие необратимо, вместе с растением уходят его
 *   фотографии; теперь вопрос задаётся внутри меню;
 * - **подтверждение не меняет высоту карточки** — оно занимает место того же
 *   меню, а не раскрывается под ним: выросший блок поднял бы всю колонку кладки;
 * - **свайп по фотографиям** работает как раньше, тап при этом ведёт на экран
 *   растения (`onTap` у галереи).
 */

import { useEffect, useRef } from 'react'
import { MoreHorizontal } from 'lucide-react'
import type { Plant } from '@/lib/models/plant'
import PhotoGallery from './PhotoGallery'

interface PlantCardProps {
  plant: Plant
  /** Возвращает `true`, если растение действительно удалено */
  onDelete: (plantId: string) => Promise<boolean>
  onEdit: (plant: Plant) => void
  /** Открыть растение — тап по фотографии или по названию. */
  onOpen: (plant: Plant) => void
  /**
   * Пропорция рамки фотографии (тикет X5). Считает её родитель: то же число
   * нужно кладке, чтобы предсказать высоту карточки до отрисовки.
   */
  ratio?: number
  /**
   * Открыто ли меню этой карточки — и как его открыть или закрыть.
   *
   * Состояние живёт у родителя намеренно: так открытым может быть **только одно**
   * меню на экран. Из этого следует то, ради чего это и сделано: слушатель Escape
   * существует в единственном экземпляре, а не по одному на карточку. Правило
   * `CLAUDE.md` о глобальных слушателях в списочных компонентах именно об этом —
   * двадцать карточек не должны давать двадцать слушателей.
   */
  menuOpen: boolean
  onMenuToggle: (open: boolean) => void
  /** Вопрос об удалении задан — состояние тоже у родителя, по той же причине. */
  confirmingDelete: boolean
  onConfirmDelete: (confirming: boolean) => void
  deleting: boolean
}

export default function PlantCard({
  plant,
  onDelete,
  onEdit,
  onOpen,
  ratio,
  menuOpen,
  onMenuToggle,
  confirmingDelete,
  onConfirmDelete,
  deleting,
}: PlantCardProps) {
  const menuButtonRef = useRef<HTMLButtonElement>(null)

  /**
   * Escape закрывает меню и возвращает фокус на «…» — как у списка сортировки в
   * X2. Нажатие мимо обрабатывает не этот слушатель, а подложка ниже: см.
   * `.card-menu-backdrop`.
   */
  useEffect(() => {
    if (!menuOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      onMenuToggle(false)
      menuButtonRef.current?.focus()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [menuOpen, onMenuToggle])

  const closeMenu = () => {
    onMenuToggle(false)
    menuButtonRef.current?.focus()
  }

  const remove = async () => {
    const deleted = await onDelete(plant.id)
    // При успехе карточка размонтируется вместе с растением; состояние
    // сбрасываем только если удаление не прошло, иначе останется «Deleting…».
    if (!deleted) closeMenu()
  }

  return (
    <article className="card">
      <PhotoGallery
        photos={plant.photos || []}
        alt={plant.name}
        ratio={ratio}
        onTap={() => onOpen(plant)}
      />

      <div className="card-face">
        {/*
          Название — кнопка, а не просто текст: тап по нему открывает растение так
          же, как тап по фотографии, и с клавиатуры до него можно дойти табом.
        */}
        <button type="button" className="card-open" onClick={() => onOpen(plant)}>
          <span className="card-title">{plant.name}</span>
          {/* Без цены строка просто отсутствует: $0.00 у растения без цены —
              это неправда, а не заглушка (J5) */}
          {plant.price !== undefined && (
            <span className="card-price">${plant.price.toFixed(2)}</span>
          )}
        </button>

        <div className="card-menu">
          <button
            ref={menuButtonRef}
            type="button"
            onClick={() => onMenuToggle(!menuOpen)}
            className="btn btn--icon-sm"
            aria-label={`Actions for ${plant.name}`}
            aria-haspopup="true"
            aria-expanded={menuOpen}
          >
            <MoreHorizontal size={18} color="currentColor" />
          </button>

          {/*
            Нажатие мимо закрывает меню — и на этом всё (тикет H2).
            
            Раньше это делал слушатель на документе, и тап мимо закрывал меню, а
            следом попадал по карточке под пальцем и открывал растение: одно
            движение давало два действия, причём второе — незапрошенный переход.
            Найдено владельцем на живом телефоне.
            
            Прозрачная подложка ловит тап на себя, поэтому до карточки он не
            доходит вовсе. Это надёжнее, чем гасить событие по времени: на
            телефоне между `touchstart` и `click` проходит до 300 миллисекунд, и
            любая такая проверка держится на догадке о задержке.
            
            Фокус при закрытии подложкой не возвращается — он выдернулся бы из
            того, куда человек нажал.
          */}
          {menuOpen && (
            <div
              className="card-menu-backdrop"
              onClick={() => onMenuToggle(false)}
              aria-hidden="true"
            />
          )}

          {menuOpen && (
            <div className="card-menu-popover">
              {confirmingDelete ? (
                <>
                  <p className="card-menu-question">Delete this plant?</p>
                  <button
                    type="button"
                    onClick={() => onConfirmDelete(false)}
                    className="btn btn--quiet"
                    disabled={deleting}
                  >
                    Keep it
                  </button>
                  <button
                    type="button"
                    onClick={remove}
                    className="btn btn--danger-sm"
                    disabled={deleting}
                  >
                    {deleting ? 'Deleting…' : 'Delete'}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      onMenuToggle(false)
                      onEdit(plant)
                    }}
                    className="btn btn--quiet"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => onConfirmDelete(true)}
                    className="btn btn--quiet-danger"
                  >
                    Delete
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  )
}
