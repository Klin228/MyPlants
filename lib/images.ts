/**
 * Уменьшение изображений.
 *
 * Работает с блобами и только с блобами: ни `readAsDataURL`, ни строк base64
 * здесь нет и быть не должно. Снимок с телефона это 3–8 МБ, и превращать его
 * в строку, которая на треть больше двоичных данных и целиком висит в памяти,
 * — ровно та ошибка, из-за которой на iOS выгружало вкладку.
 */

export interface ResizedImage {
  blob: Blob
  width: number
  height: number
}

/** Сторона, к которой приводится публикуемая фотография. */
export const PUBLIC_PHOTO_MAX_SIZE = 1200

/**
 * Сторона, к которой приводится фотография при записи в базу устройства.
 *
 * Больше публикационной намеренно, по двум причинам.
 *
 * Первая: полноэкранный просмотр показывает фотографию во всю ширину экрана, и
 * на телефоне с трёхкратной плотностью это уже около 1200 точек, а на ноутбуке
 * больше. Хранить ровно 1200 значит показывать растянутое.
 *
 * Вторая: публикация уменьшает **из этого** блоба до 1200. Если хранить тоже
 * 1200, публикуемая фотография получит второе сжатие JPEG в тех же размерах —
 * потеря качества без выигрыша в весе. С 1600 это одно честное уменьшение.
 *
 * Цена — вес: 1600 против 1200 это примерно вдвое больше пикселей. Но исходный
 * снимок с телефона всё равно 3–8 МБ, а тут выходит 250–400 КБ.
 */
export const LOCAL_PHOTO_MAX_SIZE = 1600

/** Качество JPEG. Ниже 0.7 на листьях видны артефакты, выше 0.9 растёт вес. */
const JPEG_QUALITY = 0.82

/**
 * Уменьшить изображение так, чтобы длинная сторона не превышала `maxSize`, и
 * перекодировать в JPEG.
 *
 * Меньше исходника не растягиваем: увеличение не добавляет деталей, только
 * вес. Перекодируем всё равно — единый формат упрощает и пути в хранилище, и
 * предсказуемость размера.
 *
 * @returns блоб и его настоящие размеры после уменьшения
 */
export async function resizeToJpeg(
  source: Blob,
  maxSize: number = PUBLIC_PHOTO_MAX_SIZE,
  quality: number = JPEG_QUALITY
): Promise<ResizedImage> {
  const { image, release } = await decode(source)

  try {
    const scale = Math.min(1, maxSize / Math.max(image.width, image.height))
    const width = Math.max(1, Math.round(image.width * scale))
    const height = Math.max(1, Math.round(image.height * scale))

    const blob = await encode(image, width, height, quality)
    return { blob, width, height }
  } finally {
    release()
  }
}

type DecodedImage = CanvasImageSource & { width: number; height: number }

/**
 * Разобрать блоб в то, что умеет рисовать canvas.
 *
 * `createImageBitmap` быстрее и не трогает DOM, но на старых версиях Safari
 * его нет. Запасной путь через `<img>` и object URL — с обязательным
 * освобождением URL, иначе блоб останется в памяти до перезагрузки вкладки.
 *
 * `imageOrientation: 'from-image'` важен: снимки с телефона хранят поворот в
 * EXIF, и без учёта ориентации половина фотографий уедет на публичную
 * страницу лежа на боку.
 */
async function decode(source: Blob): Promise<{ image: DecodedImage; release: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(source, { imageOrientation: 'from-image' })
      return { image: bitmap, release: () => bitmap.close() }
    } catch {
      // Проваливаемся в запасной путь: причина не важна, важен результат
    }
  }

  const url = URL.createObjectURL(source)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = () => reject(new Error('Could not decode the image'))
      element.src = url
    })
    return { image, release: () => URL.revokeObjectURL(url) }
  } catch (error) {
    URL.revokeObjectURL(url)
    throw error
  }
}

/**
 * Нарисовать изображение в нужном размере и получить JPEG.
 *
 * `OffscreenCanvas` не требует ничего от DOM, но появился в Safari только в
 * 16.4 — поэтому есть и путь через обычный `<canvas>`.
 */
async function encode(
  image: CanvasImageSource,
  width: number,
  height: number,
  quality: number
): Promise<Blob> {
  if (typeof OffscreenCanvas === 'function') {
    const canvas = new OffscreenCanvas(width, height)
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Could not get an OffscreenCanvas context')

    context.drawImage(image, 0, 0, width, height)
    return canvas.convertToBlob({ type: 'image/jpeg', quality })
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d')
  if (!context) throw new Error('Could not get a canvas context')

  context.drawImage(image, 0, 0, width, height)

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('canvas produced no image'))),
      'image/jpeg',
      quality
    )
  })
}

/**
 * Хеш содержимого файла — основа адресации в хранилище.
 *
 * Одинаковые байты дают одинаковый путь, поэтому повторная публикация не
 * плодит копии, а перезаписывает то же место.
 *
 * `crypto.subtle` доступен только в защищённом контексте. По https и на
 * localhost он есть; при открытии приложения с телефона по локальной сети
 * (`npm run dev -- -H 0.0.0.0`) — нет, и притворяться нечем: подставлять
 * другой алгоритм нельзя, иначе те же фотографии получат другие пути и
 * дубликаты появятся именно там, где мы их избегаем.
 */
export async function hashBlob(blob: Blob): Promise<string> {
  if (!crypto.subtle) {
    throw new Error(
      'Publishing needs a secure connection: crypto.subtle is unavailable over http. ' +
        'Open the app over https or on localhost.'
    )
  }

  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}
