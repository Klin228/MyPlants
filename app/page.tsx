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
  const [editingPlant, setEditingPlant] = useState<Plant | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<'name' | 'price' | 'date'>('name')
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

  // Handle updating an existing plant
  const handleUpdatePlant = (updatedPlantData: Omit<Plant, 'id'>) => {
    if (!editingPlant) return
    
    const updatedPlant: Plant = {
      id: editingPlant.id,
      ...updatedPlantData
    }
    const updatedPlants = plants.map(plant => 
      plant.id === editingPlant.id ? updatedPlant : plant
    )
    setPlants(updatedPlants)
    setEditingPlant(null)
    setIsFormOpen(false)
  }

  // Handle deleting a plant
  const handleDeletePlant = (plantIdToDelete: string) => {
    const remainingPlants = plants.filter(plant => plant.id !== plantIdToDelete)
    setPlants(remainingPlants)
  }

  // Handle opening the form and scrolling to it
  const handleOpenForm = () => {
    setEditingPlant(null)
    setIsFormOpen(true)
    // Scroll to form after it renders
    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 0)
  }

  // Handle opening the form in edit mode
  const handleEditPlant = (plant: Plant) => {
    setEditingPlant(plant)
    setIsFormOpen(true)
    // Scroll to form after it renders
    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 0)
  }

  // Filter plants based on search query
  const filteredPlants = plants.filter(plant =>
    plant.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // Sort filtered plants
  const sortedPlants = [...filteredPlants].sort((a, b) => {
    switch (sortBy) {
      case 'name':
        return a.name.localeCompare(b.name)
      case 'price':
        return b.price - a.price // High to low
      case 'date':
        return parseInt(b.id) - parseInt(a.id) // Newest first (higher ID = newer)
      default:
        return 0
    }
  })

  // Calculate total price (always use all plants, not filtered)
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
            onAddPlant={editingPlant ? handleUpdatePlant : handleAddPlant}
            onCancel={() => {
              setIsFormOpen(false)
              setEditingPlant(null)
            }}
            initialPlant={editingPlant}
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
        <>
          {/* Search Input */}
          <div style={{ marginBottom: '1rem' }}>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search plants by name..."
              style={{
                width: '100%',
                padding: '0.875rem',
                border: '1px solid #ddd',
                borderRadius: '8px',
                fontSize: '16px',
                boxSizing: 'border-box',
                minHeight: '48px',
                marginBottom: '0.75rem'
              }}
            />
            
            {/* Sort Control */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'name' | 'price' | 'date')}
              style={{
                width: '100%',
                padding: '0.875rem',
                border: '1px solid #ddd',
                borderRadius: '8px',
                fontSize: '16px',
                boxSizing: 'border-box',
                minHeight: '48px',
                backgroundColor: 'white',
                cursor: 'pointer'
              }}
            >
              <option value="name">Sort by: Name (A-Z)</option>
              <option value="price">Sort by: Price (High to Low)</option>
              <option value="date">Sort by: Date Added (Newest First)</option>
            </select>
          </div>

          {/* Plant List or No Results */}
          {sortedPlants.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '2rem 1rem',
              color: '#666'
            }}>
              <p style={{
                fontSize: '1rem',
                margin: 0,
                fontWeight: '500'
              }}>
                No plants found matching "{searchQuery}"
              </p>
            </div>
          ) : (
            <div style={{ 
              display: 'flex', 
              flexDirection: 'column',
              gap: '1rem', 
              marginBottom: '1.5rem' 
            }}>
              {sortedPlants.map((plant) => (
                <PlantCard 
                  key={plant.id} 
                  plant={plant} 
                  onDelete={handleDeletePlant}
                  onEdit={handleEditPlant}
                />
              ))}
            </div>
          )}
        </>
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

