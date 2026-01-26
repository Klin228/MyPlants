/**
 * Data Migration Utilities
 * 
 * This module handles migration of data from the old storage system
 * (localStorage for plants, old IndexedDB for photos) to the new
 * repository-based system (IndexedDB for both).
 */

import { initDB } from '../db'
import { STORES } from '../db/schema'
import type { Plant } from '../models/plant'
import { plantsRepository } from './plantsRepository'
import { photosRepository } from './photosRepository'

const OLD_STORAGE_KEY = 'plant-collection'
const OLD_PHOTO_DB_NAME = 'plant-photos-db'

/**
 * Check if migration is needed by checking for data in localStorage
 * 
 * @returns true if migration is needed, false otherwise
 */
export async function needsMigration(): Promise<boolean> {
  // Check if plants exist in localStorage
  const storedData = localStorage.getItem(OLD_STORAGE_KEY)
  if (!storedData) {
    return false
  }

  // Check if plants already exist in IndexedDB
  const existingPlants = await plantsRepository.getAll()
  if (existingPlants.length > 0) {
    return false // Already migrated
  }

  return true
}

/**
 * Migrate plants from localStorage to IndexedDB
 * Also migrates photos from old IndexedDB to new IndexedDB if needed
 * 
 * @returns Promise that resolves when migration is complete
 */
export async function migrateFromLocalStorage(): Promise<void> {
  try {
    const storedData = localStorage.getItem(OLD_STORAGE_KEY)
    if (!storedData) {
      console.log('No data to migrate from localStorage')
      return
    }

    const plants = JSON.parse(storedData) as any[]
    if (!plants || plants.length === 0) {
      console.log('No plants to migrate')
      return
    }

    console.log(`Migrating ${plants.length} plant(s) from localStorage to IndexedDB...`)

    // Migrate each plant
    for (const plantData of plants) {
      // Normalize plant data
      const plant: Plant = {
        id: plantData.id || Date.now().toString(),
        name: plantData.name || '',
        photos: plantData.photos || (plantData.photoUrl ? [plantData.photoUrl] : []),
        price: plantData.price || 0,
        notes: plantData.notes
      }

      // Migrate photos from old IndexedDB to new IndexedDB if needed
      if (plant.photos && plant.photos.length > 0) {
        const migratedPhotoKeys: string[] = []
        
        for (const photoKey of plant.photos) {
          // Check if photo is a base64 data URL (old format)
          if (photoKey.startsWith('data:image/') || photoKey.startsWith('data:')) {
            // Convert base64 to blob and store in new IndexedDB
            try {
              const response = await fetch(photoKey)
              const blob = await response.blob()
              const newKey = await photosRepository.addPhoto(plant.id, blob)
              migratedPhotoKeys.push(newKey)
            } catch (error) {
              console.error('Error migrating base64 photo:', error)
              // Skip this photo
            }
          } else {
            // Try to migrate from old IndexedDB
            try {
              const blob = await getPhotoFromOldDB(photoKey)
              if (blob) {
                const newKey = await photosRepository.addPhoto(plant.id, blob)
                migratedPhotoKeys.push(newKey)
              } else {
                // Keep the old key if migration fails (might be valid)
                migratedPhotoKeys.push(photoKey)
              }
            } catch (error) {
              console.error('Error migrating photo from old DB:', error)
              // Keep the old key if migration fails
              migratedPhotoKeys.push(photoKey)
            }
          }
        }
        
        plant.photos = migratedPhotoKeys
      }

      // Save plant to new IndexedDB (preserving existing ID)
      try {
        const db = await initDB()
        await new Promise<void>((resolve, reject) => {
          const transaction = db.transaction([STORES.PLANTS], 'readwrite')
          const store = transaction.objectStore(STORES.PLANTS)
          const request = store.add(plant)
          
          request.onsuccess = () => {
            resolve()
          }
          
          request.onerror = () => {
            // If plant already exists (duplicate ID), try to update instead
            if (request.error?.name === 'ConstraintError') {
              const updateRequest = store.put(plant)
              updateRequest.onsuccess = () => resolve()
              updateRequest.onerror = () => reject(updateRequest.error)
            } else {
              reject(request.error)
            }
          }
        })
      } catch (error) {
        console.error('Error saving migrated plant:', error)
      }
    }

    console.log('Migration complete')
  } catch (error) {
    console.error('Error during migration:', error)
    throw error
  }
}

/**
 * Get a photo from the old IndexedDB database
 * 
 * @param key - The photo key from the old database
 * @returns Promise that resolves to the blob, or null if not found
 */
async function getPhotoFromOldDB(key: string): Promise<Blob | null> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(OLD_PHOTO_DB_NAME, 1)

    request.onsuccess = () => {
      const db = request.result
      const transaction = db.transaction(['photos'], 'readonly')
      const store = transaction.objectStore('photos')
      const getRequest = store.get(key)

      getRequest.onsuccess = () => {
        const blob: Blob | undefined = getRequest.result
        db.close()
        resolve(blob || null)
      }

      getRequest.onerror = () => {
        db.close()
        resolve(null) // Photo not found, return null
      }
    }

    request.onerror = () => {
      resolve(null) // Old DB doesn't exist or can't be opened
    }
  })
}

/**
 * Initialize the database and run migration if needed
 * 
 * This should be called once when the app starts
 */
export async function initializeDatabase(): Promise<void> {
  // Initialize the database (creates schema if needed)
  await initDB()

  // Check if migration is needed
  if (await needsMigration()) {
    console.log('Migration needed, starting migration...')
    await migrateFromLocalStorage()
  }
}
