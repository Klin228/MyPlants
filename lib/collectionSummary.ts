/**
 * Сводка коллекции одной строкой: «6 plants · 4 species».
 *
 * Функция жила в двух копиях — на публичной странице и в картинке превью, — и
 * с переездом суммы в шапку главного экрана появилась бы третья. Правила
 * единственного числа в трёх местах неизбежно разошлись бы.
 *
 * Модуль намеренно без серверных зависимостей: им пользуются и серверная
 * витрина, и клиентский главный экран.
 */

import { speciesKey } from './species'

/**
 * Сколько разных видов в наборе.
 *
 * Считается по нормализованному ключу, а не по написанию: поле свободное, и
 * «Monstera deliciosa» с двумя пробелами не должна давать второй вид. Пустое
 * поле видом не считается — коллекция без заполненных видов честнее покажет
 * ноль, чем один «безымянный».
 */
export function countSpecies(items: { species?: string | null }[]): number {
  return new Set(items.map((item) => speciesKey(item.species ?? '')).filter(Boolean)).size
}

/**
 * Собрать сводку. При нуле видов вторая половина опускается целиком, иначе
 * получилось бы «6 plants · 0 species» — строка, которая ничего не сообщает.
 */
export function describeCollection(plantCount: number, speciesCount: number): string {
  const plants = `${plantCount} ${plantCount === 1 ? 'plant' : 'plants'}`
  if (speciesCount === 0) return plants

  // У «species» нет отдельной формы единственного числа — это не опечатка.
  return `${plants} · ${speciesCount} species`
}
