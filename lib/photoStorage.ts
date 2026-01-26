// IndexedDB storage for plant photos
// This allows storing large photos without hitting localStorage size limits

const DB_NAME = 'plant-photos-db'
const DB_VERSION = 1
const STORE_NAME = 'photos'

interface PhotoDB {
  db: IDBDatabase | null
  initPromise: Promise<IDBDatabase> | null
}

const photoDB: PhotoDB = {
  db: null,
  initPromise: null
}

// Initialize IndexedDB
function initDB(): Promise<IDBDatabase> {
  if (photoDB.db) {
    return Promise.resolve(photoDB.db)
  }

  if (photoDB.initPromise) {
    return photoDB.initPromise
  }

  photoDB.initPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => {
      console.error('IndexedDB open error:', request.error)
      reject(request.error)
    }

    request.onsuccess = () => {
      photoDB.db = request.result
      resolve(photoDB.db)
    }

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
  })

  return photoDB.initPromise
}

// Save a photo (Blob or base64 string) and return a key
export async function savePhoto(photoData: string | Blob): Promise<string> {
  const db = await initDB()
  
  // Convert base64 string to Blob if needed
  let blob: Blob
  if (typeof photoData === 'string') {
    // Convert base64 data URL to Blob
    const response = await fetch(photoData)
    blob = await response.blob()
  } else {
    blob = photoData
  }

  return new Promise((resolve, reject) => {
    const key = `photo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    const transaction = db.transaction([STORE_NAME], 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    
    const request = store.put(blob, key)
    
    request.onsuccess = () => {
      resolve(key)
    }
    
    request.onerror = () => {
      console.error('Error saving photo to IndexedDB:', request.error)
      reject(request.error)
    }
  })
}

// Save multiple photos and return array of keys
export async function savePhotos(photos: (string | Blob)[]): Promise<string[]> {
  return Promise.all(photos.map(photo => savePhoto(photo)))
}

// Get a photo by key and return as data URL
export async function getPhoto(key: string): Promise<string> {
  const db = await initDB()
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.get(key)
    
    request.onsuccess = () => {
      const blob = request.result
      if (!blob) {
        reject(new Error(`Photo not found: ${key}`))
        return
      }
      
      // Convert Blob to data URL
      const reader = new FileReader()
      reader.onloadend = () => {
        resolve(reader.result as string)
      }
      reader.onerror = () => {
        reject(new Error('Error reading photo'))
      }
      reader.readAsDataURL(blob)
    }
    
    request.onerror = () => {
      console.error('Error getting photo from IndexedDB:', request.error)
      reject(request.error)
    }
  })
}

// Get multiple photos
export async function getPhotos(keys: string[]): Promise<string[]> {
  return Promise.all(keys.map(key => getPhoto(key)))
}

// Delete a photo
export async function deletePhoto(key: string): Promise<void> {
  const db = await initDB()
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.delete(key)
    
    request.onsuccess = () => {
      resolve()
    }
    
    request.onerror = () => {
      console.error('Error deleting photo from IndexedDB:', request.error)
      reject(request.error)
    }
  })
}

// Delete multiple photos
export async function deletePhotos(keys: string[]): Promise<void> {
  await Promise.all(keys.map(key => deletePhoto(key)))
}

// Migrate base64 photos from localStorage to IndexedDB
export async function migrateBase64ToIndexedDB(base64Photos: string[]): Promise<string[]> {
  return savePhotos(base64Photos)
}
