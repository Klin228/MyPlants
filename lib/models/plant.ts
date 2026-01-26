/**
 * Plant Data Model
 * 
 * Represents a plant entity in the system.
 * This model does NOT include photo blobs - photos are stored separately
 * and referenced by their string keys in the photos array.
 */

export interface Plant {
  id: string
  name: string
  photos: string[] // Array of photo keys (IndexedDB keys, not blobs)
  price: number
  notes?: string
  // Photo blobs are stored separately in the photos repository
  // This keeps the plant entity lightweight and focused on metadata
}
