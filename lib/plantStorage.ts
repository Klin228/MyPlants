import { migrateBase64ToIndexedDB } from './photoStorage'

export interface Plant {
  id: string
  name: string
  photos: string[] // Now stores IndexedDB keys instead of base64 strings
  price: number
  notes?: string
}

const STORAGE_KEY = 'plant-collection'

// Migration helper: convert old photoUrl to photos array
function migratePlant(plant: any): Plant {
  if (plant.photos && Array.isArray(plant.photos)) {
    // Already migrated
    return plant as Plant
  }
  // Migrate from photoUrl to photos array
  if (plant.photoUrl) {
    return {
      ...plant,
      photos: [plant.photoUrl],
      photoUrl: undefined
    } as Plant
  }
  // Fallback: empty photos array
  return {
    ...plant,
    photos: []
  } as Plant
}

// Check if a string is a base64 data URL (old format) or IndexedDB key (new format)
function isBase64DataUrl(str: string): boolean {
  return str.startsWith('data:image/') || str.startsWith('data:')
}

// Migrate base64 photos to IndexedDB
async function migratePhotosToIndexedDB(plants: Plant[]): Promise<Plant[]> {
  const needsMigration = plants.some(plant => 
    plant.photos.some(photo => isBase64DataUrl(photo))
  )

  if (!needsMigration) {
    return plants
  }

  console.log('Migrating base64 photos to IndexedDB...')
  const migratedPlants = await Promise.all(
    plants.map(async (plant) => {
      const base64Photos = plant.photos.filter(isBase64DataUrl)
      const indexedKeys = plant.photos.filter(photo => !isBase64DataUrl(photo))

      if (base64Photos.length > 0) {
        try {
          const newKeys = await migrateBase64ToIndexedDB(base64Photos)
          return {
            ...plant,
            photos: [...indexedKeys, ...newKeys]
          }
        } catch (error) {
          console.error('Error migrating photos for plant:', plant.id, error)
          // Keep base64 photos if migration fails (fallback)
          return plant
        }
      }
      return plant
    })
  )

  // Save migrated plants
  savePlants(migratedPlants)
  console.log('Migration complete')
  return migratedPlants
}

export async function loadPlants(): Promise<Plant[]> {
  try {
    const storedData = localStorage.getItem(STORAGE_KEY)
    if (storedData) {
      const plants = JSON.parse(storedData) as any[]
      // Migrate old format to new format (photoUrl -> photos array)
      const migratedPlants = plants.map(migratePlant)
      // Save migrated data back if migration occurred
      const needsMigration = plants.some(p => p.photoUrl || p.photos === undefined)
      if (needsMigration) {
        savePlants(migratedPlants)
      }
      // Migrate base64 photos to IndexedDB
      return await migratePhotosToIndexedDB(migratedPlants)
    }
    return []
  } catch (error) {
    console.error('Error loading plants from localStorage:', error)
    return []
  }
}

// Synchronous version for backwards compatibility (returns plants with keys, not loaded photos)
export function loadPlantsSync(): Plant[] {
  try {
    const storedData = localStorage.getItem(STORAGE_KEY)
    if (storedData) {
      const plants = JSON.parse(storedData) as any[]
      return plants.map(migratePlant)
    }
    return []
  } catch (error) {
    console.error('Error loading plants from localStorage:', error)
    return []
  }
}

export function savePlants(plants: Plant[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(plants))
  } catch (error) {
    console.error('Error saving plants to localStorage:', error)
  }
}

