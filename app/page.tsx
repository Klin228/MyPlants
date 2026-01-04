'use client'

import { useState, useEffect } from 'react'
import PlantCard from '@/components/PlantCard'
import AddPlantForm from '@/components/AddPlantForm'
import { loadPlants, savePlants, type Plant } from '@/lib/plantStorage'

export default function Home() {
  // Plants state - initialize as empty, will load from localStorage
  const [plants, setPlants] = useState<Plant[]>([])
  const [hasLoadedFromStorage, setHasLoadedFromStorage] = useState(false)

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
  }

  // Handle deleting a plant
  const handleDeletePlant = (plantIdToDelete: string) => {
    const remainingPlants = plants.filter(plant => plant.id !== plantIdToDelete)
    setPlants(remainingPlants)
  }

  // Calculate total price
  const totalPrice = plants.reduce((sum, plant) => sum + plant.price, 0)

  return (
    <main style={{ 
      padding: '1rem', 
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
      
      <AddPlantForm onAddPlant={handleAddPlant} />
      
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
            Add your first plant above to get started!
          </p>
        </div>
      ) : (
        <>
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

          <div style={{ 
            padding: '1rem', 
            backgroundColor: '#f5f5f5', 
            borderRadius: '8px', 
            textAlign: 'center',
            fontSize: '1.1rem'
          }}>
            <strong>Total Price: ${totalPrice.toFixed(2)}</strong>
          </div>
        </>
      )}
    </main>
  )
}

