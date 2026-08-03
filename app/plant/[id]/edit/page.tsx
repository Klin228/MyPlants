'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import AddPlantForm from '@/components/AddPlantForm'
import Toast from '@/components/Toast'
import { plantsRepository } from '@/lib/repositories/plantsRepository'
import { initializeDatabase } from '@/lib/repositories/migration'
import type { NewPlant, Plant } from '@/lib/models/plant'

export default function EditPlantPage() {
  const router = useRouter()
  const params = useParams()
  const plantId = params.id as string
  
  const [plants, setPlants] = useState<Plant[]>([])
  const [plant, setPlant] = useState<Plant | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  // Initialize database and load plant on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        // Initialize database and run migration if needed
        await initializeDatabase()
        
        // Load plants from repository
        const loadedPlants = await plantsRepository.getAll()
        setPlants(loadedPlants)
        
        // Find the plant to edit
        const foundPlant = loadedPlants.find(p => p.id === plantId)
        if (foundPlant) {
          setPlant(foundPlant)
        } else {
          // Plant not found, redirect to home
          router.push('/')
        }
      } catch (error) {
        console.error('Error loading plants:', error)
        router.push('/')
      }
    }
    loadData()
  }, [plantId, router])

  const handleUpdatePlant = async (updatedPlantData: NewPlant) => {
    if (!plant) return
    
    try {
      // Validate the data
      if (!updatedPlantData.name || !updatedPlantData.photos || updatedPlantData.photos.length === 0) {
        alert('Invalid plant data. Please check all fields.')
        return
      }

      // Update plant using repository
      const updatedPlant = await plantsRepository.update(plant.id, updatedPlantData)
      
      // Update local state
      setPlants(plants.map(p => p.id === plant.id ? updatedPlant : p))
      setPlant(updatedPlant)
      
      // Show success toast
      setToastMessage('Changes saved')
      
      // Navigate back after a short delay
      setTimeout(() => {
        router.push('/')
        router.refresh()
      }, 500)
    } catch (error) {
      console.error('Error updating plant:', error)
      alert('Error saving changes. Please try again.')
    }
  }

  const handleCancel = () => {
    router.push('/')
  }

  // Виды из уже загруженной коллекции — отдельного чтения из базы не нужно
  const knownSpecies = plants
    .map(p => p.species)
    .filter((species): species is string => Boolean(species))

  return (
    <div className="screen">
      {/* Fixed Header */}
      <header className="screen-header">
        <button onClick={handleCancel} className="btn btn--icon" aria-label="Go back">
          <ArrowLeft size={20} color="currentColor" />
        </button>
        <h1 className="screen-title">Edit plant</h1>
      </header>

      {/*
        Пока растение читается из базы, на месте формы стоит скелетон её формы.
        Шапка при этом уже на экране: раньше загрузка возвращала центрированную
        надпись ВМЕСТО всего экрана, поэтому вместе с формой рывком въезжала и
        шапка с кнопкой «назад».
      */}
      {!plant ? (
        <div className="screen-body">
          <div className="form-skeleton" aria-busy="true" aria-label="Loading plant">
            <div className="form-skeleton-photo skeleton" />
            {[0, 1, 2, 3].map((index) => (
              <div key={index} className="form-skeleton-field">
                <div className="form-skeleton-line--label skeleton" />
                <div className="form-skeleton-line skeleton" />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="screen-body">
          <AddPlantForm
            onAddPlant={handleUpdatePlant}
            onCancel={handleCancel}
            initialPlant={plant}
            knownSpecies={knownSpecies}
          />
        </div>
      )}

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
