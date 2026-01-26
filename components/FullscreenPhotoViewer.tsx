'use client'

import { useState, useEffect, useRef } from 'react'
import { photosRepository } from '@/lib/repositories/photosRepository'

interface FullscreenPhotoViewerProps {
  photos: string[] // Photo keys (IndexedDB keys)
  initialIndex: number
  alt: string
  onClose: () => void
}

export default function FullscreenPhotoViewer({ 
  photos, 
  initialIndex, 
  alt, 
  onClose 
}: FullscreenPhotoViewerProps) {
  const [activeIndex, setActiveIndex] = useState(initialIndex)
  const [touchStart, setTouchStart] = useState<number | null>(null)
  const [touchEnd, setTouchEnd] = useState<number | null>(null)
  const [photoUrls, setPhotoUrls] = useState<string[]>([])
  const [scale, setScale] = useState(1)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [lastPinchDistance, setLastPinchDistance] = useState<number | null>(null)
  const imageRef = useRef<HTMLImageElement>(null)
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

  // Update active index when initialIndex changes
  useEffect(() => {
    setActiveIndex(initialIndex)
  }, [initialIndex])

  // Reset zoom and position when switching photos
  useEffect(() => {
    setScale(1)
    setPosition({ x: 0, y: 0 })
  }, [activeIndex])

  // Minimum swipe distance (in pixels)
  const minSwipeDistance = 50

  // Calculate distance between two touch points
  const getTouchDistance = (touches: React.TouchList): number => {
    if (touches.length < 2) return 0
    const touch1 = touches[0]
    const touch2 = touches[1]
    return Math.hypot(
      touch2.clientX - touch1.clientX,
      touch2.clientY - touch1.clientY
    )
  }

  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      // Pinch zoom
      setLastPinchDistance(getTouchDistance(e.touches))
      setTouchStart(null)
      setTouchEnd(null)
    } else if (e.touches.length === 1) {
      // Single touch - could be swipe or drag
      if (scale > 1) {
        // If zoomed, allow dragging
        setIsDragging(true)
        setDragStart({
          x: e.touches[0].clientX - position.x,
          y: e.touches[0].clientY - position.y
        })
      } else {
        // If not zoomed, allow swiping between photos
        setTouchEnd(null)
        setTouchStart(e.touches[0].clientX)
      }
    }
  }

  const onTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && lastPinchDistance !== null) {
      // Pinch zoom
      e.preventDefault()
      const currentDistance = getTouchDistance(e.touches)
      const newScale = Math.max(1, Math.min(5, scale * (currentDistance / lastPinchDistance)))
      setScale(newScale)
      setLastPinchDistance(currentDistance)
    } else if (e.touches.length === 1 && isDragging && scale > 1) {
      // Drag when zoomed
      e.preventDefault()
      setPosition({
        x: e.touches[0].clientX - dragStart.x,
        y: e.touches[0].clientY - dragStart.y
      })
    } else if (e.touches.length === 1 && scale === 1) {
      // Track swipe when not zoomed
      setTouchEnd(e.touches[0].clientX)
    }
  }

  const onTouchEnd = () => {
    if (lastPinchDistance !== null) {
      setLastPinchDistance(null)
      return
    }

    if (isDragging) {
      setIsDragging(false)
      return
    }

    if (!touchStart || touchEnd === null) return
    
    const distance = touchStart - touchEnd
    const isLeftSwipe = distance > minSwipeDistance
    const isRightSwipe = distance < -minSwipeDistance

    if (isLeftSwipe && activeIndex < photos.length - 1) {
      setActiveIndex(activeIndex + 1)
    }
    if (isRightSwipe && activeIndex > 0) {
      setActiveIndex(activeIndex - 1)
    }
  }

  // Handle mouse wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      const delta = e.deltaY > 0 ? 0.9 : 1.1
      const newScale = Math.max(1, Math.min(5, scale * delta))
      setScale(newScale)
      if (newScale === 1) {
        setPosition({ x: 0, y: 0 })
      }
    }
  }

  // Handle double-click zoom
  const handleDoubleClick = () => {
    if (scale > 1) {
      setScale(1)
      setPosition({ x: 0, y: 0 })
    } else {
      setScale(2)
    }
  }

  // Handle mouse drag when zoomed
  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale > 1 && e.button === 0) {
      setIsDragging(true)
      setDragStart({
        x: e.clientX - position.x,
        y: e.clientY - position.y
      })
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && scale > 1) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      })
    }
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  // Handle keyboard navigation and ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      } else if (e.key === 'ArrowLeft' && activeIndex > 0 && scale === 1) {
        setActiveIndex(activeIndex - 1)
      } else if (e.key === 'ArrowRight' && activeIndex < photos.length - 1 && scale === 1) {
        setActiveIndex(activeIndex + 1)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeIndex, photos.length, onClose, scale])

  // Prevent body scroll when viewer is open
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = ''
    }
  }, [])

  if (photoUrls.length === 0) {
    return null
  }

  const currentPhotoUrl = photoUrls[activeIndex]

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.95)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        touchAction: 'none',
        userSelect: 'none'
      }}
      onClick={(e) => {
        // Close on background click (not on image) when not zoomed
        if (e.target === e.currentTarget && scale === 1) {
          onClose()
        }
      }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        style={{
          position: 'absolute',
          top: '1rem',
          right: '1rem',
          width: '48px',
          height: '48px',
          borderRadius: '50%',
          backgroundColor: 'rgba(255, 255, 255, 0.2)',
          color: 'white',
          border: 'none',
          cursor: 'pointer',
          fontSize: '1.5rem',
          fontWeight: 'bold',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          lineHeight: 1,
          padding: 0,
          transition: 'background-color 0.2s'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.3)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.2)'
        }}
        aria-label="Close fullscreen viewer"
      >
        ×
      </button>

      {/* Photo container - shows only the active photo */}
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          position: 'relative'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <img
          ref={imageRef}
          src={currentPhotoUrl}
          alt={`${alt} - Photo ${activeIndex + 1}`}
          onDoubleClick={handleDoubleClick}
          style={{
            maxWidth: '100%',
            maxHeight: '100%',
            objectFit: 'contain',
            objectPosition: 'center',
            display: 'block',
            transform: `scale(${scale}) translate(${position.x / scale}px, ${position.y / scale}px)`,
            transition: scale === 1 ? 'transform 0.3s ease-out' : 'none',
            cursor: scale > 1 ? 'grab' : 'zoom-in',
            userSelect: 'none',
            WebkitUserSelect: 'none'
          }}
          draggable={false}
        />
      </div>

      {/* Photo counter and pagination - only show if multiple photos */}
      {photoUrls.length > 1 && (
        <div
          style={{
            position: 'absolute',
            bottom: '2rem',
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '0.75rem',
            zIndex: 10000
          }}
        >
          {/* Photo counter */}
          <div
            style={{
              color: 'white',
              fontSize: '0.9rem',
              fontFamily: 'var(--font-pt-sans), sans-serif',
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              padding: '0.5rem 1rem',
              borderRadius: '20px'
            }}
          >
            {activeIndex + 1} / {photoUrls.length}
          </div>

          {/* Pagination dots */}
          <div
            style={{
              display: 'flex',
              gap: '0.5rem'
            }}
          >
            {photoUrls.map((_, index) => (
              <button
                key={index}
                onClick={() => {
                  if (scale === 1) {
                    setActiveIndex(index)
                  }
                }}
                style={{
                  width: activeIndex === index ? '24px' : '8px',
                  height: '8px',
                  borderRadius: '4px',
                  border: 'none',
                  backgroundColor: activeIndex === index ? 'white' : 'rgba(255, 255, 255, 0.5)',
                  cursor: scale === 1 ? 'pointer' : 'default',
                  padding: 0,
                  transition: 'width 0.2s ease-out, background-color 0.2s ease-out',
                  opacity: scale === 1 ? 1 : 0.5
                }}
                aria-label={`Go to photo ${index + 1}`}
                disabled={scale > 1}
              />
            ))}
          </div>
        </div>
      )}

      {/* Navigation arrows - only show if multiple photos and not zoomed */}
      {photoUrls.length > 1 && scale === 1 && (
        <>
          {activeIndex > 0 && (
            <button
              onClick={() => setActiveIndex(activeIndex - 1)}
              style={{
                position: 'absolute',
                left: '1rem',
                top: '50%',
                transform: 'translateY(-50%)',
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                backgroundColor: 'rgba(255, 255, 255, 0.2)',
                color: 'white',
                border: 'none',
                cursor: 'pointer',
                fontSize: '1.5rem',
                fontWeight: 'bold',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 10000,
                transition: 'background-color 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.3)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.2)'
              }}
              aria-label="Previous photo"
            >
              ‹
            </button>
          )}
          {activeIndex < photoUrls.length - 1 && (
            <button
              onClick={() => setActiveIndex(activeIndex + 1)}
              style={{
                position: 'absolute',
                right: '1rem',
                top: '50%',
                transform: 'translateY(-50%)',
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                backgroundColor: 'rgba(255, 255, 255, 0.2)',
                color: 'white',
                border: 'none',
                cursor: 'pointer',
                fontSize: '1.5rem',
                fontWeight: 'bold',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 10000,
                transition: 'background-color 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.3)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.2)'
              }}
              aria-label="Next photo"
            >
              ›
            </button>
          )}
        </>
      )}
    </div>
  )
}
