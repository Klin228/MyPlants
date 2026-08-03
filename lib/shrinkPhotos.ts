/**
 * Разовое уменьшение уже сохранённых фотографий.
 *
 * Уменьшение перед записью включили в тикете D5. У тех, кто набрал коллекцию
 * раньше, в базе лежат исходные снимки с телефона — по 3–8 МБ каждый, и сами они
 * оттуда не денутся: приложение читает их как есть.
 *
 * **Это перезапись данных пользователя, и обращаться с ней надо соответственно.**
 * Отсюда все правила ниже.
 *
 * - **По явному нажатию, а не само.** Сорок снимков это минуты расшифровки и
 *   перекодирования; делать это молча на старте, тратя батарею и рискуя чужими
 *   данными, никто не просил. Кнопка появляется только когда есть что уменьшать.
 * - **Каждая фотография — своя транзакция.** Прервалось на середине (закрыли
 *   вкладку, кончилось место) — часть уменьшена, часть нет, и это законное
 *   состояние: следующий запуск продолжит с того же места.
 * - **Блоб заменяется одним `put` под тем же ключом.** Ни в один момент ключ не
 *   остаётся без блоба, поэтому «потерять фотографию» тут нечем — в отличие от
 *   схемы «удалить старую, записать новую».
 * - **Результат принимается только если он существенно меньше.** Иначе повторный
 *   запуск пережимал бы уже пережатое, теряя качество на каждом круге. С этим
 *   правилом второй запуск не делает ничего.
 * - **Нерасшифровываемая фотография остаётся как есть** и попадает в отчёт.
 *   Уронить всю операцию из-за одного битого блоба значило бы не уменьшить и
 *   остальные.
 * - **Размеры обновляются той же транзакцией.** После уменьшения они другие, а из
 *   них берётся форма карточки (тикет X5) — разойдись они с блобом, и карточка
 *   покажет кроп не той пропорции.
 */

import { LOCAL_PHOTO_MAX_SIZE, measureImage, resizeToJpeg } from './images'
import { photosRepository, type PhotoSize } from './repositories/photosRepository'

/**
 * Вес, выше которого фотографию стоит проверить, даже если её размеры в пределах.
 *
 * Правильно уменьшенный снимок в 1600 точек по длинной стороне весит 250–400 КБ.
 * Полтора мегабайта означают либо исходник, либо PNG, перекодированный без
 * уменьшения, — то есть кандидата.
 */
const HEAVY_BYTES = 1_500_000

/**
 * Порог, при котором кнопка вообще предлагается: ниже него уменьшать нечего.
 *
 * Мегабайт, а не `HEAVY_BYTES`: предложение считается по весу без расшифровки, и
 * лучше предложить лишний раз, чем не предложить тому, у кого снимки чуть меньше
 * полутора мегабайт.
 */
const OFFER_BYTES = 1_000_000

/** Насколько меньше должен стать блоб, чтобы перезапись имела смысл. */
const REQUIRED_GAIN = 0.8

export interface PhotoStorageStats {
  /** Сколько фотографий в базе. */
  photos: number
  /** Сколько они занимают. */
  bytes: number
  /** Сколько из них похожи на неуменьшенные — по весу, без расшифровки. */
  heavy: number
}

/**
 * Посмотреть, что лежит в базе, ничего не расшифровывая.
 *
 * `blob.size` это метаданные: чтение значения из IndexedDB не тянет байты в
 * память, блоб остаётся ссылкой на файл. Поэтому проверку можно звать при
 * открытии экрана.
 */
export async function inspectPhotos(): Promise<PhotoStorageStats> {
  const entries = await photosRepository.listPhotos()
  const known = await photosRepository.getStoredSizes(entries.map((entry) => entry.key))

  /*
   * Кандидат считается тем же правилом, по которому проход решает, трогать ли
   * фотографию, — иначе предложение врёт.
   *
   * Сначала здесь было просто «весит больше мегабайта», и получилось предложение,
   * которое ничего не делает: шумная фотография 1600×1200 на 1.27 МБ в пределах и
   * перекодированием не выигрывает, а кнопка звала уменьшать её снова и снова.
   * Теперь тяжёлый вес сам по себе кандидатом не делает: нужно либо совсем большой
   * вес (тогда стоит попробовать перекодировать), либо размеры вне предела, либо
   * неизвестные размеры — их проход всё равно посмотрит.
   */
  const heavy = entries.filter((entry) => {
    if (entry.bytes <= OFFER_BYTES) return false

    const size = known[entry.key]
    return entry.bytes > HEAVY_BYTES || !size || !withinLimit(size)
  })

  return {
    photos: entries.length,
    bytes: entries.reduce((sum, entry) => sum + entry.bytes, 0),
    heavy: heavy.length,
  }
}

export interface ShrinkProgress {
  done: number
  total: number
}

export interface ShrinkResult {
  /** Сколько фотографий переписано. */
  shrunk: number
  /** Сколько оставлено как есть: уже в пределах или выигрыш не оправдывал перезапись. */
  kept: number
  /** Сколько не удалось расшифровать. Эти тоже остались как есть. */
  failed: number
  bytesBefore: number
  bytesAfter: number
}

/**
 * Уменьшить всё, что стоит уменьшить.
 *
 * @param onProgress зовётся после каждой фотографии — операция долгая, и молчать
 *                   минуту нельзя
 */
export async function shrinkStoredPhotos(
  onProgress?: (progress: ShrinkProgress) => void
): Promise<ShrinkResult> {
  const entries = await photosRepository.listPhotos()
  const known = await photosRepository.getStoredSizes(entries.map((entry) => entry.key))

  const result: ShrinkResult = { shrunk: 0, kept: 0, failed: 0, bytesBefore: 0, bytesAfter: 0 }
  let done = 0

  for (const { key, bytes } of entries) {
    result.bytesBefore += bytes

    /*
     * Счётчик и отчёт о ходе — в `finally`, а не в конце тела цикла: ниже есть
     * `continue` на каждый вид отказа, и после них конец тела не выполняется.
     * Сначала так и было, и полоса прогресса стояла на месте у тех, у кого
     * уменьшать почти нечего.
     */
    try {
      const size = known[key] ?? null

      /*
       * Дешёвый отказ: размеры известны, они в пределах, вес обычный — трогать
       * нечего, и расшифровывать незачем. Именно это делает повторный запуск
       * почти мгновенным.
       */
      if (size && withinLimit(size) && bytes <= HEAVY_BYTES) {
        result.kept += 1
        result.bytesAfter += bytes
        continue
      }


      const blob = await photosRepository.getBlobById(key)

      // Размеров не было — обмерим прежде, чем решать. Обмер дешевле
      // перекодирования: расшифровка без записи.
      const actual = size ?? (await measureImage(blob))

      if (withinLimit(actual) && bytes <= HEAVY_BYTES) {
        // Заодно дописываем размеры: следующий запуск обойдётся без расшифровки
        await photosRepository.rememberSize(key, actual)
        result.kept += 1
        result.bytesAfter += bytes
        continue
      }

      const resized = await resizeToJpeg(blob, LOCAL_PHOTO_MAX_SIZE)

      if (resized.blob.size > bytes * REQUIRED_GAIN) {
        // Выигрыш не оправдывает перезапись — оставляем оригинал, но размеры
        // записываем, чтобы больше к этой фотографии не возвращаться
        await photosRepository.rememberSize(key, actual)
        result.kept += 1
        result.bytesAfter += bytes
        continue
      }

      await photosRepository.replacePhoto(key, resized.blob, {
        width: resized.width,
        height: resized.height,
      })

      result.shrunk += 1
      result.bytesAfter += resized.blob.size
    } catch (error) {
      // Битый или неизвестного формата блоб. Он остаётся на месте: наша задача
      // уменьшить, а не почистить.
      console.warn(`Фотографию ${key} уменьшить не удалось, оставлена как есть:`, error)
      result.failed += 1
      result.bytesAfter += bytes
    } finally {
      done += 1
      onProgress?.({ done, total: entries.length })
    }
  }

  return result
}

function withinLimit({ width, height }: PhotoSize): boolean {
  return Math.max(width, height) <= LOCAL_PHOTO_MAX_SIZE
}
