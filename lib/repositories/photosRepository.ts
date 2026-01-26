/**
 * Photos Repository
 * 
 * This repository handles all photo data operations.
 * It provides a clean interface for managing photo blobs,
 * which are stored separately from plant metadata.
 * 
 * Responsibilities:
 * - Store and retrieve photo blobs by string keys
 * - Handle photo deletion
 * - Convert blobs to data URLs for display
 */

import { initDB } from '../db'
import { STORES } from '../db/schema'

/**
 * Get photos by their keys and return as data URLs
 * 
 * @param keys - Array of photo keys to retrieve
 * @returns Promise that resolves to an array of photo data URLs
 */
export async function getByPlantId(keys: string[]): Promise<string[]> {
  if (keys.length === 0) {
    return []
  }
  
  const db = await initDB()
  
  // Get all photos in parallel
  const photoPromises = keys.map(key => {
    return new Promise<string>((resolve, reject) => {
      const transaction = db.transaction([STORES.PHOTOS], 'readonly')
      const store = transaction.objectStore(STORES.PHOTOS)
      const request = store.get(key)
      
      request.onsuccess = () => {
        const blob: Blob | undefined = request.result
        if (!blob) {
          reject(new Error(`Photo with key ${key} not found`))
          return
        }
        
        // Convert blob to data URL
        const reader = new FileReader()
        reader.onloadend = () => {
          resolve(reader.result as string)
        }
        reader.onerror = () => {
          reject(new Error('Error reading photo blob'))
        }
        reader.readAsDataURL(blob)
      }
      
      request.onerror = () => {
        console.error('Error getting photo:', request.error)
        reject(request.error)
      }
    })
  })
  
  return Promise.all(photoPromises)
}

/**
 * Add a photo and return its key
 * 
 * @param plantId - The plant ID this photo belongs to (for reference, not stored)
 * @param blob - The image blob to store
 * @returns Promise that resolves to the photo key (string)
 */
export async function addPhoto(plantId: string, blob: Blob): Promise<string> {
  const db = await initDB()
  
  // Generate a unique key (matching the existing system's format)
  const key = `photo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.PHOTOS], 'readwrite')
    const store = transaction.objectStore(STORES.PHOTOS)
    const request = store.put(blob, key)
    
    request.onsuccess = () => {
      resolve(key)
    }
    
    request.onerror = () => {
      console.error('Error adding photo:', request.error)
      reject(request.error)
    }
  })
}

/**
 * Delete a photo by its key
 * 
 * @param photoId - The photo key (string) to delete
 * @returns Promise that resolves when deletion is complete
 */
export async function deletePhoto(photoId: string): Promise<void> {
  const db = await initDB()
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.PHOTOS], 'readwrite')
    const store = transaction.objectStore(STORES.PHOTOS)
    const request = store.delete(photoId)
    
    request.onsuccess = () => {
      resolve()
    }
    
    request.onerror = () => {
      console.error('Error deleting photo:', request.error)
      reject(request.error)
    }
  })
}

/**
 * Delete multiple photos by their keys
 * 
 * @param photoIds - Array of photo keys to delete
 * @returns Promise that resolves when all deletions are complete
 */
export async function deletePhotos(photoIds: string[]): Promise<void> {
  await Promise.all(photoIds.map(key => deletePhoto(key)))
}

/**
 * Get a single photo by key as a data URL
 * 
 * @param photoKey - The photo key to retrieve
 * @returns Promise that resolves to the photo as a data URL
 */
export async function getPhotoById(photoKey: string): Promise<string> {
  const db = await initDB()
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.PHOTOS], 'readonly')
    const store = transaction.objectStore(STORES.PHOTOS)
    const request = store.get(photoKey)
    
    request.onsuccess = () => {
      const blob: Blob | undefined = request.result
      if (!blob) {
        reject(new Error(`Photo with key ${photoKey} not found`))
        return
      }
      
      // Convert blob to data URL
      const reader = new FileReader()
      reader.onloadend = () => {
        resolve(reader.result as string)
      }
      reader.onerror = () => {
        reject(new Error('Error reading photo blob'))
      }
      reader.readAsDataURL(blob)
    }
    
    request.onerror = () => {
      console.error('Error getting photo by key:', request.error)
      reject(request.error)
    }
  })
}

// Export a default object for convenience
export const photosRepository = {
  getByPlantId, // Note: takes array of keys, not plantId
  addPhoto,
  deletePhoto,
  deletePhotos,
  getPhotoById
}
