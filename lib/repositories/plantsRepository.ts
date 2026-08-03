/**
 * Plants Repository
 * 
 * This repository handles all plant data operations.
 * It provides a clean interface for CRUD operations on plants,
 * abstracting away the underlying storage implementation.
 * 
 * Responsibilities:
 * - Store and retrieve plant metadata (no blobs)
 * - Handle plant creation, updates, and deletion
 * - Убирать блобы, на которые больше никто не ссылается
 *
 * Блобы удаляются здесь, а не в `photosRepository`: только тут в один момент
 * известны и прежний набор ключей, и новый, и все остальные растения. Работа со
 * стором фотографий идёт напрямую, в той же транзакции, что и запись растения, —
 * `photosRepository` открывает свою и годится, только когда одной транзакции не
 * требуется.
 */

import { initDB } from '../db'
import { STORES } from '../db/schema'
import { newId } from '../ids'
import type { NewPlant, Plant } from '../models/plant'

/**
 * Get all plants from storage
 * 
 * @returns Promise that resolves to an array of all plants
 */
export async function getAll(): Promise<Plant[]> {
  const db = await initDB()
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.PLANTS], 'readonly')
    const store = transaction.objectStore(STORES.PLANTS)
    const request = store.getAll()
    
    request.onsuccess = () => {
      resolve(request.result || [])
    }
    
    request.onerror = () => {
      console.error('Error getting all plants:', request.error)
      reject(request.error)
    }
  })
}

/**
 * Get a single plant by ID
 * 
 * @param id - The plant ID to retrieve
 * @returns Promise that resolves to the plant, or undefined if not found
 */
export async function getById(id: string): Promise<Plant | undefined> {
  const db = await initDB()
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.PLANTS], 'readonly')
    const store = transaction.objectStore(STORES.PLANTS)
    const request = store.get(id)
    
    request.onsuccess = () => {
      resolve(request.result)
    }
    
    request.onerror = () => {
      console.error('Error getting plant by ID:', request.error)
      reject(request.error)
    }
  })
}

/**
 * Create a new plant
 *
 * @param data - Plant data (id and timestamps are generated here)
 * @returns Promise that resolves to the created plant with generated ID
 */
export async function create(data: NewPlant): Promise<Plant> {
  const db = await initDB()

  const now = new Date().toISOString()
  const plant: Plant = {
    ...data,
    id: newId(),
    createdAt: now,
    updatedAt: now
  }

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.PLANTS], 'readwrite')
    const store = transaction.objectStore(STORES.PLANTS)
    const request = store.add(plant)
    
    request.onsuccess = () => {
      resolve(plant)
    }
    
    request.onerror = () => {
      console.error('Error creating plant:', request.error)
      reject(request.error)
    }
  })
}

/**
 * Записать растение как есть — со своим id и своими датами.
 *
 * Отдельно от `create`, потому что `create` намеренно проставляет id и даты
 * сам: вызывающий код не должен их сочинять. У восстановления из резервной
 * копии задача обратная — вернуть запись такой, какой она была, иначе после
 * восстановления собьётся сортировка по дате добавления, а повторный импорт
 * того же файла заведёт дубли вместо того, чтобы ничего не сделать.
 *
 * `add`, а не `put`: существующую запись не перезаписываем, о занятом id
 * сообщаем вызывающему.
 *
 * @returns `false`, если растение с таким id уже есть
 */
export async function restore(plant: Plant): Promise<boolean> {
  const db = await initDB()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.PLANTS], 'readwrite')
    const request = transaction.objectStore(STORES.PLANTS).add(plant)

    request.onsuccess = () => resolve(true)
    request.onerror = () => {
      // Занятый id — не ошибка восстановления, а «это растение уже здесь»
      if (request.error?.name === 'ConstraintError') {
        // Иначе транзакция прервётся и уронит остальные записи
        request.transaction?.abort()
        resolve(false)
        return
      }
      console.error('Error restoring plant:', request.error)
      reject(request.error)
    }
  })
}

/**
 * Update an existing plant
 *
 * Чтение и запись — **одной транзакцией**. Раньше их было две: `getById`
 * отдельным вызовом, потом `put` в новой транзакции. В промежутке запись могла
 * измениться, и правка возвращала её обратно: удалил растение в одной вкладке,
 * сохранил открытую форму в другой — и растение воскресало, только фотографии
 * его к тому моменту уже удалены вместе с ним, то есть возвращалось оно со
 * ссылками в пустоту. Найдено ревью F3.
 *
 * `put` вызывается из обработчика успеха чтения: транзакция в этот момент ещё
 * активна, поэтому оба запроса попадают в неё, а не в разные.
 *
 * @param id - The plant ID to update
 * @param data - Updated plant data (id will be preserved from the id parameter)
 * @returns Promise that resolves to the updated plant
 */
export async function update(id: string, data: Partial<NewPlant>): Promise<Plant> {
  const db = await initDB()

  return new Promise((resolve, reject) => {
    // Фотографии в той же транзакции: убранный блоб удаляется вместе с записью
    // нового набора ключей, а не отдельным шагом после неё.
    const transaction = db.transaction(
      [STORES.PLANTS, STORES.PHOTOS, STORES.PHOTO_SIZES],
      'readwrite'
    )
    const plants = transaction.objectStore(STORES.PLANTS)
    const photos = transaction.objectStore(STORES.PHOTOS)
    const sizes = transaction.objectStore(STORES.PHOTO_SIZES)

    let updatedPlant: Plant | null = null
    let missing = false

    /*
     * Обещание разрешается по завершении транзакции, а не по успеху записи.
     * Удаление блобов идёт после `put`, и вызывающему нельзя отвечать раньше,
     * чем всё это доедет до диска: иначе следующий за правкой замер занятого
     * места покажет старое число.
     */
    transaction.oncomplete = () => {
      if (updatedPlant) resolve(updatedPlant)
      else reject(new Error(`Plant with id ${id} not found`))
    }

    transaction.onabort = () => {
      if (missing) {
        reject(new Error(`Plant with id ${id} not found`))
        return
      }
      console.error('Error updating plant:', transaction.error)
      reject(transaction.error ?? new Error('Could not update the plant'))
    }

    const read = plants.get(id)

    read.onerror = () => {
      console.error('Error reading plant before update:', read.error)
    }

    read.onsuccess = () => {
      const existingPlant = read.result as Plant | undefined

      if (!existingPlant) {
        // Растения нет — писать нечего, и транзакцию доводить незачем
        missing = true
        transaction.abort()
        return
      }

      const nextPlant: Plant = {
        ...existingPlant,
        ...data,
        id, // Ensure id is preserved
        // createdAt берётся из существующей записи спредом выше и правке не подлежит
        updatedAt: new Date().toISOString()
      }

      // Ключи, которых в новом наборе больше нет. `data.photos` может не
      // приходить вовсе — тогда набор тот же и убранных нет.
      const dropped = (existingPlant.photos ?? []).filter(
        (key) => !nextPlant.photos.includes(key)
      )

      const write = plants.put(nextPlant)

      write.onerror = () => {
        console.error('Error updating plant:', write.error)
      }

      write.onsuccess = () => {
        updatedPlant = nextPlant
        dropUnreferencedPhotos(plants, photos, sizes, dropped)
      }
    }
  })
}

/**
 * Удалить блобы, на которые больше никто не ссылается.
 *
 * Вызывать **внутри транзакции, где новое состояние растений уже записано**:
 * чтение внутри транзакции видит её собственные записи, поэтому проверка идёт по
 * тому, что будет после правки, а не до неё. Отдельным шагом после транзакции
 * это делать нельзя — между шагами набор ссылок может измениться.
 *
 * Проверка «а не ссылается ли кто-то ещё» обязательна. Сегодня ключи выдаются
 * уникальными на каждую запись, и разделить фотографию двум растениям нечем;
 * но `restorePhoto` пишет блоб под ключом из файла, то есть достаточно чужой
 * копии с одинаковыми ключами — и прямолинейное «убрали из формы, значит
 * удалить» вынесло бы фотографию у другого растения. Стоит это одного чтения
 * растений в уже открытой транзакции.
 */
function dropUnreferencedPhotos(
  plants: IDBObjectStore,
  photos: IDBObjectStore,
  sizes: IDBObjectStore,
  candidates: string[]
): void {
  if (candidates.length === 0) return

  const scan = plants.getAll()

  scan.onerror = (event) => {
    /*
     * Не выяснили, кто на что ссылается — значит не удаляем ничего. Лишний блоб
     * в базе неприятен, удалённая чужая фотография необратима.
     *
     * `preventDefault` здесь обязателен, и без него обещание выше не
     * выполнялось: отказ запроса, чей обработчик его не погасил, обрывает всю
     * транзакцию — вместе с уже записанной правкой растения. То есть сбой уборки
     * стоил бы человеку его правки, хотя сама правка удалась.
     */
    event.preventDefault()
    console.error('Не удалось проверить ссылки на фотографии:', scan.error)
  }

  scan.onsuccess = () => {
    const referenced = new Set<string>()
    for (const plant of (scan.result ?? []) as Plant[]) {
      for (const key of plant.photos ?? []) referenced.add(key)
    }

    for (const key of candidates) {
      if (referenced.has(key)) continue
      photos.delete(key)
      // Размеры живут отдельным стором и без этой строки остались бы такими же
      // неадресуемыми, каким раньше оставался сам блоб
      sizes.delete(key)
    }
  }
}

/**
 * Delete a plant and all its associated photos
 *
 * Одной транзакцией, и в правильном порядке. Раньше фотографии удалялись
 * первыми, отдельными транзакциями, и только потом само растение: сбой между
 * этими шагами оставлял растение со ссылками в пустоту — то есть видимую
 * поломку вместо безобидного мусора. Плюс удалялись все ключи растения без
 * оглядки на остальных, и разделённая фотография исчезла бы у обоих.
 *
 * @param id - The plant ID to delete
 * @returns Promise that resolves when deletion is complete
 */
export async function deletePlant(id: string): Promise<void> {
  const db = await initDB()

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(
      [STORES.PLANTS, STORES.PHOTOS, STORES.PHOTO_SIZES],
      'readwrite'
    )
    const plants = transaction.objectStore(STORES.PLANTS)
    const photos = transaction.objectStore(STORES.PHOTOS)
    const sizes = transaction.objectStore(STORES.PHOTO_SIZES)

    transaction.oncomplete = () => resolve()
    transaction.onabort = () => {
      console.error('Error deleting plant:', transaction.error)
      reject(transaction.error ?? new Error('Could not delete the plant'))
    }

    const read = plants.get(id)

    read.onerror = () => {
      console.error('Error reading plant before delete:', read.error)
    }

    read.onsuccess = () => {
      const plant = read.result as Plant | undefined

      // Растения нет — считаем удаление состоявшимся: результат тот же
      if (!plant) return

      const remove = plants.delete(id)

      remove.onerror = () => {
        console.error('Error deleting plant:', remove.error)
      }

      remove.onsuccess = () => {
        dropUnreferencedPhotos(plants, photos, sizes, plant.photos ?? [])
      }
    }
  })
}

// Export a default object for convenience
export const plantsRepository = {
  restore,
  getAll,
  getById,
  create,
  update,
  delete: deletePlant
}
