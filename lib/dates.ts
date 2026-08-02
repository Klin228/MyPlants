/**
 * Календарные даты вида `YYYY-MM-DD`.
 *
 * Ни одна функция здесь не создаёт `Date` из строки и не форматирует через
 * `toLocaleDateString`. Причина одна и та же: `new Date('2024-03-12')`
 * разбирается как полночь UTC, и в любом поясе западнее Гринвича обратно
 * получается одиннадцатое марта. Работа со строкой напрямую от этого избавлена.
 */

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * Показать дату человеку: `2024-03-12` → `12 Mar 2024`.
 *
 * Непонятную строку возвращает как есть — показать сырое значение честнее,
 * чем нарисовать «Invalid Date» или спрятать данные.
 */
export function formatCalendarDate(value: string): string {
  const parts = DATE_PATTERN.exec(value)
  if (!parts) return value

  const [, year, month, day] = parts
  const monthName = MONTHS[Number(month) - 1]
  if (!monthName) return value

  return `${Number(day)} ${monthName} ${year}`
}

/**
 * Сегодняшняя дата в том формате, который понимает `<input type="date">`.
 *
 * Собирается из локальных частей даты, а не из `toISOString`: последний
 * отдаёт UTC, и вечером в UTC+3 «сегодня» превратилось бы во вчера.
 */
export function todayAsDateInput(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')

  return `${now.getFullYear()}-${month}-${day}`
}
