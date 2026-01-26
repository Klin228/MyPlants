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
import type { Plant } from '../models/plant'
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
 * @param data - Plant data (without id, which will be generated)
 * @returns Promise that resolves to the created plant with generated ID
 */
export async function create(data: Omit<Plant, 'id'>): Promise<Plant> {
  const db = await initDB()
  
  const plant: Plant = {
    id: Date.now().toString(),
    ...data
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
 * Update an existing plant
 * 
 * @param id - The plant ID to update
 * @param data - Updated plant data (id will be preserved from the id parameter)
 * @returns Promise that resolves to the updated plant
 */
export async function update(id: string, data: Partial<Omit<Plant, 'id'>>): Promise<Plant> {
  const db = await initDB()
  
  // First, get the existing plant
  const existingPlant = await getById(id)
  if (!existingPlant) {
    throw new Error(`Plant with id ${id} not found`)
  }
  
  const updatedPlant: Plant = {
    ...existingPlant,
    ...data,
    id // Ensure id is preserved
  }
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORES.PLANTS], 'readwrite')
    const store = transaction.objectStore(STORES.PLANTS)
    const request = store.put(updatedPlant)
    
    request.onsuccess = () => {
      resolve(updatedPlant)
    }
    
    request.onerror = () => {
      console.error('Error updating plant:', request.error)
      reject(request.error)
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
  getAll,
  getById,
  create,
  update,
  delete: deletePlant
}
