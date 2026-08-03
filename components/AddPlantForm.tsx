'use client'

import { useState, FormEvent, useEffect, useMemo, useRef } from 'react'
import { X } from 'lucide-react'
import type { NewPlant, Plant } from '@/lib/models/plant'
import { photosRepository } from '@/lib/repositories/photosRepository'
import { LOCAL_PHOTO_MAX_SIZE, resizeToJpeg } from '@/lib/images'
import { SPECIES_CATALOG } from '@/lib/data/speciesCatalog'
import { buildSpeciesSuggestions, looksLikeBinomial, normalizeSpeciesInput } from '@/lib/species'
import { todayAsDateInput } from '@/lib/dates'

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

/**
 * Фотография в форме: либо уже сохранённая в базе, либо только что выбранная.
 *
 * `url` — **object URL**, а не строка base64. Раньше превью новых фотографий
 * строились через `FileReader.readAsDataURL`, то есть снимок на 8 МБ жил в
 * состоянии компонента строкой почти на 11 МБ. Это ровно то, из-за чего на iOS
 * выгружало вкладку, и правило против этого записано в `CLAUDE.md`.
 */
interface PhotoPreview {
  /** Object URL для показа. Пустая строка, если блоба под ключом не нашлось. */
  url: string
  /** Уже уменьшенный блоб — только у новых фотографий, ждёт записи в базу. */
  blob?: Blob
  /** Ключ в IndexedDB — только у фотографий, которые там уже лежат. */
  key?: string
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
  const [acquiredOn, setAcquiredOn] = useState('')
  const [source, setSource] = useState('')
  const [notes, setNotes] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  /** Сколько фотографий сейчас уменьшается. Снимок на 8 МБ это не мгновенно. */
  const [processing, setProcessing] = useState(0)
  /**
   * Сколько уже сохранённых фотографий читается из базы при открытии
   * редактирования. Нужно, чтобы показать столько же скелетонов и не дать
   * сетке превью подпрыгнуть, когда они появятся.
   */
  const [loadingExisting, setLoadingExisting] = useState(0)

  /**
   * Все object URL, которые создал этот компонент, — и те, что пришли из
   * репозитория для уже сохранённых фотографий: по контракту `getByPlantId`
   * освобождает их тот, кто получил.
   *
   * Держим в ref, а не в состоянии: набор нужен в `cleanup` при размонтировании,
   * а туда попадает только то, что не зависит от последнего рендера.
   */
  const createdUrls = useRef<Set<string>>(new Set())

  const rememberUrl = (url: string) => {
    if (url) createdUrls.current.add(url)
    return url
  }

  const forgetUrl = (url: string) => {
    if (!url) return
    createdUrls.current.delete(url)
    photosRepository.revokeUrls([url])
  }

  // Освобождаем всё при размонтировании — иначе блобы висят до перезагрузки
  useEffect(() => {
    const urls = createdUrls.current
    return () => {
      photosRepository.revokeUrls([...urls])
      urls.clear()
    }
  }, [])

  // Растение не могло появиться в коллекции в будущем — обычная защита от опечатки
  const today = useMemo(() => todayAsDateInput(), [])

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
      setAcquiredOn(initialPlant.acquiredOn || '')
      setSource(initialPlant.source || '')
      setNotes(initialPlant.notes || '')

      // Load photo previews from repository
      if (initialPlant.photos && initialPlant.photos.length > 0) {
        setLoadingExisting(initialPlant.photos.length)
        photosRepository.getByPlantId(initialPlant.photos)
          .then(urls => {
            setPhotoPreviews(urls.map((url, index) => ({
              url: rememberUrl(url),
              key: initialPlant.photos[index]
            })))
          })
          .catch(error => {
            console.error('Error loading photo previews:', error)
            setPhotoPreviews([])
          })
          .finally(() => setLoadingExisting(0))
      } else {
        setPhotoPreviews([])
        setLoadingExisting(0)
      }
    } else {
      // Reset form when not editing
      setName('')
      setSpecies('')
      setPhotoPreviews([])
      setPrice('')
      setAcquiredOn('')
      setSource('')
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

    /*
     * Каждая фотография уменьшается ДО записи в базу, а не после.
     *
     * Здесь была главная нестыковка проекта: `CLAUDE.md` утверждал, что все
     * новые фотографии проходят через сжатие, а на деле в IndexedDB уезжал
     * исходный `File` — 3–8 МБ со снимка телефона на каждое фото. Уменьшаем
     * готовой `resizeToJpeg`, которой уже пользуется публикация: вторая
     * библиотека сжатия проекту не нужна.
     *
     * Превью берётся из уже уменьшенного блоба, а не из исходника: показывать
     * восьмимегабайтный кадр в плитке 100 пикселей незачем.
     */
    setProcessing((count) => count + imageFiles.length)

    Promise.allSettled(imageFiles.map((file) => resizeToJpeg(file, LOCAL_PHOTO_MAX_SIZE)))
      .then((results) => {
        const added: PhotoPreview[] = []
        let failed = 0

        results.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            const url = URL.createObjectURL(result.value.blob)
            added.push({ url: rememberUrl(url), blob: result.value.blob })
          } else {
            failed += 1
            console.error(`Photo ${index + 1} failed:`, result.reason)
          }
        })

        if (added.length > 0) setPhotoPreviews((prev) => [...prev, ...added])

        if (failed > 0) {
          alert(
            added.length > 0
              ? `Warning: ${failed} photo(s) could not be processed, but ${added.length} were added.`
              : `No photos could be processed. ${failed} photo(s) failed. Please try again.`
          )
        }
      })
      .finally(() => {
        setProcessing((count) => Math.max(0, count - imageFiles.length))
        e.target.value = ''
      })
  }

  // Remove a photo by index
  const handleRemovePhoto = (index: number) => {
    setPhotoPreviews((prev) => {
      // Указатель убранной фотографии освобождаем сразу, а не ждём
      // размонтирования: иначе выбор и отмена десятка снимков подряд оставят
      // в памяти все десять блобов.
      const removed = prev[index]
      if (removed) forgetUrl(removed.url)
      return prev.filter((_, i) => i !== index)
    })
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    
    if (isSubmitting) return

    /*
     * Пока фотографии уменьшаются, их ещё нет в `photoPreviews`. Без этой
     * проверки отправка сохранила бы растение без них — молча, потому что
     * форма считает, что фотографии просто не добавляли.
     */
    if (processing > 0) {
      alert('Photos are still being prepared. One moment.')
      return
    }
    
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
      // Separate new photos from existing ones (by key)
      const newBlobs = photoPreviews.filter(p => p.blob).map(p => p.blob!)
      const existingKeys = photoPreviews.filter(p => p.key).map(p => p.key!)

      // Save new photos to repository. Блобы уже уменьшены при выборе файла.
      let photoKeys: string[] = [...existingKeys]
      if (newBlobs.length > 0) {
        // For new photos, we need a plantId - use a temporary one for now
        // The actual plantId will be set when the plant is created
        const tempPlantId = 'temp'
        const newKeys = await Promise.all(
          newBlobs.map(blob => photosRepository.addPhoto(tempPlantId, blob))
        )
        photoKeys = [...existingKeys, ...newKeys]
      }

      // Call the parent handler with photo keys
      onAddPlant({
        name: name.trim(),
        species: normalizeSpeciesInput(species) || undefined,
        photos: photoKeys,
        price: parsedPrice,
        acquiredOn: acquiredOn || undefined,
        source: source.trim() || undefined,
        notes: notes.trim() || undefined
      })

      // Reset form only when adding (not editing)
      if (!initialPlant) {
        setName('')
        setSpecies('')
        // Указатели превью больше не нужны: блобы уже в базе
        setPhotoPreviews((prev) => {
          prev.forEach((photo) => forgetUrl(photo.url))
          return []
        })
        setPrice('')
        setAcquiredOn('')
        setSource('')
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
            Plant name: <span className="field-required">*</span>
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
            Plant photos: <span className="field-required">*</span>
          </label>

          {/* Photo Grid */}
          {(photoPreviews.length > 0 || processing > 0 || loadingExisting > 0) && (
            <div className="photo-grid">
              {/*
                Плитки-скелетоны стоят ровно там, где появятся фотографии:
                столько же, сколько сейчас читается из базы или уменьшается.
                Без них сетка подпрыгивала на высоту ряда в момент подстановки.
              */}
              {Array.from({ length: loadingExisting + processing }, (_, index) => (
                <div key={`skeleton-${index}`} className="photo-thumb photo-thumb--skeleton skeleton" />
              ))}

              {photoPreviews.map((photoPreview, index) => (
                <div key={index} className="photo-thumb">
                  {/*
                    Пустой `url` означает, что под ключом в базе блоба нет:
                    `getByPlantId` ставит на это место пустую строку, чтобы одна
                    пропавшая фотография не обрушила остальные. Без ветки здесь
                    оказался бы `<img src="">`.
                  */}
                  {photoPreview.url ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={photoPreview.url} alt={`Preview ${index + 1}`} />
                  ) : (
                    <span className="photo-thumb-missing">Photo unavailable</span>
                  )}
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
          <p className="field-hint" aria-live="polite">
            {processing > 0
              ? `Preparing ${processing} ${processing === 1 ? 'photo' : 'photos'}…`
              : photoPreviews.length === 0
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
          <label className="field-label" htmlFor="plant-acquired-on">
            Acquired (optional):
          </label>
          <input
            id="plant-acquired-on"
            type="date"
            value={acquiredOn}
            onChange={(e) => setAcquiredOn(e.target.value)}
            className="field-input"
            max={today}
          />
        </div>

        <div className="field">
          <label className="field-label" htmlFor="plant-source">
            Source (optional):
          </label>
          <input
            id="plant-source"
            type="text"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="field-input"
            placeholder="Nursery, shop, a friend…"
          />
        </div>

        <div className="field">
          <label className="field-label">Notes (optional):</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            className="field-input field-input--area"
            placeholder="Add any notes about this plant…"
          />
        </div>
      </div>

      {/* Fixed Action Buttons */}
      <div className="form-actions">
        <button type="button" onClick={onCancel} className="btn btn--secondary">
          Cancel
        </button>
        <button type="submit" className="btn btn--primary" disabled={isSubmitting || processing > 0}>
          {initialPlant ? 'Save changes' : 'Add plant'}
        </button>
      </div>
    </form>
  )
}
