'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import AddPlantForm from '@/components/AddPlantForm'
import Toast from '@/components/Toast'
import { plantsRepository } from '@/lib/repositories/plantsRepository'
import { initializeDatabase } from '@/lib/repositories/migration'
import type { Plant } from '@/lib/models/plant'

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

  const handleUpdatePlant = async (updatedPlantData: Omit<Plant, 'id'>) => {
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

  if (!plant) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        backgroundColor: '#d9d0de'
      }}>
        <p style={{
          fontFamily: 'var(--font-pt-sans), sans-serif',
          color: '#666'
        }}>
          Loading...
        </p>
      </div>
    )
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      backgroundColor: '#d9d0de'
    }}>
      {/* Fixed Header */}
      <header style={{
        position: 'sticky',
        top: 0,
        backgroundColor: 'white',
        borderBottom: '1px solid #e0e0e0',
        padding: '1rem',
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        zIndex: 100
      }}>
        <button
          onClick={handleCancel}
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            border: '1px solid #ddd',
            backgroundColor: 'white',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0
          }}
          aria-label="Go back"
        >
          <ArrowLeft size={20} color="#333" />
        </button>
        <h1 style={{
          margin: 0,
          fontSize: '1.25rem',
          fontWeight: 'bold',
          color: '#1b2021',
          fontFamily: 'var(--font-lora), serif',
          flex: 1
        }}>
          Edit plant
        </h1>
      </header>

      {/* Scrollable Form */}
      <div style={{
        flex: 1,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column'
      }}>
        <AddPlantForm
          onAddPlant={handleUpdatePlant}
          onCancel={handleCancel}
          initialPlant={plant}
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
