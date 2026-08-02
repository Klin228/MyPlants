/**
 * Data Migration Utilities
 *
 * This module handles migration of data from the old storage system
 * (localStorage for plants, old IndexedDB for photos) to the new
 * repository-based system (IndexedDB for both).
 */

import { initDB } from '../db'
import { STORES } from '../db/schema'
import { newId, timestampFromLegacyId } from '../ids'
import type { Plant } from '../models/plant'
import { plantsRepository } from './plantsRepository'
import { photosRepository } from './photosRepository'

const OLD_STORAGE_KEY = 'plant-collection'
const OLD_PHOTO_DB_NAME = 'plant-photos-db'
const OLD_PHOTO_STORE_NAME = 'photos'

/**
 * Marker written once the old storage has been dealt with.
 *
 * Without it the only signal that migration already happened was "the new
 * database has plants in it" — which stops being true the moment the user
 * deletes their whole collection, and the old data would come back.
 */
const MIGRATION_DONE_KEY = 'plant-collection-migrated'

/**
 * Result of reading one photo out of the old database.
 *
 * `ok: false` means the read itself failed, so the old data is still the only
 * copy and must not be deleted. It is deliberately distinct from
 * `ok: true, blob: null`, which means there was simply nothing stored under
 * that key — nothing to lose there.
 */
type OldPhotoResult =
  | { ok: true; blob: Blob | null }
  | { ok: false }

/**
 * Check if migration is needed by checking for data in localStorage
 *
 * @returns true if migration is needed, false otherwise
 */
export async function needsMigration(): Promise<boolean> {
  if (localStorage.getItem(MIGRATION_DONE_KEY)) {
    return false
  }

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
 * @returns Promise that resolves to true if every plant and every photo made
 *          it across without a single error. Only then is it safe to delete
 *          the old data.
 */
export async function migrateFromLocalStorage(): Promise<boolean> {
  try {
    const storedData = localStorage.getItem(OLD_STORAGE_KEY)
    if (!storedData) {
      console.log('No data to migrate from localStorage')
      return true
    }

    const plants = JSON.parse(storedData) as any[]
    if (!plants || plants.length === 0) {
      console.log('No plants to migrate')
      return true
    }

    console.log(`Migrating ${plants.length} plant(s) from localStorage to IndexedDB...`)

    // Flipped by any failure along the way. The old data stays put unless this
    // is still true at the end.
    let everythingMigrated = true

    // Одна отметка на весь перенос: записи без собственной даты получат
    // одинаковую, а не растянутую по времени выполнения цикла.
    const migratedAt = new Date().toISOString()

    // Migrate each plant
    for (const plantData of plants) {
      // Normalize plant data
      const id: string = plantData.id || newId()
      // В старом формате дат не было. У записей той эпохи id это временная
      // метка, из неё возраст и берём; иначе остаётся только текущий момент.
      const createdAt = plantData.createdAt || timestampFromLegacyId(id) || migratedAt

      const plant: Plant = {
        // Существующий id сохраняем как есть: он уже разошёлся по ссылкам.
        // Новый нужен только записи, у которой его почему-то не оказалось.
        id,
        name: plantData.name || '',
        photos: plantData.photos || (plantData.photoUrl ? [plantData.photoUrl] : []),
        price: plantData.price || 0,
        notes: plantData.notes,
        createdAt,
        updatedAt: plantData.updatedAt || createdAt
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
              everythingMigrated = false
            }
          } else {
            // Try to migrate from old IndexedDB
            const result = await getPhotoFromOldDB(photoKey)

            if (!result.ok) {
              // Read failed — keep the old key and the old database
              migratedPhotoKeys.push(photoKey)
              everythingMigrated = false
            } else if (result.blob) {
              try {
                const newKey = await photosRepository.addPhoto(plant.id, result.blob)
                migratedPhotoKeys.push(newKey)
              } catch (error) {
                console.error('Error saving migrated photo:', error)
                migratedPhotoKeys.push(photoKey)
                everythingMigrated = false
              }
            } else {
              // Nothing stored under that key. The reference was already
              // dangling, so carrying it over loses nothing.
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
        everythingMigrated = false
      }
    }

    console.log(
      everythingMigrated
        ? 'Migration complete'
        : 'Migration finished with errors, old data kept'
    )
    return everythingMigrated
  } catch (error) {
    console.error('Error during migration:', error)
    throw error
  }
}

/**
 * Get a photo from the old IndexedDB database
 *
 * @param key - The photo key from the old database
 * @returns Promise that resolves to the blob, to null if there is nothing
 *          stored under that key, or to `ok: false` if the read failed
 */
async function getPhotoFromOldDB(key: string): Promise<OldPhotoResult> {
  return new Promise((resolve) => {
    // Opening without a version avoids forcing an upgrade on a database we do
    // not own. It still creates the database when it is missing, which is what
    // `justCreated` is for.
    const request = indexedDB.open(OLD_PHOTO_DB_NAME)
    let justCreated = false

    request.onupgradeneeded = () => {
      justCreated = true
    }

    request.onsuccess = () => {
      const db = request.result

      // Both branches below used to be a straight `db.transaction(['photos'])`,
      // which throws NotFoundError when the store is absent. Thrown inside this
      // handler, that error settled nothing: the promise hung forever and the
      // app sat on an empty collection.
      if (justCreated || !db.objectStoreNames.contains(OLD_PHOTO_STORE_NAME)) {
        db.close()
        if (justCreated) {
          // We only created it by asking. Put things back as they were.
          indexedDB.deleteDatabase(OLD_PHOTO_DB_NAME)
        }
        resolve({ ok: true, blob: null })
        return
      }

      try {
        const transaction = db.transaction([OLD_PHOTO_STORE_NAME], 'readonly')
        const store = transaction.objectStore(OLD_PHOTO_STORE_NAME)
        const getRequest = store.get(key)

        getRequest.onsuccess = () => {
          const blob: Blob | undefined = getRequest.result
          db.close()
          resolve({ ok: true, blob: blob || null })
        }

        getRequest.onerror = () => {
          console.error('Error reading photo from old DB:', getRequest.error)
          db.close()
          resolve({ ok: false })
        }
      } catch (error) {
        console.error('Error opening transaction on old DB:', error)
        db.close()
        resolve({ ok: false })
      }
    }

    request.onerror = () => {
      console.error('Error opening old photo DB:', request.error)
      resolve({ ok: false })
    }

    request.onblocked = () => {
      console.warn('Old photo DB is blocked by another connection')
      resolve({ ok: false })
    }
  })
}

/**
 * Delete the old photo database
 *
 * Called only after every photo has been copied into the new database.
 */
async function deleteOldPhotoDB(): Promise<void> {
  return new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(OLD_PHOTO_DB_NAME)

    // Failing to delete leftovers is not worth breaking startup over, so every
    // branch resolves.
    request.onsuccess = () => {
      console.log('Old photo database removed')
      resolve()
    }

    request.onerror = () => {
      console.error('Error deleting old photo DB:', request.error)
      resolve()
    }

    request.onblocked = () => {
      console.warn('Could not delete old photo DB: blocked by another tab')
      resolve()
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

  if (localStorage.getItem(MIGRATION_DONE_KEY)) {
    return
  }

  if (!localStorage.getItem(OLD_STORAGE_KEY)) {
    return
  }

  // Plants already in the new database means an earlier version of the app
  // migrated them and left no marker. Record it and stop looking.
  const existingPlants = await plantsRepository.getAll()
  if (existingPlants.length > 0) {
    localStorage.setItem(MIGRATION_DONE_KEY, new Date().toISOString())
    return
  }

  console.log('Migration needed, starting migration...')
  const migratedCleanly = await migrateFromLocalStorage()

  if (migratedCleanly) {
    localStorage.setItem(MIGRATION_DONE_KEY, new Date().toISOString())
    localStorage.removeItem(OLD_STORAGE_KEY)
    await deleteOldPhotoDB()
  }
}
