/**
 * Database Schema Definitions
 * 
 * This file defines the structure of our IndexedDB database.
 * It specifies object stores, their keys, and indexes.
 */

export const DB_NAME = 'plant-collection-db'
export const DB_VERSION = 1

/**
 * Object Store Names
 */
export const STORES = {
  PLANTS: 'plants',
  PHOTOS: 'photos'
} as const

/**
 * Database Schema
 * 
 * Object Stores:
 * - plants: Stores plant metadata (id, name, price, notes, photos array)
 *   - Key: id (string)
 *   - No indexes needed for current use cases
 * 
 * - photos: Stores photo blobs with string keys
 *   - Key: string (custom key, not auto-increment)
 *   - No indexes needed - photos are accessed directly by key
 */
export function createSchema(db: IDBDatabase): void {
  // Plants object store - stores plant metadata without blobs
  if (!db.objectStoreNames.contains(STORES.PLANTS)) {
    const plantsStore = db.createObjectStore(STORES.PLANTS, { keyPath: 'id' })
    // No indexes needed for current use cases
  }

  // Photos object store - stores photo blobs with string keys
  // This matches the existing system where photos use string keys like "photo_1234567890_abc123"
  if (!db.objectStoreNames.contains(STORES.PHOTOS)) {
    db.createObjectStore(STORES.PHOTOS)
    // No keyPath - we use string keys directly
    // No indexes needed - photos are accessed directly by key
  }
}
