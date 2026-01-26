'use client'

import { useState, FormEvent, useEffect } from 'react'
import { X } from 'lucide-react'
import type { Plant } from '@/lib/models/plant'
import { photosRepository } from '@/lib/repositories/photosRepository'

interface AddPlantFormProps {
  onAddPlant: (plant: Omit<Plant, 'id'>) => void
  onCancel: () => void
  initialPlant?: Plant | null
}

interface PhotoPreview {
  preview: string // Data URL for preview
  file?: File // Original file (for new uploads)
  key?: string // IndexedDB key (for existing photos)
}

export default function AddPlantForm({ onAddPlant, onCancel, initialPlant }: AddPlantFormProps) {
  const [name, setName] = useState('')
  const [photoPreviews, setPhotoPreviews] = useState<PhotoPreview[]>([])
  const [price, setPrice] = useState('')
  const [notes, setNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Pre-fill form when editing
  useEffect(() => {
    if (initialPlant) {
      setName(initialPlant.name)
      setPrice(initialPlant.price.toString())
      setNotes(initialPlant.notes || '')
      
      // Load photo previews from repository
      if (initialPlant.photos && initialPlant.photos.length > 0) {
        photosRepository.getByPlantId(initialPlant.photos)
          .then(previews => {
            setPhotoPreviews(previews.map((preview, index) => ({
              preview,
              key: initialPlant.photos[index]
            })))
          })
          .catch(error => {
            console.error('Error loading photo previews:', error)
            setPhotoPreviews([])
          })
      } else {
        setPhotoPreviews([])
      }
    } else {
      // Reset form when not editing
      setName('')
      setPhotoPreviews([])
      setPrice('')
      setNotes('')
    }
  }, [initialPlant])

  // Helper function to check if file is an image
  const isImageFile = (file: File): boolean => {
    // Check MIME type first
    if (file.type && file.type.startsWith('image/')) {
      return true
    }
    // Fallback: check file extension (for camera photos that might not have MIME type)
    if (file.name) {
      const fileName = file.name.toLowerCase()
      const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.heic', '.heif']
      if (imageExtensions.some(ext => fileName.endsWith(ext))) {
        return true
      }
    }
    // For camera photos on iOS, sometimes files don't have type or name
    // If file has size > 0 and no type/name, assume it's an image from camera
    // This is a fallback for iOS camera photos
    if (!file.type && (!file.name || file.name === '')) {
      console.log('File without type/name detected (likely camera photo), accepting:', file.size, 'bytes')
      return file.size > 0
    }
    return false
  }

  // Handle file upload - add to existing photos
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    // Filter only image files (including camera photos)
    const imageFiles = Array.from(files).filter(file => {
      // Check if file has size (not empty)
      if (file.size === 0) {
        console.warn('Skipping empty file:', file.name || 'unnamed')
        return false
      }
      const isValid = isImageFile(file)
      if (!isValid) {
        console.warn('Skipping non-image file:', {
          name: file.name || 'unnamed',
          type: file.type || 'no type',
          size: file.size
        })
      }
      return isValid
    })

    if (imageFiles.length === 0) {
      alert('Please select image files only')
      e.target.value = ''
      return
    }

    console.log(`Processing ${imageFiles.length} image file(s)`)

    // Process files: create previews and store File objects
    const filePromises = imageFiles.map((file) => {
      return new Promise<PhotoPreview>((resolve, reject) => {
        const reader = new FileReader()
        
        reader.onloadend = () => {
          try {
            if (!reader.result || typeof reader.result !== 'string') {
              reject(new Error(`FileReader returned invalid result`))
              return
            }

            const preview = reader.result as string
            resolve({ preview, file })
          } catch (error) {
            reject(new Error(`Error processing file: ${error instanceof Error ? error.message : String(error)}`))
          }
        }
        
        reader.onerror = () => {
          reject(new Error(`Error reading file`))
        }

        reader.readAsDataURL(file)
      })
    })

    // Use Promise.allSettled to handle individual photo failures gracefully
    Promise.allSettled(filePromises)
      .then((results) => {
        const successful: PhotoPreview[] = []
        const failed: { index: number; error: string }[] = []

        results.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            successful.push(result.value)
          } else {
            failed.push({ index, error: result.reason?.message || String(result.reason) })
            console.error(`Photo ${index + 1} failed:`, result.reason)
          }
        })

        if (successful.length > 0) {
          setPhotoPreviews(prev => {
            const updated = [...prev, ...successful]
            console.log(`Total photos after adding: ${updated.length}`)
            return updated
          })
          
          if (failed.length > 0) {
            alert(`Warning: ${failed.length} photo(s) could not be processed, but ${successful.length} photo(s) were added successfully.`)
          }
        } else {
          alert(`No photos could be processed. ${failed.length > 0 ? failed.length + ' photo(s) failed.' : ''} Please try again.`)
        }
      })
      .catch((error) => {
        console.error('Unexpected error processing images:', error)
        alert(`Error uploading images: ${error.message || 'Please try again.'}`)
      })
      .finally(() => {
        e.target.value = ''
      })
  }

  // Remove a photo by index
  const handleRemovePhoto = (index: number) => {
    setPhotoPreviews(prev => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    
    if (isSubmitting) return
    
    // Validate form
    if (!name.trim()) {
      alert('Please enter a plant name')
      return
    }

    if (photoPreviews.length === 0) {
      alert('Please add at least one photo')
      return
    }

    const parsedPrice = parseFloat(price)
    if (isNaN(parsedPrice) || parsedPrice <= 0) {
      alert('Please enter a valid price (greater than 0)')
      return
    }

    setIsSubmitting(true)

    try {
      // Separate new files from existing photos (by key)
      const newFiles = photoPreviews.filter(p => p.file).map(p => p.file!)
      const existingKeys = photoPreviews.filter(p => p.key).map(p => p.key!)

      // Save new files to repository
      let photoKeys: string[] = [...existingKeys]
      if (newFiles.length > 0) {
        console.log(`Saving ${newFiles.length} new photo(s)...`)
        // For new photos, we need a plantId - use a temporary one for now
        // The actual plantId will be set when the plant is created
        const tempPlantId = 'temp'
        const newKeys = await Promise.all(
          newFiles.map(file => photosRepository.addPhoto(tempPlantId, file))
        )
        photoKeys = [...existingKeys, ...newKeys]
        console.log(`Saved ${newKeys.length} photo(s)`)
      }

      // Call the parent handler with photo keys
      onAddPlant({
        name: name.trim(),
        photos: photoKeys,
        price: parsedPrice,
        notes: notes.trim() || undefined
      })

      // Reset form only when adding (not editing)
      if (!initialPlant) {
        setName('')
        setPhotoPreviews([])
        setPrice('')
        setNotes('')
      }
    } catch (error) {
      console.error('Error submitting form:', error)
      alert('Error saving plant. Please try again.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%'
    }}>
      {/* Form Fields - Scrollable */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '1rem',
        paddingBottom: '2rem'
      }}>
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ 
            display: 'block', 
            marginBottom: '0.5rem', 
            fontWeight: 'bold',
            fontSize: '0.95rem',
            fontFamily: 'var(--font-pt-sans), sans-serif'
          }}>
            Plant Name: <span style={{ color: '#d32f2f' }}>*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #8d80ad',
              borderRadius: '12px',
              fontSize: '16px',
              boxSizing: 'border-box',
              fontFamily: 'var(--font-pt-sans), sans-serif'
            }}
            required
          />
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={{ 
            display: 'block', 
            marginBottom: '0.5rem', 
            fontWeight: 'bold',
            fontSize: '0.95rem',
            fontFamily: 'var(--font-pt-sans), sans-serif'
          }}>
            Plant Photos: <span style={{ color: '#d32f2f' }}>*</span>
          </label>
          
          {/* Photo Grid */}
          {photoPreviews.length > 0 && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
              gap: '0.75rem',
              marginBottom: '0.75rem'
            }}>
              {photoPreviews.map((photoPreview, index) => (
                <div
                  key={index}
                  style={{
                    position: 'relative',
                    aspectRatio: '1',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    border: '1px solid #8d80ad'
                  }}
                >
                  <img
                    src={photoPreview.preview}
                    alt={`Preview ${index + 1}`}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover'
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => handleRemovePhoto(index)}
                    style={{
                      position: 'absolute',
                      top: '0.25rem',
                      right: '0.25rem',
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      backgroundColor: 'rgba(0, 0, 0, 0.7)',
                      color: 'white',
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: 0
                    }}
                    aria-label={`Remove photo ${index + 1}`}
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* File Upload */}
          {/* Note: capture attribute removed when multiple is used, as iOS doesn't support it well */}
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileChange}
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #8d80ad',
              borderRadius: '12px',
              fontSize: '16px',
              boxSizing: 'border-box',
              cursor: 'pointer',
              fontFamily: 'var(--font-pt-sans), sans-serif'
            }}
          />
          <p style={{ 
            margin: '0.5rem 0 0 0', 
            fontSize: '0.85rem', 
            color: '#666',
            fontFamily: 'var(--font-pt-sans), sans-serif'
          }}>
            {photoPreviews.length === 0 
              ? 'Upload at least one photo' 
              : `You can add more photos (${photoPreviews.length} ${photoPreviews.length === 1 ? 'photo' : 'photos'} added)`}
          </p>
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={{ 
            display: 'block', 
            marginBottom: '0.5rem', 
            fontWeight: 'bold',
            fontSize: '0.95rem',
            fontFamily: 'var(--font-pt-sans), sans-serif'
          }}>
            Price: <span style={{ color: '#d32f2f' }}>*</span>
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #8d80ad',
              borderRadius: '12px',
              fontSize: '16px',
              boxSizing: 'border-box',
              fontFamily: 'var(--font-pt-sans), sans-serif'
            }}
            required
          />
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label style={{ 
            display: 'block', 
            marginBottom: '0.5rem', 
            fontWeight: 'bold',
            fontSize: '0.95rem',
            fontFamily: 'var(--font-pt-sans), sans-serif'
          }}>
            Notes (optional):
          </label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #8d80ad',
              borderRadius: '12px',
              fontSize: '16px',
              boxSizing: 'border-box',
              fontFamily: 'var(--font-pt-sans), sans-serif',
              resize: 'vertical',
              minHeight: '100px'
            }}
            placeholder="Add any notes about this plant..."
          />
        </div>
      </div>

      {/* Fixed Action Buttons */}
      <div style={{
        padding: '1rem',
        borderTop: '1px solid #e0e0e0',
        backgroundColor: 'white',
        display: 'flex',
        gap: '0.75rem'
      }}>
        <button
          type="button"
          onClick={onCancel}
          style={{
            flex: 1,
            padding: '1rem',
            backgroundColor: '#f5f5f5',
            color: '#333',
            border: '1px solid #ddd',
            borderRadius: '12px',
            fontSize: '1rem',
            cursor: 'pointer',
            fontWeight: 'bold',
            minHeight: '48px',
            fontFamily: 'var(--font-pt-sans), sans-serif'
          }}
        >
          Cancel
        </button>
        <button
          type="submit"
          style={{
            flex: 1,
            padding: '1rem',
            backgroundColor: '#4CAF50',
            color: 'white',
            border: 'none',
            borderRadius: '12px',
            fontSize: '1.1rem',
            cursor: 'pointer',
            fontWeight: 'bold',
            minHeight: '48px',
            fontFamily: 'var(--font-pt-sans), sans-serif'
          }}
        >
          {initialPlant ? 'Save Changes' : 'Add Plant'}
        </button>
      </div>
    </form>
  )
}
