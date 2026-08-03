'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { photosRepository } from '@/lib/repositories/photosRepository'

interface FullscreenPhotoViewerProps {
  photos: string[] // ключи фотографий в IndexedDB
  initialIndex: number
  alt: string
  /** lastIndex — на каком фото закрыли, чтобы карточка синхронизировалась */
  onClose: (lastIndex?: number) => void
}

const SWIPE_THRESHOLD = 60
const CLOSE_THRESHOLD = 110
const TAP_SLOP = 10
const MAX_SCALE = 4

type Mode = 'idle' | 'swipe' | 'close' | 'pan' | 'pinch'

export default function FullscreenPhotoViewer({
  photos,
  initialIndex,
  alt,
  onClose
}: FullscreenPhotoViewerProps) {
  const [activeIndex, setActiveIndex] = useState(initialIndex)
  const [photoUrls, setPhotoUrls] = useState<string[]>([])
  const [scale, setScale] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [drag, setDrag] = useState({ x: 0, y: 0 })
  const [mode, setMode] = useState<Mode>('idle')

  const gesture = useRef({
    startX: 0,
    startY: 0,
    startTime: 0,
    startPan: { x: 0, y: 0 },
    startScale: 1,
    pinchDistance: 0
  })
  const dragRef = useRef({ x: 0, y: 0 })
  const imageRef = useRef<HTMLImageElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const photoKeys = photos.join('|')

  useEffect(() => {
    if (photos.length === 0) {
      setPhotoUrls([])
      return
    }

    let cancelled = false
    let created: string[] = []

    photosRepository.getByPlantId(photos)
      .then(urls => {
        created = urls
        if (cancelled) {
          photosRepository.revokeUrls(urls)
          return
        }
        setPhotoUrls(urls)
      })
      .catch(error => {
        console.error('Error loading photos:', error)
        if (!cancelled) setPhotoUrls([])
      })

    return () => {
      cancelled = true
      photosRepository.revokeUrls(created)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoKeys])

  // Сброс зума при смене фотографии
  useEffect(() => {
    setScale(1)
    setPan({ x: 0, y: 0 })
  }, [activeIndex])

  const close = useCallback(() => onClose(activeIndex), [onClose, activeIndex])

  /**
   * Ограничить панорамирование границами картинки, чтобы её нельзя было
   * увести за пределы экрана. Раньше этого не было и фото улетало в пустоту.
   */
  const clampPan = useCallback((next: { x: number; y: number }, currentScale: number) => {
    const img = imageRef.current
    if (!img || currentScale <= 1) return { x: 0, y: 0 }

    const maxX = Math.max(0, (img.clientWidth * currentScale - img.clientWidth) / 2)
    const maxY = Math.max(0, (img.clientHeight * currentScale - img.clientHeight) / 2)

    return {
      x: Math.min(Math.max(next.x, -maxX), maxX),
      y: Math.min(Math.max(next.y, -maxY), maxY)
    }
  }, [])

  const distanceBetween = (touches: React.TouchList) => {
    if (touches.length < 2) return 0
    return Math.hypot(
      touches[1].clientX - touches[0].clientX,
      touches[1].clientY - touches[0].clientY
    )
  }

  const setDragValue = (value: { x: number; y: number }) => {
    dragRef.current = value
    setDrag(value)
  }

  const onTouchStart = (e: React.TouchEvent) => {
    const g = gesture.current

    if (e.touches.length === 2) {
      g.pinchDistance = distanceBetween(e.touches)
      g.startScale = scale
      g.startPan = pan
      setMode('pinch')
      return
    }

    if (e.touches.length === 1) {
      const touch = e.touches[0]
      g.startX = touch.clientX
      g.startY = touch.clientY
      g.startTime = Date.now()
      g.startPan = pan
      setMode(scale > 1 ? 'pan' : 'idle')
    }
  }

  const onTouchMove = (e: React.TouchEvent) => {
    const g = gesture.current

    // Щипок
    if (e.touches.length === 2 && g.pinchDistance > 0) {
      const current = distanceBetween(e.touches)
      const nextScale = Math.min(MAX_SCALE, Math.max(1, g.startScale * (current / g.pinchDistance)))
      setScale(nextScale)
      setPan(prev => clampPan(prev, nextScale))
      return
    }

    if (e.touches.length !== 1) return
    const touch = e.touches[0]
    const dx = touch.clientX - g.startX
    const dy = touch.clientY - g.startY

    // Панорамирование увеличенного фото
    if (mode === 'pan') {
      setPan(clampPan({ x: g.startPan.x + dx, y: g.startPan.y + dy }, scale))
      return
    }

    // Ось ещё не выбрана
    if (mode === 'idle') {
      if (Math.abs(dx) < TAP_SLOP && Math.abs(dy) < TAP_SLOP) return
      setMode(Math.abs(dx) > Math.abs(dy) ? 'swipe' : 'close')
      return
    }

    if (mode === 'swipe') {
      let offset = dx
      const atStart = activeIndex === 0 && dx > 0
      const atEnd = activeIndex === photoUrls.length - 1 && dx < 0
      if (atStart || atEnd) offset = dx / 3
      setDragValue({ x: offset, y: 0 })
      return
    }

    // Потянули вниз — закрыть
    if (mode === 'close') {
      setDragValue({ x: 0, y: dy })
    }
  }

  const onTouchEnd = (e: React.TouchEvent) => {
    const g = gesture.current

    // Убрали один палец из щипка — не оставляем состояние в подвешенном виде
    if (mode === 'pinch') {
      g.pinchDistance = 0
      if (e.touches.length === 1) {
        const touch = e.touches[0]
        g.startX = touch.clientX
        g.startY = touch.clientY
        g.startTime = Date.now()
        g.startPan = pan
        setMode(scale > 1 ? 'pan' : 'idle')
      } else {
        if (scale <= 1.02) {
          setScale(1)
          setPan({ x: 0, y: 0 })
        }
        setMode('idle')
      }
      return
    }

    if (mode === 'pan') {
      setMode('idle')
      return
    }

    const { x: dx, y: dy } = dragRef.current
    const elapsed = Date.now() - g.startTime
    const currentMode = mode

    setDragValue({ x: 0, y: 0 })
    setMode('idle')

    // Тап по фону при обычном масштабе закрывает
    if (currentMode === 'idle' && elapsed < 400) {
      if (scale > 1) {
        setScale(1)
        setPan({ x: 0, y: 0 })
      }
      return
    }

    if (currentMode === 'swipe') {
      const width = containerRef.current?.clientWidth ?? 0
      const isFlick = elapsed < 250 && Math.abs(dx) > 25
      const passed = Math.abs(dx) > Math.min(SWIPE_THRESHOLD, width * 0.22)
      if (!passed && !isFlick) return

      if (dx < 0 && activeIndex < photoUrls.length - 1) setActiveIndex(activeIndex + 1)
      else if (dx > 0 && activeIndex > 0) setActiveIndex(activeIndex - 1)
      return
    }

    if (currentMode === 'close') {
      const isFlick = elapsed < 300 && dy > 50
      if (dy > CLOSE_THRESHOLD || isFlick) close()
    }
  }

  const handleWheel = (e: React.WheelEvent) => {
    if (!(e.ctrlKey || e.metaKey)) return
    e.preventDefault()
    const nextScale = Math.min(MAX_SCALE, Math.max(1, scale * (e.deltaY > 0 ? 0.9 : 1.1)))
    setScale(nextScale)
    setPan(prev => clampPan(prev, nextScale))
  }

  const handleDoubleClick = () => {
    if (scale > 1) {
      setScale(1)
      setPan({ x: 0, y: 0 })
    } else {
      setScale(2)
    }
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close()
      } else if (e.key === 'ArrowLeft' && scale === 1) {
        setActiveIndex(prev => Math.max(0, prev - 1))
      } else if (e.key === 'ArrowRight' && scale === 1) {
        setActiveIndex(prev => Math.min(photoUrls.length - 1, prev + 1))
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [photoUrls.length, close, scale])

  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [])

  if (photoUrls.length === 0) return null

  const isInteracting = mode === 'swipe' || mode === 'close' || mode === 'pan' || mode === 'pinch'
  // Фон гаснет по мере оттягивания вниз
  const closeProgress = Math.min(1, Math.abs(drag.y) / 260)
  const backdropOpacity = 0.96 - closeProgress * 0.5

  return (
    <div
      ref={containerRef}
      className="viewer"
      style={{ backgroundColor: `rgba(0, 0, 0, ${backdropOpacity})`, touchAction: 'none' }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
      onWheel={handleWheel}
    >
      <button
        onClick={() => close()}
        className="btn btn--glass viewer-close"
        style={{ opacity: isInteracting ? 0 : 1 }}
        aria-label="Close"
      >
        ×
      </button>

      {/* Лента фотографий */}
      <div
        className="viewer-track"
        style={{
          transform: `translate3d(calc(${-activeIndex * 100}% + ${drag.x}px), ${drag.y}px, 0) scale(${1 - closeProgress * 0.12})`,
          transition: isInteracting ? 'none' : 'transform 0.28s cubic-bezier(0.22, 0.61, 0.36, 1)'
        }}
      >
        {photoUrls.map((url, index) => (
          <div key={index} className="viewer-slide">
            {url ? (
              <img
                ref={index === activeIndex ? imageRef : undefined}
                src={url}
                alt={`${alt} — photo ${index + 1}`}
                onDoubleClick={handleDoubleClick}
                draggable={false}
                decoding="async"
                style={{
                  transform: index === activeIndex
                    ? `scale(${scale}) translate(${pan.x / scale}px, ${pan.y / scale}px)`
                    : undefined,
                  transition: mode === 'pinch' || mode === 'pan' ? 'none' : 'transform 0.25s ease-out',
                  cursor: scale > 1 ? 'grab' : 'zoom-in'
                }}
              />
            ) : (
              <span className="viewer-missing">Photo unavailable</span>
            )}
          </div>
        ))}
      </div>

      {photoUrls.length > 1 && (
        <div className="viewer-counter" style={{ opacity: isInteracting ? 0 : 1 }}>
          {activeIndex + 1} / {photoUrls.length}
        </div>
      )}
    </div>
  )
}
