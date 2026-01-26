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
      <div
        style={{
          width: '100%',
          height: '360px',
          backgroundColor: '#f0f0f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '12px 0 0',
          color: '#666',
          fontFamily: 'var(--font-pt-sans), sans-serif'
        }}
      >
        {photos.length > 0 && photoUrls.length === 0 ? 'Loading photos...' : 'No photo'}
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        maxHeight: '360px',
        overflow: 'hidden',
        borderRadius: '12px 0 0',
        position: 'relative',
        touchAction: 'pan-x pan-y'
      }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Photo container with sliding animation */}
      <div
        style={{
          display: 'flex',
          width: `${photoUrls.length * 100}%`,
          transform: `translateX(-${activeIndex * (100 / photoUrls.length)}%)`,
          transition: 'transform 0.3s ease-out'
        }}
      >
        {photoUrls.map((photoUrl, index) => (
          <div
            key={index}
            style={{
              width: `${100 / photoUrls.length}%`,
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden'
            }}
          >
            <img
              src={photoUrl}
              alt={`${alt} - Photo ${index + 1}`}
              onClick={() => setIsFullscreenOpen(true)}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                objectPosition: 'center',
                display: 'block',
                maxHeight: '360px',
                cursor: 'pointer'
              }}
            />
          </div>
        ))}
      </div>

      {/* Pagination dots - only show if multiple photos */}
      {photoUrls.length > 1 && (
        <div
          style={{
            position: 'absolute',
            bottom: '0.75rem',
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            gap: '0.5rem',
            zIndex: 10
          }}
        >
          {photoUrls.map((_, index) => (
            <button
              key={index}
              onClick={() => setActiveIndex(index)}
              style={{
                width: activeIndex === index ? '24px' : '8px',
                height: '8px',
                borderRadius: '4px',
                border: 'none',
                backgroundColor: activeIndex === index ? 'white' : 'rgba(255, 255, 255, 0.5)',
                cursor: 'pointer',
                padding: 0,
                transition: 'width 0.2s ease-out, background-color 0.2s ease-out'
              }}
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
