'use client'

// Клиентский компонент с этого тикета: подтверждение удаления держит состояние.

import { useState } from 'react'
import type { Plant } from '@/lib/models/plant'
import { formatCalendarDate } from '@/lib/dates'
import PhotoGallery from './PhotoGallery'

interface PlantCardProps {
  plant: Plant
  /** Возвращает `true`, если растение действительно удалено */
  onDelete: (plantId: string) => Promise<boolean>
  onEdit: (plant: Plant) => void
  /**
   * Пропорция рамки фотографии (тикет X5). Считает её родитель: то же число
   * нужно кладке, чтобы предсказать высоту карточки до отрисовки.
   */
  ratio?: number
}

export default function PlantCard({ plant, onDelete, onEdit, ratio }: PlantCardProps) {
  /**
   * Удаление необратимо — вместе с растением из базы уходят его фотографии, —
   * поэтому сначала спрашиваем. Тот же принцип, что у отзыва публикации в
   * `ShareDialog`: одной кнопки для такого мало.
   */
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Дата и источник — одна строка. Пустые поля не должны оставлять после себя
  // ни разделителя, ни пустого абзаца, поэтому список собирается заранее.
  const provenance = [
    plant.acquiredOn && formatCalendarDate(plant.acquiredOn),
    plant.source?.trim()
  ].filter(Boolean)

  const remove = async () => {
    setDeleting(true)
    const deleted = await onDelete(plant.id)
    // При успехе карточка размонтируется вместе со строкой; состояние сбрасываем
    // только если удаление не прошло, иначе останется вечное «Deleting…».
    if (!deleted) {
      setDeleting(false)
      setConfirming(false)
    }
  }

  return (
    <div className="card">
      <PhotoGallery photos={plant.photos || []} alt={plant.name} ratio={ratio} />

      <div className="card-body">
        <h3 className="card-title">{plant.name}</h3>
        {plant.species && <p className="card-species">{plant.species}</p>}
        <p className="card-price">${plant.price.toFixed(2)}</p>

        {/* Acquisition date and source - only show what is filled in */}
        {provenance.length > 0 && (
          <p className="card-meta">{provenance.join(' · ')}</p>
        )}

        {/* Notes - only show if they exist */}
        {plant.notes && plant.notes.trim() && (
          <div className="card-notes">
            <p>{plant.notes}</p>
          </div>
        )}

        {/*
          Подтверждение подменяет тот же ряд, а не раскрывается под ним.
          В сетке это существенно: выросший блок поднял бы высоту всей строки
          сетки, и соседние карточки в ряду подросли бы вместе с ним. Обе
          раскладки — один ряд высотой в площадь касания, поэтому высота
          карточки не меняется вообще.

          Кнопка-триггер стоит слева, подтверждающая — справа. Двойным тапом по
          одному месту удалить нельзя, а на месте триггера оказывается
          «Cancel»: повторный тап туда же отменяет.
        */}
        {confirming ? (
          <div className="card-actions">
            <span className="card-actions-question">Delete?</span>
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
          <div className="card-actions">
            {/*
              Порядок «Delete, Edit» намеренный: частое неразрушающее действие
              получает угол, удобный большому пальцу, а разрушающее уходит
              внутрь, где случайный тап по краю карточки его не задевает.
              Плавающая кнопка добавления накрывает при прокрутке сначала
              безобидный Edit.
            */}
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="btn btn--quiet-danger"
            >
              Delete
            </button>
            <button type="button" onClick={() => onEdit(plant)} className="btn btn--quiet">
              Edit
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
