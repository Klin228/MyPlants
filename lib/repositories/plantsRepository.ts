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
 * - Coordinate with photos repository for photo cleanup on deletion
 */

import { initDB } from '../db'
import { STORES } from '../db/schema'
import { newId } from '../ids'
import type { NewPlant, Plant } from '../models/plant'
import { photosRepository } from './photosRepository'

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
    const transaction = db.transaction([STORES.PLANTS], 'readwrite')
    const store = transaction.objectStore(STORES.PLANTS)
    const read = store.get(id)

    read.onerror = () => {
      console.error('Error reading plant before update:', read.error)
      reject(read.error)
    }

    read.onsuccess = () => {
      const existingPlant = read.result as Plant | undefined

      if (!existingPlant) {
        // Растения нет — писать нечего, и транзакцию доводить незачем
        transaction.abort()
        reject(new Error(`Plant with id ${id} not found`))
        return
      }

      const updatedPlant: Plant = {
        ...existingPlant,
        ...data,
        id, // Ensure id is preserved
        // createdAt берётся из существующей записи спредом выше и правке не подлежит
        updatedAt: new Date().toISOString()
      }

      const write = store.put(updatedPlant)

      write.onsuccess = () => {
        resolve(updatedPlant)
      }

      write.onerror = () => {
        console.error('Error updating plant:', write.error)
        reject(write.error)
      }
    }
  })
}

/**
 * Delete a plant and all its associated photos
 * 
 * This method ensures that when a plant is deleted,
 * all related photos are also removed from storage.
 * 
 * @param id - The plant ID to delete
 * @returns Promise that resolves when deletion is complete
 */
export async function deletePlant(id: string): Promise<void> {
  const db = await initDB()
  
  // First, get the plant to find its photo keys
  const plant = await getById(id)
  
  // Delete all photos associated with this plant
  if (plant && plant.photos && plant.photos.length > 0) {
    try {
      await photosRepository.deletePhotos(plant.photos)
    } catch (error) {
      console.error('Error deleting photos for plant:', error)
      // Continue with plant deletion even if photo deletion fails
    }
  }
  
  // Then delete the plant
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.PLANTS], 'readwrite')
    const store = transaction.objectStore(STORES.PLANTS)
    const request = store.delete(id)
    
    request.onsuccess = () => {
      resolve()
    }
    
    request.onerror = () => {
      console.error('Error deleting plant:', request.error)
      reject(request.error)
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
