/**
 * Минимальный ZIP: запись и чтение, без сжатия.
 *
 * Своё, а не библиотека — сторонние зависимости в этом проекте добавляются
 * только по согласованию, а нужна одна сотая возможностей архиватора: сложить
 * несколько файлов в один и разобрать обратно.
 *
 * Без сжатия («store») сознательно. Содержимое резервной копии — это JPEG,
 * которые уже сжаты; deflate над ними даёт проценты и требует либо `CompressionStream`
 * (нет в Safari до 16.4), либо своей реализации deflate, а это уже настоящая
 * библиотека. Файл получается размером с сумму фотографий, что для резервной
 * копии ровно то, что нужно.
 *
 * Формат описан в спецификации APPNOTE.TXT от PKWARE. Здесь три структуры:
 * заголовок перед каждым файлом, каталог в конце и запись о каталоге.
 *
 * ZIP64 не поддерживается: размеры и смещения в базовом формате
 * четырёхбайтные, то есть предел — 4 ГБ на архив. Коллекция из сорока
 * растений это порядка десяти мегабайт, так что до предела далеко, но
 * молча писать испорченный файл нельзя — есть явная проверка.
 */

const LOCAL_HEADER = 0x04034b50
const CENTRAL_HEADER = 0x02014b50
const END_OF_CENTRAL = 0x06054b50

/** Метод «сложить как есть». */
const STORED = 0

/**
 * Флаг «имена файлов в UTF-8».
 *
 * Без него читающая сторона вправе считать имена в кодировке CP437, и любое
 * неанглийское имя приедет мусором. Мы пишем только латиницу, но флаг честнее
 * ставить, чем полагаться на это.
 */
const UTF8_FLAG = 0x0800

/** Предел базового формата: дальше нужен ZIP64. */
const MAX_SIZE = 0xffffffff

export interface ZipEntry {
  name: string
  data: Uint8Array
}

/**
 * Таблица CRC-32.
 *
 * Считается один раз при первом обращении, а не при загрузке модуля: если
 * резервную копию так и не откроют, 256 итераций не нужны вовсе.
 */
let crcTable: Uint32Array | null = null

function getCrcTable(): Uint32Array {
  if (crcTable) return crcTable

  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let value = i
    for (let bit = 0; bit < 8; bit++) {
      // 0xedb88320 — обратный полином CRC-32, тот же, что в ZIP, PNG и gzip
      value = value & 1 ? (value >>> 1) ^ 0xedb88320 : value >>> 1
    }
    table[i] = value
  }

  crcTable = table
  return table
}

export function crc32(data: Uint8Array): number {
  const table = getCrcTable()
  let crc = 0xffffffff

  for (let i = 0; i < data.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ data[i]) & 0xff]
  }

  return (crc ^ 0xffffffff) >>> 0
}

/**
 * Дата и время изменения в формате MS-DOS.
 *
 * Древний формат с двухсекундной точностью: время — часы, минуты и половины
 * секунд, дата — год от 1980. Точность здесь никого не интересует, но поля
 * обязательные, и оставлять там нули значит получить в архиваторах «1 января
 * 1980».
 */
function dosDateTime(date: Date): { time: number; date: number } {
  const year = Math.max(1980, date.getFullYear())
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  }
}

/** Небольшой помощник: пишем числа и байты подряд, следя за смещением. */
class Writer {
  private view: DataView
  private bytes: Uint8Array
  offset = 0

  constructor(size: number) {
    this.bytes = new Uint8Array(size)
    this.view = new DataView(this.bytes.buffer)
  }

  u16(value: number) {
    this.view.setUint16(this.offset, value, true)
    this.offset += 2
  }

  u32(value: number) {
    this.view.setUint32(this.offset, value, true)
    this.offset += 4
  }

  raw(data: Uint8Array) {
    this.bytes.set(data, this.offset)
    this.offset += data.length
  }

  done(): Uint8Array {
    return this.bytes
  }
}

/**
 * Сложить файлы в архив.
 *
 * Размер считается заранее и буфер выделяется один раз: иначе пришлось бы
 * склеивать куски, а для десяти мегабайт фотографий это лишняя копия в памяти.
 *
 * @param modified время изменения для всех записей — передаётся, а не берётся
 *   из `Date.now()`, чтобы одинаковая копия давала одинаковый файл
 */
export function createZip(entries: ZipEntry[], modified: Date): Uint8Array {
  const encoder = new TextEncoder()
  const prepared = entries.map((entry) => {
    const name = encoder.encode(entry.name)
    if (entry.data.length > MAX_SIZE) {
      throw new Error(`File ${entry.name} is too large for a plain zip archive`)
    }
    return { name, data: entry.data, crc: crc32(entry.data) }
  })

  const localSize = prepared.reduce((sum, e) => sum + 30 + e.name.length + e.data.length, 0)
  const centralSize = prepared.reduce((sum, e) => sum + 46 + e.name.length, 0)

  if (localSize + centralSize + 22 > MAX_SIZE) {
    throw new Error('The archive would exceed 4 GB, which a plain zip cannot address')
  }

  const { time, date } = dosDateTime(modified)
  const writer = new Writer(localSize + centralSize + 22)
  const offsets: number[] = []

  for (const entry of prepared) {
    offsets.push(writer.offset)

    writer.u32(LOCAL_HEADER)
    writer.u16(20) // версия, которая нужна для чтения: 2.0
    writer.u16(UTF8_FLAG)
    writer.u16(STORED)
    writer.u16(time)
    writer.u16(date)
    writer.u32(entry.crc)
    writer.u32(entry.data.length) // сжатый размер равен исходному
    writer.u32(entry.data.length)
    writer.u16(entry.name.length)
    writer.u16(0) // дополнительное поле не используем
    writer.raw(entry.name)
    writer.raw(entry.data)
  }

  const centralStart = writer.offset

  prepared.forEach((entry, index) => {
    writer.u32(CENTRAL_HEADER)
    writer.u16(20) // кем создан
    writer.u16(20) // что нужно для чтения
    writer.u16(UTF8_FLAG)
    writer.u16(STORED)
    writer.u16(time)
    writer.u16(date)
    writer.u32(entry.crc)
    writer.u32(entry.data.length)
    writer.u32(entry.data.length)
    writer.u16(entry.name.length)
    writer.u16(0) // дополнительное поле
    writer.u16(0) // комментарий
    writer.u16(0) // номер диска — многотомных архивов у нас не бывает
    writer.u16(0) // внутренние атрибуты
    writer.u32(0) // внешние атрибуты
    writer.u32(offsets[index])
    writer.raw(entry.name)
  })

  writer.u32(END_OF_CENTRAL)
  writer.u16(0) // номер этого диска
  writer.u16(0) // диск, где начинается каталог
  writer.u16(prepared.length)
  writer.u16(prepared.length)
  writer.u32(centralSize)
  writer.u32(centralStart)
  writer.u16(0) // комментарий архива

  return writer.done()
}

/**
 * Разобрать архив.
 *
 * Читается каталог в конце, а не заголовки подряд: так задумано форматом, и
 * только каталог даёт достоверный список — заголовки могут содержать нулевые
 * размеры, если архиватор писал потоком.
 *
 * Кидает понятную ошибку на всём, чего не понимает: человек выбрал файл
 * вручную, и «это не наш архив» ему полезнее молчаливого пропуска.
 */
export function readZip(bytes: Uint8Array): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

  // Запись о каталоге ищется с конца: после неё может быть комментарий
  // переменной длины, поэтому фиксированного смещения нет.
  let eocd = -1
  for (let i = bytes.length - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === END_OF_CENTRAL) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw new Error('This file is not a zip archive')

  const count = view.getUint16(eocd + 10, true)
  const centralStart = view.getUint32(eocd + 16, true)
  if (centralStart >= bytes.length) throw new Error('The archive is damaged: bad directory offset')

  const decoder = new TextDecoder()
  const entries: ZipEntry[] = []
  let cursor = centralStart

  for (let i = 0; i < count; i++) {
    if (view.getUint32(cursor, true) !== CENTRAL_HEADER) {
      throw new Error('The archive is damaged: unexpected directory entry')
    }

    const method = view.getUint16(cursor + 10, true)
    const storedCrc = view.getUint32(cursor + 16, true)
    const size = view.getUint32(cursor + 24, true)
    const nameLength = view.getUint16(cursor + 28, true)
    const extraLength = view.getUint16(cursor + 30, true)
    const commentLength = view.getUint16(cursor + 32, true)
    const localOffset = view.getUint32(cursor + 42, true)
    const name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength))

    if (method !== STORED) {
      throw new Error(`${name} is compressed, which this app cannot read`)
    }

    // Данные лежат за локальным заголовком, и длина имени с дополнительным
    // полем там своя — брать её из каталога нельзя.
    if (view.getUint32(localOffset, true) !== LOCAL_HEADER) {
      throw new Error(`The archive is damaged: no header for ${name}`)
    }
    const localNameLength = view.getUint16(localOffset + 26, true)
    const localExtraLength = view.getUint16(localOffset + 28, true)
    const dataStart = localOffset + 30 + localNameLength + localExtraLength

    if (dataStart + size > bytes.length) {
      throw new Error(`The archive is damaged: ${name} is cut off`)
    }

    const data = bytes.subarray(dataStart, dataStart + size)

    // Проверка целостности не формальность: битый архив лучше отвергнуть, чем
    // положить в коллекцию испорченную фотографию.
    if (crc32(data) !== storedCrc) {
      throw new Error(`${name} is damaged: checksum does not match`)
    }

    entries.push({ name, data })
    cursor += 46 + nameLength + extraLength + commentLength
  }

  return entries
}
