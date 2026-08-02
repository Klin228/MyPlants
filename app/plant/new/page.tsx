'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import AddPlantForm from '@/components/AddPlantForm'
import Toast from '@/components/Toast'
import { plantsRepository } from '@/lib/repositories/plantsRepository'
import { initializeDatabase } from '@/lib/repositories/migration'
import type { NewPlant, Plant } from '@/lib/models/plant'

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
