'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import AddPlantForm from '@/components/AddPlantForm'
import Toast from '@/components/Toast'
import { plantsRepository } from '@/lib/repositories/plantsRepository'
import { initializeDatabase } from '@/lib/repositories/migration'
import type { Plant } from '@/lib/models/plant'

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

  const handleAddPlant = async (newPlantData: Omit<Plant, 'id'>) => {
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
          Add plant
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
          onAddPlant={handleAddPlant}
          onCancel={handleCancel}
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
