'use client'

/**
 * Экран одного растения (тикет G3).
 *
 * До этого тикета у растения не было своей страницы: вся информация жила в
 * карточке на главной, и карточка от этого разрослась — название, вид, цена,
 * дата, источник, заметки и два действия. В две колонки такая карточка не
 * влезает физически, поэтому смотреть растение теперь приходят сюда, а карточка
 * оставляет себе фотографию.
 *
 * Раскладка: фотографии занимают почти весь экран и свайпаются, всё остальное —
 * на плашке снизу. Тап по фотографии открывает полноэкранный просмотр с зумом.
 *
 * Свайп здесь **не свой**: `PhotoGallery` работает в режиме заполнения высоты.
 * Третья реализация жеста в проекте была бы третьим местом, где надо помнить
 * правила из `CLAUDE.md`.
 */

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import PhotoGallery from '@/components/PhotoGallery'
import Toast from '@/components/Toast'
import { plantsRepository } from '@/lib/repositories/plantsRepository'
import { photosRepository } from '@/lib/repositories/photosRepository'
import { initializeDatabase } from '@/lib/repositories/migration'
import { frameRatio } from '@/lib/photoRatio'
import { formatCalendarDate } from '@/lib/dates'
import type { Plant } from '@/lib/models/plant'

export default function PlantPage() {
  const router = useRouter()
  const params = useParams()
  const plantId = params.id as string

  const [plant, setPlant] = useState<Plant | null>(null)
  const [coverRatio, setCoverRatio] = useState<number | undefined>(undefined)
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        await initializeDatabase()
        const found = await plantsRepository.getById(plantId)

        if (cancelled) return

        if (!found) {
          // Растения нет — например его удалили с другого экрана. Показывать
          // пустую страницу незачем, на главной видно, что осталось.
          router.replace('/')
          return
        }

        setPlant(found)

        /*
         * Пропорция обложки — та же, что у карточки (X5), и здесь она нужна не
         * для формы рамки: в режиме заполнения высоту задаёт раскладка. Она
         * передаётся, чтобы скелетон и пустое место занимали столько же, сколько
         * займёт фотография, — иначе плашка дёрнется в момент подстановки.
         */
        const cover = found.photos?.[0]
        if (cover) {
          const sizes = await photosRepository.getSizes([cover])
          if (!cancelled) setCoverRatio(frameRatio(sizes[cover]))
        }
      } catch (error) {
        console.error('Error loading plant:', error)
        if (!cancelled) router.replace('/')
      }
    }

    load()

    return () => {
      cancelled = true
    }
  }, [plantId, router])

  /**
   * Удаление в два шага — тот же приём, что был в карточке и есть у отзыва
   * публикации: действие необратимо, вместе с растением уходят его фотографии.
   */
  const remove = useCallback(async () => {
    if (!plant) return

    setDeleting(true)
    try {
      await plantsRepository.delete(plant.id)
      // Сообщение показывается здесь, а не на главной: страница ещё наша, и
      // передавать текст через адрес ради полусекунды незачем.
      setToastMessage(`${plant.name} deleted`)
      setTimeout(() => {
        router.push('/')
        router.refresh()
      }, 500)
    } catch (error) {
      console.error('Error deleting plant:', error)
      setToastMessage('Could not delete. Try again.')
      setDeleting(false)
      setConfirming(false)
    }
  }, [plant, router])

  // Дата и источник — одной строкой, и пустые поля не оставляют разделителя
  const provenance = plant
    ? [
        plant.acquiredOn && formatCalendarDate(plant.acquiredOn),
        plant.source?.trim(),
      ].filter(Boolean)
    : []

  return (
    <div className="plant-screen">
      <div className="plant-photos">
        <button
          onClick={() => router.push('/')}
          className="btn btn--glass plant-back"
          aria-label="Go back"
        >
          <ArrowLeft size={20} color="currentColor" />
        </button>

        {/*
          Пока растение читается из базы, на месте фотографий скелетон той же
          высоты — как в форме правки. Плашка снизу при этом уже на экране, чтобы
          она не въезжала рывком вместе с содержимым.
        */}
        <PhotoGallery
          photos={plant?.photos ?? []}
          alt={plant?.name ?? 'Plant'}
          ratio={coverRatio}
          fill
        />
      </div>

      <div className="plant-sheet">
        {!plant ? (
          <div aria-busy="true" aria-label="Loading plant">
            <div className="form-skeleton-line--label skeleton" />
            <div className="form-skeleton-line skeleton" style={{ marginTop: 12 }} />
          </div>
        ) : (
          <>
            <div className="plant-sheet-body">
              <h1 className="plant-name">{plant.name}</h1>
              {plant.species && <p className="plant-species">{plant.species}</p>}
              <p className="plant-price">${plant.price.toFixed(2)}</p>

              {provenance.length > 0 && <p className="plant-meta">{provenance.join(' · ')}</p>}

              {plant.notes?.trim() && <p className="plant-notes">{plant.notes}</p>}
            </div>

            {/*
              Подтверждение занимает место ряда кнопок, а не добавляется под ним:
              плашка иначе подпрыгивает и уводит текст из-под пальца. Тот же
              приём, что был в карточке до этого тикета.
            */}
            {confirming ? (
              <div className="plant-actions">
                <span className="plant-actions-question">Delete this plant?</span>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="btn btn--quiet"
                  disabled={deleting}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={remove}
                  className="btn btn--danger-sm"
                  disabled={deleting}
                >
                  {deleting ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            ) : (
              <div className="plant-actions">
                <button
                  type="button"
                  onClick={() => setConfirming(true)}
                  className="btn btn--quiet-danger"
                >
                  Delete
                </button>
                <button
                  type="button"
                  onClick={() => router.push(`/plant/${plant.id}/edit`)}
                  className="btn btn--secondary"
                >
                  Edit
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {toastMessage && <Toast message={toastMessage} onClose={() => setToastMessage(null)} />}
    </div>
  )
}
