/**
 * IndexedDB Database Initialization
 * 
 * This module provides a centralized database connection manager.
 * It handles database initialization, versioning, and provides
 * a singleton pattern to ensure only one database connection exists.
 */

import { DB_NAME, DB_VERSION, createSchema, upgradeData } from './schema'

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

    /*
     * Другая вкладка держит соединение и не даёт поднять версию.
     *
     * Без этого обработчика запрос просто висит: ни `onsuccess`, ни `onerror` не
     * приходят, и всё приложение молча ждёт вечно. Обработчик ниже
     * (`onversionchange`) закрывает соединение с той стороны, так что до этого
     * сообщения дело доходит редко — но «редко» и «никогда» это разные вещи, а
     * висящий без объяснений экран хуже понятной просьбы. Найдено ревью F3.
     */
    request.onblocked = () => {
      console.error('Обновление базы заблокировано другой вкладкой')
      dbState.initPromise = null
      reject(new Error('The app is open in another tab. Close it and reload this page.'))
    }

    request.onsuccess = () => {
      const db = request.result
      dbState.db = db

      // Handle database close event
      db.onclose = () => {
        dbState.db = null
        dbState.initPromise = null
      }

      /*
       * Другая вкладка обновляет схему — освобождаем ей дорогу.
       *
       * Не закрыть соединение здесь значит заблокировать ту вкладку: она получит
       * `onblocked` и не сможет открыть базу, пока эту не закроют руками.
       * Состояние сбрасывается, поэтому следующий вызов `initDB` откроет
       * соединение заново — уже с новой схемой.
       */
      db.onversionchange = () => {
        console.warn('База обновляется в другой вкладке, закрываем соединение')
        db.close()
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
      const db = request.result
      try {
        createSchema(db)

        // Сторы уже существуют, дальше — перенос самих данных. Транзакция
        // берётся у запроса: своя здесь не откроется, versionchange
        // блокирует всё остальное до конца обновления.
        const transaction = request.transaction
        if (transaction) {
          upgradeData(transaction, event.oldVersion)
        }
      } catch (error) {
        console.error('Error creating database schema:', error)
        /*
         * Сбросить `initPromise` здесь так же обязательно, как в `onerror`, и
         * сначала этого не было: отказ запоминался навсегда, и каждый
         * следующий вызов `initDB` получал тот же отвергнутый промис — до
         * перезагрузки вкладки приложение оставалось без базы, даже если
         * причина была разовой. Найдено ревью F3.
         */
        dbState.initPromise = null
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
