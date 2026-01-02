'use client'

import { useState } from 'react'
import PlantCard from '@/components/PlantCard'
import AddPlantForm from '@/components/AddPlantForm'

interface Plant {
  id: string
  name: string
  photoUrl: string
  price: number
}

export default function Home() {
  // Plants state
  const [plants, setPlants] = useState<Plant[]>([
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
  ])

  // Handle adding a new plant
  const handleAddPlant = (plantData: Omit<Plant, 'id'>) => {
    const newPlant: Plant = {
      id: Date.now().toString(),
      ...plantData
    }
    console.log('Adding new plant:', newPlant)
    setPlants([...plants, newPlant])
    console.log('Updated plants array length:', plants.length + 1)
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

