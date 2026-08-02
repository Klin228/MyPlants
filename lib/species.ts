/**
 * Вид растения.
 *
 * Поле свободное: пользователь пишет что хочет. Чтобы при этом «Monstera
 * deliciosa» и «monstera  deliciosa» считались одним и тем же видом, для
 * сравнения используется нормализованный ключ.
 *
 * Ключ нигде не хранится — считается на лету. Значит правила нормализации
 * можно менять без миграции базы.
 */

/**
 * Привести введённое значение к тому виду, в котором оно уйдёт в базу.
 *
 * Только пробелы: лишние по краям и повторы внутри. Регистр и всё остальное —
 * как набрал пользователь. Он лучше знает, как пишется его сорт.
 */
export function normalizeSpeciesInput(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ')
}

/**
 * Ключ для поиска, сопоставления коллекций и склейки подсказок.
 *
 * Кроме регистра и пробелов приводит типографские кавычки к простому
 * апострофу. Это не косметика: телефонная клавиатура подставляет `’`
 * автоматически, и `Monstera deliciosa 'Thai Constellation'`, набранная на
 * телефоне и на маке, иначе оказалась бы двумя разными видами.
 */
export function speciesKey(value: string | undefined): string {
  if (!value) return ''

  return value
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .toLowerCase()
}

/**
 * Похоже ли имя на латинский биномен, который стоит предложить как вид.
 *
 * Ровно два слова, только латинские буквы, второе слово строчными. Проходят
 * «Monstera deliciosa» и «monstera deliciosa»; не проходят «Моя монстера»
 * (кириллица) и «Big Monstera» (второе слово с заглавной — так пишут кличку,
 * а не видовой эпитет).
 */
export function looksLikeBinomial(name: string): boolean {
  const words = normalizeSpeciesInput(name).split(' ')
  if (words.length !== 2) return false

  const [genus, epithet] = words
  return /^[A-Za-z]{3,}$/.test(genus) && /^[a-z]{3,}$/.test(epithet)
}

/**
 * Собрать список подсказок: сначала виды из своей коллекции, следом каталог.
 *
 * Свои идут первыми не случайно — то, что человек уже заводил, он заведёт
 * снова с большей вероятностью, чем случайную строку из справочника.
 * Дубликаты убираются по ключу, поэтому «Monstera deliciosa» из коллекции
 * скроет одноимённую запись каталога, а не удвоит её.
 */
export function buildSpeciesSuggestions(own: string[], catalog: readonly string[]): string[] {
  // Написание из каталога считается образцовым
  const canonical = new Map<string, string>()
  for (const value of catalog) {
    canonical.set(speciesKey(value), normalizeSpeciesInput(value))
  }

  const seen = new Set<string>()
  const result: string[] = []

  const add = (value: string) => {
    const normalized = normalizeSpeciesInput(value)
    const key = speciesKey(normalized)
    if (!key || seen.has(key)) return

    seen.add(key)
    // Пользователь мог набрать «monstera deliciosa» строчными, и именно эта
    // запись могла прийти из базы первой — порядок чтения произвольный.
    // В подсказке показываем каноническое написание, если вид есть в каталоге.
    result.push(canonical.get(key) ?? normalized)
  }

  own.forEach(add)
  catalog.forEach(add)

  return result
}
