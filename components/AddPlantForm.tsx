'use client'

import { useState, FormEvent, useEffect, useMemo } from 'react'
import { X } from 'lucide-react'
import type { NewPlant, Plant } from '@/lib/models/plant'
import { photosRepository } from '@/lib/repositories/photosRepository'
import { SPECIES_CATALOG } from '@/lib/data/speciesCatalog'
import { buildSpeciesSuggestions, looksLikeBinomial, normalizeSpeciesInput } from '@/lib/species'

interface AddPlantFormProps {
  onAddPlant: (plant: NewPlant) => void
  onCancel: () => void
  initialPlant?: Plant | null
  /**
   * Виды, уже встречающиеся в коллекции. Идут первыми в подсказках, чтобы не
   * плодить один и тот же вид в разных написаниях.
   */
  knownSpecies?: string[]
}

interface PhotoPreview {
  preview: string // Data URL for preview
  file?: File // Original file (for new uploads)
  key?: string // IndexedDB key (for existing photos)
}

export default function AddPlantForm({
  onAddPlant,
  onCancel,
  initialPlant,
  knownSpecies = []
}: AddPlantFormProps) {
  const [name, setName] = useState('')
  const [species, setSpecies] = useState('')
  const [photoPreviews, setPhotoPreviews] = useState<PhotoPreview[]>([])
  const [price, setPrice] = useState('')
  const [notes, setNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Список для datalist. knownSpecies приходит новым массивом на каждый рендер
  // родителя, поэтому зависимость берётся по содержимому, а не по ссылке —
  // то же правило, что и для ключей фотографий в PhotoGallery.
  const speciesSuggestions = useMemo(
    () => buildSpeciesSuggestions(knownSpecies, SPECIES_CATALOG),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [knownSpecies.join('|')]
  )

  // Имя выглядит как латинский биномен, а вид не заполнен — предложим подставить
  const speciesSuggestionFromName =
    species.trim() === '' && looksLikeBinomial(name) ? normalizeSpeciesInput(name) : null

  // Pre-fill form when editing
  useEffect(() => {
    if (initialPlant) {
      setName(initialPlant.name)
      setSpecies(initialPlant.species || '')
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
      setSpecies('')
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
        species: normalizeSpeciesInput(species) || undefined,
        photos: photoKeys,
        price: parsedPrice,
        notes: notes.trim() || undefined
      })

      // Reset form only when adding (not editing)
      if (!initialPlant) {
        setName('')
        setSpecies('')
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
    <form onSubmit={handleSubmit} className="form">
      {/* Form Fields - Scrollable */}
      <div className="form-fields">
        <div className="field">
          <label className="field-label">
            Plant Name: <span className="field-required">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="field-input"
            required
          />
        </div>

        <div className="field">
          <label className="field-label" htmlFor="plant-species">
            Species:
          </label>
          <input
            id="plant-species"
            type="text"
            value={species}
            onChange={(e) => setSpecies(e.target.value)}
            className="field-input"
            list="species-suggestions"
            placeholder="Monstera deliciosa"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
          />
          <datalist id="species-suggestions">
            {speciesSuggestions.map((suggestion) => (
              <option key={suggestion} value={suggestion} />
            ))}
          </datalist>

          {speciesSuggestionFromName && (
            <p className="field-hint">
              Looks like a species name.{' '}
              <button
                type="button"
                className="link-button"
                onClick={() => setSpecies(speciesSuggestionFromName)}
              >
                Use “{speciesSuggestionFromName}”
              </button>
            </p>
          )}
        </div>

        <div className="field">
          <label className="field-label">
            Plant Photos: <span className="field-required">*</span>
          </label>

          {/* Photo Grid */}
          {photoPreviews.length > 0 && (
            <div className="photo-grid">
              {photoPreviews.map((photoPreview, index) => (
                <div key={index} className="photo-thumb">
                  <img src={photoPreview.preview} alt={`Preview ${index + 1}`} />
                  <button
                    type="button"
                    onClick={() => handleRemovePhoto(index)}
                    className="btn btn--scrim btn--scrim-sm"
                    style={{ top: 'var(--space-xs)', right: 'var(--space-xs)' }}
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
            className="field-input field-input--file"
          />
          <p className="field-hint">
            {photoPreviews.length === 0 
              ? 'Upload at least one photo' 
              : `You can add more photos (${photoPreviews.length} ${photoPreviews.length === 1 ? 'photo' : 'photos'} added)`}
          </p>
        </div>

        <div className="field">
          <label className="field-label">
            Price: <span className="field-required">*</span>
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="field-input"
            required
          />
        </div>

        <div className="field">
          <label className="field-label">Notes (optional):</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            className="field-input field-input--area"
            placeholder="Add any notes about this plant..."
          />
        </div>
      </div>

      {/* Fixed Action Buttons */}
      <div className="form-actions">
        <button type="button" onClick={onCancel} className="btn btn--secondary">
          Cancel
        </button>
        <button type="submit" className="btn btn--primary">
          {initialPlant ? 'Save Changes' : 'Add Plant'}
        </button>
      </div>
    </form>
  )
}
