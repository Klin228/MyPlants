'use client'

import { useState, useRef, useEffect } from 'react'
import { photosRepository } from '@/lib/repositories/photosRepository'
import FullscreenPhotoViewer from './FullscreenPhotoViewer'

interface PhotoGalleryProps {
  photos: string[] // Photo keys (IndexedDB keys)
  alt: string
}

export default function PhotoGallery({ photos, alt }: PhotoGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0)
  const [touchStart, setTouchStart] = useState<number | null>(null)
  const [touchEnd, setTouchEnd] = useState<number | null>(null)
  const [photoUrls, setPhotoUrls] = useState<string[]>([])
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Load photos from repository
  useEffect(() => {
    if (photos.length === 0) {
      setPhotoUrls([])
      return
    }

    photosRepository.getByPlantId(photos)
      .then(urls => {
        setPhotoUrls(urls)
      })
      .catch(error => {
        console.error('Error loading photos:', error)
        setPhotoUrls([])
      })
  }, [photos])

  // Minimum swipe distance (in pixels)
  const minSwipeDistance = 50

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null)
    setTouchStart(e.targetTouches[0].clientX)
  }

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX)
  }

  const onTouchEnd = () => {
    if (!touchStart) return
    
    // If touchEnd is null, it was a tap (no movement) - open fullscreen
    if (touchEnd === null) {
      setIsFullscreenOpen(true)
      return
    }
    
    const distance = touchStart - touchEnd
    const isLeftSwipe = distance > minSwipeDistance
    const isRightSwipe = distance < -minSwipeDistance

    // Only handle swipe if it's a significant swipe, otherwise treat as click
    if (Math.abs(distance) < minSwipeDistance) {
      // Small movement, treat as click to open fullscreen
      setIsFullscreenOpen(true)
      return
    }

    if (isLeftSwipe && activeIndex < photos.length - 1) {
      setActiveIndex(activeIndex + 1)
    }
    if (isRightSwipe && activeIndex > 0) {
      setActiveIndex(activeIndex - 1)
    }
  }

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && activeIndex > 0) {
        setActiveIndex(activeIndex - 1)
      } else if (e.key === 'ArrowRight' && activeIndex < photos.length - 1) {
        setActiveIndex(activeIndex + 1)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeIndex, photos.length])

  if (photos.length === 0 || photoUrls.length === 0) {
    return (
      <div className="gallery-empty">
        {photos.length > 0 && photoUrls.length === 0 ? 'Loading photos...' : 'No photo'}
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      className="gallery"
      style={{ touchAction: 'pan-x pan-y' }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Photo container with sliding animation */}
      <div
        className="gallery-track"
        style={{
          width: `${photoUrls.length * 100}%`,
          transform: `translateX(-${activeIndex * (100 / photoUrls.length)}%)`
        }}
      >
        {photoUrls.map((photoUrl, index) => (
          <div
            key={index}
            className="gallery-slide"
            style={{ width: `${100 / photoUrls.length}%` }}
          >
            <img
              src={photoUrl}
              alt={`${alt} - Photo ${index + 1}`}
              onClick={() => setIsFullscreenOpen(true)}
            />
          </div>
        ))}
      </div>

      {/* Pagination dots - only show if multiple photos */}
      {photoUrls.length > 1 && (
        <div className="gallery-dots">
          {photoUrls.map((_, index) => (
            <button
              key={index}
              onClick={() => setActiveIndex(index)}
              className={`gallery-dot${activeIndex === index ? ' gallery-dot--active' : ''}`}
              style={{ width: activeIndex === index ? '24px' : '8px' }}
              aria-label={`Go to photo ${index + 1}`}
            />
          ))}
        </div>
      )}

      {/* Fullscreen photo viewer - only mounted when open */}
      {isFullscreenOpen && (
        <FullscreenPhotoViewer
          photos={photos}
          initialIndex={activeIndex}
          alt={alt}
          onClose={() => setIsFullscreenOpen(false)}
        />
      )}
    </div>
  )
}
