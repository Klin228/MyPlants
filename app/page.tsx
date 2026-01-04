'use client'

import { useState, useEffect, useRef } from 'react'
import PlantCard from '@/components/PlantCard'
import AddPlantForm from '@/components/AddPlantForm'
import { loadPlants, savePlants, type Plant } from '@/lib/plantStorage'

export default function Home() {
  // Plants state - initialize as empty, will load from localStorage
  const [plants, setPlants] = useState<Plant[]>([])
  const [hasLoadedFromStorage, setHasLoadedFromStorage] = useState(false)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const formRef = useRef<HTMLDivElement>(null)

  // Load plants from localStorage on mount
  useEffect(() => {
    const loadedPlants = loadPlants()
    setPlants(loadedPlants)
    setHasLoadedFromStorage(true)
  }, [])

  // Save plants to localStorage whenever plants state changes (but only after initial load)
  useEffect(() => {
    if (hasLoadedFromStorage) {
      savePlants(plants)
    }
  }, [plants, hasLoadedFromStorage])

  // Handle adding a new plant
  const handleAddPlant = (newPlantData: Omit<Plant, 'id'>) => {
    const plantId = Date.now().toString()
    const newPlant: Plant = {
      id: plantId,
      ...newPlantData
    }
    const updatedPlants = [...plants, newPlant]
    setPlants(updatedPlants)
    setIsFormOpen(false)
  }

  // Handle deleting a plant
  const handleDeletePlant = (plantIdToDelete: string) => {
    const remainingPlants = plants.filter(plant => plant.id !== plantIdToDelete)
    setPlants(remainingPlants)
  }

  // Handle opening the form and scrolling to it
  const handleOpenForm = () => {
    setIsFormOpen(true)
    // Scroll to form after it renders
    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 0)
  }

  // Calculate total price
  const totalPrice = plants.reduce((sum, plant) => sum + plant.price, 0)

  return (
    <main style={{ 
      padding: '1rem', 
      paddingBottom: '5rem',
      maxWidth: '1200px', 
      margin: '0 auto', 
      minHeight: '100vh'
    }}>
      <h1 style={{ 
        marginBottom: '1.5rem', 
        fontSize: '1.75rem',
        fontWeight: 'bold'
      }}>
        My Plant Collection
      </h1>
      
      {isFormOpen && (
        <div ref={formRef}>
          <AddPlantForm 
            onAddPlant={handleAddPlant} 
            onCancel={() => setIsFormOpen(false)}
          />
        </div>
      )}
      
      {plants.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '3rem 1rem',
          color: '#666'
        }}>
          <p style={{
            fontSize: '1.1rem',
            marginBottom: '0.5rem',
            fontWeight: '500'
          }}>
            Your collection is empty
          </p>
          <p style={{
            fontSize: '0.95rem',
            margin: 0,
            color: '#888'
          }}>
            Tap the button below to add your first plant!
          </p>
        </div>
      ) : (
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column',
          gap: '1rem', 
          marginBottom: '1.5rem' 
        }}>
          {plants.map((plant) => (
            <PlantCard key={plant.id} plant={plant} onDelete={handleDeletePlant} />
          ))}
        </div>
      )}

      {/* Sticky Total Price Bar */}
      <div style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: '#4CAF50',
        color: 'white',
        padding: '0.75rem 1rem',
        textAlign: 'center',
        fontSize: '1rem',
        fontWeight: 'bold',
        boxShadow: '0 -2px 8px rgba(0, 0, 0, 0.1)',
        zIndex: 999
      }}>
        Total: ${totalPrice.toFixed(2)}
      </div>

      {/* Floating Action Button */}
      {!isFormOpen && (
        <button
          onClick={handleOpenForm}
          style={{
            position: 'fixed',
            bottom: '4.5rem',
            right: '1.5rem',
            padding: '0.875rem 1.5rem',
            borderRadius: '28px',
            backgroundColor: '#4CAF50',
            color: 'white',
            border: 'none',
            fontSize: '1rem',
            fontWeight: 'bold',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            minHeight: '48px',
            whiteSpace: 'nowrap'
          }}
          aria-label="Add plant"
        >
          Add plant
        </button>
      )}
    </main>
  )
}

