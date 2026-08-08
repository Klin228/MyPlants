'use client'

import { useState, FormEvent, useEffect, useMemo, useRef } from 'react'
import { X } from 'lucide-react'
import type { NewPlant, Plant } from '@/lib/models/plant'
import { photosRepository } from '@/lib/repositories/photosRepository'
import { LOCAL_PHOTO_MAX_SIZE, resizeToJpeg } from '@/lib/images'
/*
 * Пределы формы — те же, что у публикации, и берутся оттуда же.
 *
 * Своих чисел здесь нет намеренно: разойдись они, и человек спокойно набрал бы
 * заметку, которую потом невозможно опубликовать, — узнав об этом через месяц,
 * при попытке поделиться. Ограничение в поле дешевле любого сообщения об
 * ошибке. Найдено ревью F3 (тикет X9).
 */
import { LIMITS } from '@/lib/sharing/limits'
import { SPECIES_CATALOG } from '@/lib/data/speciesCatalog'
import { buildSpeciesSuggestions, looksLikeBinomial, normalizeSpeciesInput } from '@/lib/species'
import { todayAsDateInput } from '@/lib/dates'

interface AddPlantFormProps {
  /**
   * Может вернуть промис — и тогда форма его дождётся.
   *
   * Раньше тип был `void`, вызов шёл без `await`, и `setIsSubmitting(false)`
   * срабатывал до конца записи в базу: кнопка разблокировалась сразу, а два
   * быстрых нажатия давали две копии фотографий. Оба обработчика в приложении
   * асинхронные, то есть промис возвращали всегда — терялся он здесь. Найдено
   * ревью F3.
   */
  onAddPlant: (plant: NewPlant) => void | Promise<void>
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
  /**
   * Размеры уменьшенного блоба. `resizeToJpeg` их и так возвращает, а карточке
   * они нужны, чтобы взять форму рамки у фотографии (тикет X5): без записи рядом
   * с блобом их пришлось бы добывать обратной расшифровкой при первом показе.
   */
  size?: { width: number; height: number }
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
  /**
   * Тот же признак в ref — по нему и принимается решение.
   *
   * `setIsSubmitting(true)` перерисовывает форму не сразу, а `if (isSubmitting)`
   * читает значение из замыкания текущего рендера. Два нажатия в одном кадре
   * оба видят `false` и оба пишут — то есть `await` ниже закрывает окно только
   * после первой перерисовки, а до неё дверь остаётся открытой. Правило
   * «решения по ref, отрисовка по состоянию» записано в `CLAUDE.md` про жесты,
   * и причина здесь ровно та же.
   */
  const submittingRef = useRef(false)
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
    /*
     * Флаг отмены обязателен, и сначала его здесь не было — независимое ревью
     * (F3) поймало утечку. Чтение блобов из базы занимает заметное время; если
     * человек за это время ушёл с экрана, `then` всё равно звал `rememberUrl`,
     * добавляя указатели в набор, который cleanup уже прошёл и очистил.
     * Освобождать их становилось некому — ровно то, от чего защищаются
     * `PhotoGallery` и `FullscreenPhotoViewer`.
     */
    let cancelled = false

    if (initialPlant) {
      setName(initialPlant.name)
      setSpecies(initialPlant.species || '')
      setPrice(initialPlant.price === undefined ? '' : initialPlant.price.toString())
      setAcquiredOn(initialPlant.acquiredOn || '')
      setSource(initialPlant.source || '')
      setNotes(initialPlant.notes || '')

      // Load photo previews from repository
      if (initialPlant.photos && initialPlant.photos.length > 0) {
        setLoadingExisting(initialPlant.photos.length)
        photosRepository.getByPlantId(initialPlant.photos)
          .then(urls => {
            // Экран уже покинут: указатели созданы, показывать их некому —
            // освобождаем сразу, иначе они не достанутся никому.
            if (cancelled) {
              photosRepository.revokeUrls(urls)
              return
            }
            setPhotoPreviews(urls.map((url, index) => ({
              url: rememberUrl(url),
              key: initialPlant.photos[index]
            })))
          })
          .catch(error => {
            console.error('Error loading photo previews:', error)
            if (!cancelled) setPhotoPreviews([])
          })
          .finally(() => {
            if (!cancelled) setLoadingExisting(0)
          })
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

    return () => {
      cancelled = true
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
     * Больше предела фотографий не берём.
     *
     * `processing` учитывается наравне с уже готовыми превью: уменьшение идёт
     * асинхронно, и без него два быстрых выбора по шесть снимков дали бы
     * двенадцать — та же ошибка, от которой защищается отправка формы.
     */
    const room = LIMITS.photosPerPlant - photoPreviews.length - processing
    if (room <= 0) {
      alert(`At most ${LIMITS.photosPerPlant} photos per plant. Remove one to add another.`)
      e.target.value = ''
      return
    }

    const accepted = imageFiles.slice(0, room)
    if (accepted.length < imageFiles.length) {
      alert(
        `At most ${LIMITS.photosPerPlant} photos per plant, so ${accepted.length} of ` +
          `${imageFiles.length} selected will be added.`
      )
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
    setProcessing((count) => count + accepted.length)

    Promise.allSettled(accepted.map((file) => resizeToJpeg(file, LOCAL_PHOTO_MAX_SIZE)))
      .then((results) => {
        const added: PhotoPreview[] = []
        let failed = 0

        results.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            const url = URL.createObjectURL(result.value.blob)
            added.push({
              url: rememberUrl(url),
              blob: result.value.blob,
              size: { width: result.value.width, height: result.value.height },
            })
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
        setProcessing((count) => Math.max(0, count - accepted.length))
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
    
    if (submittingRef.current) return

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

    /*
     * Цена необязательна (тикет J5), и пустое поле — законный ответ, а не
     * недозаполненная форма.
     *
     * Три состояния, а не два: пусто — «не указана», ноль — известная цена
     * (подарок, черенок от подруги), число — цена. Первые два раньше
     * схлопывались в ноль, потому что деться от обязательного поля было некуда.
     *
     * Проверка осталась только на введённое: мусор в поле по-прежнему не
     * пропускаем. Ноль допустим — с прежним условием `<= 0` подаренное растение
     * нельзя было даже переименовать, не выдумав цену (поймано ревью F3).
     */
    const trimmedPrice = price.trim()
    let parsedPrice: number | undefined

    if (trimmedPrice !== '') {
      const value = parseFloat(trimmedPrice)
      if (isNaN(value) || value < 0) {
        alert('Price should be a number, 0 or more — or left empty')
        return
      }
      parsedPrice = value
    }

    // Верхняя граница та же, что у публикации: `maxLength` цену не ограничивает,
    // а `1e308` в поле — это не жадность, а мусор, который потом не уедет.
    if (parsedPrice !== undefined && parsedPrice > LIMITS.maxPrice) {
      alert(`That price is too large. At most ${LIMITS.maxPrice.toLocaleString('en-US')}.`)
      return
    }

    submittingRef.current = true
    setIsSubmitting(true)

    try {
      // Separate new photos from existing ones (by key)
      const fresh = photoPreviews.filter(p => p.blob)
      const existingKeys = photoPreviews.filter(p => p.key).map(p => p.key!)

      // Save new photos to repository. Блобы уже уменьшены при выборе файла.
      let photoKeys: string[] = [...existingKeys]
      if (fresh.length > 0) {
        // For new photos, we need a plantId - use a temporary one for now
        // The actual plantId will be set when the plant is created
        const tempPlantId = 'temp'
        const newKeys = await Promise.all(
          fresh.map(photo => photosRepository.addPhoto(tempPlantId, photo.blob!, photo.size))
        )
        photoKeys = [...existingKeys, ...newKeys]
      }

      // Call the parent handler with photo keys
      await onAddPlant({
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
      submittingRef.current = false
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="form">
      {/* Form Fields - Scrollable */}
      <div className="form-fields">
        {/*
          Правило обязательности названо словами, а не только звёздочками (J5).

          Раньше подписи говорили три разные вещи сразу: у одних полей стояла
          звёздочка, у других «(optional)», у третьих ничего — и «Species:» без
          пометки читалось как «наверное, тоже надо». Обязательных всего два,
          поэтому правило проще назвать, чем размечать каждое поле.
        */}
        <p className="field-legend">
          Only <b>name</b> and <b>photo</b> are required — everything else is up to you.
        </p>

        <div className="field">
          <label className="field-label">
            Plant name: <span className="field-required">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="field-input"
            maxLength={LIMITS.name}
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
            maxLength={LIMITS.species}
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
            disabled={photoPreviews.length + processing >= LIMITS.photosPerPlant}
          />
          <p className="field-hint" aria-live="polite">
            {processing > 0
              ? `Preparing ${processing} ${processing === 1 ? 'photo' : 'photos'}…`
              : photoPreviews.length === 0
                ? 'Upload at least one photo'
                : photoPreviews.length >= LIMITS.photosPerPlant
                  ? `All ${LIMITS.photosPerPlant} photos added — that is the most one plant can have`
                  : `You can add more photos (${photoPreviews.length} ${photoPreviews.length === 1 ? 'photo' : 'photos'} added)`}
          </p>
        </div>

        <div className="field">
          <label className="field-label" htmlFor="plant-price">
            Price:
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            max={LIMITS.maxPrice}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="field-input"
            id="plant-price"
          />
        </div>

        <div className="field">
          <label className="field-label" htmlFor="plant-acquired-on">
            Acquired:
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
            Source:
          </label>
          <input
            id="plant-source"
            type="text"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="field-input"
            maxLength={LIMITS.source}
            placeholder="Nursery, shop, a friend…"
          />
        </div>

        <div className="field">
          <label className="field-label" htmlFor="plant-notes">Notes:</label>
          <textarea
            id="plant-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            className="field-input field-input--area"
            maxLength={LIMITS.notes}
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
