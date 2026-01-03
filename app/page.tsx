'use client'

import { useState, useEffect } from 'react'
import PlantCard from '@/components/PlantCard'
import AddPlantForm from '@/components/AddPlantForm'

interface Plant {
  id: string
  name: string
  photoUrl: string
  price: number
}

const STORAGE_KEY = 'plant-collection'

export default function Home() {
  // Plants state - initialize as empty, will load from localStorage
  const [plants, setPlants] = useState<Plant[]>([])
  const [isInitialized, setIsInitialized] = useState(false)

  // Load plants from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsedPlants = JSON.parse(stored) as Plant[]
        setPlants(parsedPlants)
      } else {
        // If no stored data, initialize with default plants
        const defaultPlants: Plant[] = [
          {
            id: '1',
            name: 'Monstera Deliciosa',
            photoUrl: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQ82-_rhfp802qBpoAd1aK9lGhC_Jmagb8rJs4gvfyBz1Lj5rvLpXEPZhnZZZ1t1MXtN9rGVrplNDK3m4RJsVTIjqBu5UKyQkmGlAx_Ohs&s=10',
            price: 25.99
          },
          {
            id: '2',
            name: 'Snake Plant',
            photoUrl: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSmS8o5L6GoUQ2aqyk1_V8AbAH8lN4pEsD8Cw&s=10',
            price: 15.50
          },
          {
            id: '3',
            name: 'Pothos',
            photoUrl: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT8WjfgaYdP5XztO5xsu_bDtefWGTsqmMagNzONAIwAqjwz1Q3BaYlVquNO0Pf9zrwZUPFflPr_8XRj4m3xyjhkhFipK2nIaodgM6PuOw&s=10',
            price: 12.00
          }
        ]
        setPlants(defaultPlants)
      }
    } catch (error) {
      console.error('Error loading plants from localStorage:', error)
      // On error, start with empty array
      setPlants([])
    } finally {
      setIsInitialized(true)
    }
  }, [])

  // Save plants to localStorage whenever plants state changes (but only after initial load)
  useEffect(() => {
    if (isInitialized) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(plants))
      } catch (error) {
        console.error('Error saving plants to localStorage:', error)
      }
    }
  }, [plants, isInitialized])

  // Handle adding a new plant
  const handleAddPlant = (plantData: Omit<Plant, 'id'>) => {
    const newPlant: Plant = {
      id: Date.now().toString(),
      ...plantData
    }
    setPlants([...plants, newPlant])
  }

  // Handle deleting a plant
  const handleDeletePlant = (id: string) => {
    setPlants(plants.filter(plant => plant.id !== id))
  }

  // Calculate total price
  const totalPrice = plants.reduce((sum, plant) => sum + plant.price, 0)

  return (
    <main style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto', minHeight: '100vh' }}>
      <h1 style={{ marginBottom: '2rem' }}>My Plant Collection</h1>
      
      <AddPlantForm onAddPlant={handleAddPlant} />
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        {plants.map((plant) => (
          <PlantCard key={plant.id} plant={plant} onDelete={handleDeletePlant} />
        ))}
      </div>

      <div style={{ padding: '1rem', backgroundColor: '#f5f5f5', borderRadius: '8px', textAlign: 'center' }}>
        <strong>Total Price: ${totalPrice.toFixed(2)}</strong>
      </div>
    </main>
  )
}

