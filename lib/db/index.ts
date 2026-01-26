/**
 * IndexedDB Database Initialization
 * 
 * This module provides a centralized database connection manager.
 * It handles database initialization, versioning, and provides
 * a singleton pattern to ensure only one database connection exists.
 */

import { DB_NAME, DB_VERSION, createSchema } from './schema'

/**
 * Database connection state
 */
interface DatabaseState {
  db: IDBDatabase | null
  initPromise: Promise<IDBDatabase> | null
}

const dbState: DatabaseState = {
  db: null,
  initPromise: null
}

/**
 * Initialize and return the IndexedDB database connection
 * 
 * Uses a singleton pattern to ensure only one connection exists.
 * If a connection is already open, returns it immediately.
 * If initialization is in progress, returns the existing promise.
 * 
 * @returns Promise that resolves to the IDBDatabase instance
 * @throws Error if database initialization fails
 */
export function initDB(): Promise<IDBDatabase> {
  // Return existing connection if available
  if (dbState.db) {
    return Promise.resolve(dbState.db)
  }

  // Return existing promise if initialization is in progress
  if (dbState.initPromise) {
    return dbState.initPromise
  }

  // Start new initialization
  dbState.initPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => {
      console.error('IndexedDB open error:', request.error)
      dbState.initPromise = null
      reject(request.error)
    }

    request.onsuccess = () => {
      const db = request.result
      dbState.db = db
      
      // Handle database close event
      db.onclose = () => {
        dbState.db = null
        dbState.initPromise = null
      }
      
      // Handle database errors
      db.onerror = (event) => {
        console.error('IndexedDB error:', event)
      }

      resolve(db)
    }

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      try {
        createSchema(db)
      } catch (error) {
        console.error('Error creating database schema:', error)
        reject(error)
      }
    }
  })

  return dbState.initPromise
}

/**
 * Close the database connection
 * 
 * Useful for cleanup or testing scenarios.
 * The connection will be recreated on next initDB() call.
 */
export function closeDB(): void {
  if (dbState.db) {
    dbState.db.close()
    dbState.db = null
    dbState.initPromise = null
  }
}
