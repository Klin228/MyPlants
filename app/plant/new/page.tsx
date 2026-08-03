'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import AddPlantForm from '@/components/AddPlantForm'
import Toast from '@/components/Toast'
import { plantsRepository } from '@/lib/repositories/plantsRepository'
import { initializeDatabase } from '@/lib/repositories/migration'
import { requestPersistentStorage } from '@/lib/environment'
import type { NewPlant, Plant } from '@/lib/models/plant'

/**
 * Отметка о том, что постоянное хранилище уже просили.
 *
 * Нужна из-за Firefox: он единственный показывает пользователю вопрос, и
 * спрашивать его повторно на каждое добавленное растение было бы навязчиво.
 * Отметка в `localStorage` — если её сотрут вместе с коллекцией, спросить
 * заново будет как раз уместно.
 */
const PERSIST_ASKED_KEY = 'myplants-persist-requested'

export default function NewPlantPage() {
  const router = useRouter()
  const [plants, setPlants] = useState<Plant[]>([])
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  // Initialize database and load plants on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        // Initialize database and run migration if needed
        await initializeDatabase()
        
        // Load plants from repository
        const loadedPlants = await plantsRepository.getAll()
        setPlants(loadedPlants)
      } catch (error) {
        console.error('Error loading plants:', error)
        setPlants([])
      }
    }
    loadData()
  }, [])

  const handleAddPlant = async (newPlantData: NewPlant) => {
    try {
      // Validate the data
      if (!newPlantData.name || !newPlantData.photos || newPlantData.photos.length === 0) {
        alert('Invalid plant data. Please check all fields.')
        return
      }

      // Create plant using repository
      const newPlant = await plantsRepository.create(newPlantData)
      
      // Update local state
      setPlants([...plants, newPlant])

      /*
       * Просим браузер не вытеснять данные — ровно здесь, а не при загрузке
       * страницы. По умолчанию хранилище считается «лучшим усилием», и Safari
       * стирает его через семь дней использования браузера без захода на сайт.
       *
       * Момент выбран не случайно: у человека только что появилось, что терять,
       * и взаимодействие с сайтом состоялось — Safari и Chrome решают по нему
       * молча, а Firefox покажет вопрос, и на фоне только что добавленного
       * растения он выглядит уместно.
       */
      if (plants.length === 0 && localStorage.getItem(PERSIST_ASKED_KEY) === null) {
        localStorage.setItem(PERSIST_ASKED_KEY, '1')
        const persisted = await requestPersistentStorage()
        console.log(`Постоянное хранилище: ${persisted === null ? 'браузер не умеет' : persisted}`)
      }

      // Show success toast
      setToastMessage(`Plant '${newPlant.name}' added successfully`)
      
      // Navigate back after a short delay
      setTimeout(() => {
        router.push('/')
        router.refresh()
      }, 500)
    } catch (error) {
      console.error('Error adding plant:', error)
      alert('Error saving plant. Please try again.')
    }
  }

  const handleCancel = () => {
    router.push('/')
  }

  // Виды из уже загруженной коллекции — отдельного чтения из базы не нужно
  const knownSpecies = plants
    .map(plant => plant.species)
    .filter((species): species is string => Boolean(species))

  return (
    <div className="screen">
      {/* Fixed Header */}
      <header className="screen-header">
        <button onClick={handleCancel} className="btn btn--icon" aria-label="Go back">
          <ArrowLeft size={20} color="currentColor" />
        </button>
        <h1 className="screen-title">Add plant</h1>
      </header>

      {/* Scrollable Form */}
      <div className="screen-body">
        <AddPlantForm
          onAddPlant={handleAddPlant}
          onCancel={handleCancel}
          knownSpecies={knownSpecies}
        />
      </div>

      {/* Toast Notification */}
      {toastMessage && (
        <Toast
          message={toastMessage}
          onClose={() => setToastMessage(null)}
        />
      )}
    </div>
  )
}
