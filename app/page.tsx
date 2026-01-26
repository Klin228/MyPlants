'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Filter, Plus } from 'lucide-react'
import PlantCard from '@/components/PlantCard'
import { plantsRepository } from '@/lib/repositories/plantsRepository'
import { initializeDatabase } from '@/lib/repositories/migration'
import type { Plant } from '@/lib/models/plant'

export default function Home() {
  const router = useRouter()
  // Plants state - initialize as empty, will load from localStorage
  const [plants, setPlants] = useState<Plant[]>([])
  const [hasLoadedFromStorage, setHasLoadedFromStorage] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<'name' | 'price' | 'date'>('name')
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const filterRef = useRef<HTMLDivElement>(null)

  // Initialize database and load plants on mount and when page becomes visible
  useEffect(() => {
    const loadPlantsData = async () => {
      try {
        // Initialize database and run migration if needed
        await initializeDatabase()
        
        // Load plants from repository
        const loadedPlants = await plantsRepository.getAll()
        setPlants(loadedPlants)
        setHasLoadedFromStorage(true)
      } catch (error) {
        console.error('Error loading plants:', error)
        setPlants([])
        setHasLoadedFromStorage(true)
      }
    }

    loadPlantsData()

    // Reload plants when page becomes visible (e.g., navigating back from add/edit)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadPlantsData()
      }
    }

    // Also listen for focus event (for better mobile support)
    const handleFocus = () => {
      loadPlantsData()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleFocus)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
    }
  }, [])

  // Handle deleting a plant
  const handleDeletePlant = async (plantIdToDelete: string) => {
    try {
      // Delete plant (repository handles photo deletion automatically)
      await plantsRepository.delete(plantIdToDelete)
      
      // Update local state
      const remainingPlants = plants.filter(plant => plant.id !== plantIdToDelete)
      setPlants(remainingPlants)
    } catch (error) {
      console.error('Error deleting plant:', error)
      alert('Error deleting plant. Please try again.')
    }
  }

  // Handle opening the add plant page
  const handleOpenAddForm = () => {
    router.push('/plant/new')
  }

  // Handle opening the edit plant page
  const handleEditPlant = (plant: Plant) => {
    router.push(`/plant/${plant.id}/edit`)
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

  // Close filter dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
        setIsFilterOpen(false)
      }
    }
    if (isFilterOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isFilterOpen])

  return (
    <main style={{ 
      padding: '1rem', 
      paddingBottom: '5.5rem',
      maxWidth: '1200px', 
      margin: '0 auto', 
      minHeight: '100vh',
      backgroundColor: '#d9d0de'
    }}>
      <h1 style={{ 
        marginBottom: '1.5rem', 
        fontSize: '1.75rem',
        fontWeight: 'bold',
        color: '#1b2021',
        fontFamily: 'var(--font-lora), serif'
      }}>
        MyPlants
      </h1>
      
      {plants.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '3rem 1rem',
          color: '#666'
        }}>
          <p style={{
            fontSize: '1.1rem',
            marginBottom: '0.5rem',
            fontWeight: '500',
            fontFamily: 'var(--font-pt-sans), sans-serif'
          }}>
            Your collection is empty
          </p>
          <p style={{
            fontSize: '0.95rem',
            margin: 0,
            color: '#888',
            fontFamily: 'var(--font-pt-sans), sans-serif'
          }}>
            Tap the button below to add your first plant!
          </p>
        </div>
      ) : (
        <>
          {/* Search + Filter Row */}
          <div style={{ 
            marginBottom: '1rem',
            display: 'flex',
            gap: '0.75rem',
            alignItems: 'center'
          }}>
            {/* Search Input with Icon */}
            <div style={{
              flex: 1,
              position: 'relative',
              display: 'flex',
              alignItems: 'center'
            }}>
              <Search 
                size={20} 
                style={{
                  position: 'absolute',
                  left: '0.875rem',
                  color: '#666',
                  pointerEvents: 'none'
                }}
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search plants by name..."
                style={{
                  width: '100%',
                  padding: '0.875rem 0.875rem 0.875rem 2.75rem',
                  border: '1px solid #ddd',
                  borderRadius: '16px',
                  fontSize: '16px',
                  boxSizing: 'border-box',
                  minHeight: '48px',
                  fontFamily: 'var(--font-pt-sans), sans-serif'
                }}
              />
            </div>
            
            {/* Filter Button */}
            <div style={{ position: 'relative' }} ref={filterRef}>
              <button
                onClick={() => setIsFilterOpen(!isFilterOpen)}
                style={{
                  width: '48px',
                  height: '48px',
                  padding: 0,
                  border: '1px solid #ddd',
                  borderRadius: '16px',
                  backgroundColor: 'white',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: '48px',
                  flexShrink: 0
                }}
                aria-label="Filter and sort"
              >
                <Filter size={20} color="#666" />
              </button>
              
              {/* Filter Dropdown */}
              {isFilterOpen && (
                <div style={{
                  position: 'absolute',
                  top: 'calc(100% + 0.5rem)',
                  right: 0,
                  backgroundColor: 'white',
                  border: '1px solid #ddd',
                  borderRadius: '12px',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                  padding: '0.5rem',
                  zIndex: 100,
                  minWidth: '200px'
                }}>
                  <select
                    value={sortBy}
                    onChange={(e) => {
                      setSortBy(e.target.value as 'name' | 'price' | 'date')
                      setIsFilterOpen(false)
                    }}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #ddd',
                      borderRadius: '8px',
                      fontSize: '15px',
                      boxSizing: 'border-box',
                      backgroundColor: 'white',
                      cursor: 'pointer',
                      fontFamily: 'var(--font-pt-sans), sans-serif'
                    }}
                  >
                    <option value="name">Sort by: Name (A-Z)</option>
                    <option value="price">Sort by: Price (High to Low)</option>
                    <option value="date">Sort by: Date Added (Newest First)</option>
                  </select>
                </div>
              )}
            </div>
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
                fontWeight: '500',
                fontFamily: 'var(--font-pt-sans), sans-serif'
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

      {/* Bottom Action Row */}
      <div style={{
        position: 'fixed',
        bottom: '1.5rem',
        left: 0,
        right: 0,
        padding: '0.75rem 1rem',
        display: 'flex',
        gap: '0.75rem',
        alignItems: 'center',
        backgroundColor: 'transparent',
        zIndex: 999
      }}>
        {/* Total Value Block */}
        <div style={{
          flex: 1,
          backgroundColor: 'white',
          border: '1px solid #8d80ad',
          borderRadius: '16px',
          padding: '0.2rem 1rem',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '48px'
        }}>
          <span style={{
            fontSize: '1rem',
            fontWeight: 'bold',
            color: '#1b2021',
            fontFamily: 'var(--font-pt-sans), sans-serif'
          }}>
            Total: ${totalPrice.toFixed(2)}
          </span>
        </div>
        
        {/* Add Plant Button */}
        <button
          onClick={handleOpenAddForm}
          style={{
            padding: '0.875rem 1.25rem',
            borderRadius: '16px',
            backgroundColor: '#2AB917',
            color: 'white',
            border: 'none',
            fontSize: '1.3rem',
            fontWeight: 'bold',
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            minHeight: '48px',
            whiteSpace: 'nowrap',
            fontFamily: 'var(--font-pt-sans), sans-serif'
          }}
          aria-label="Add plant"
        >
          <Plus size={24} />
          Add plant
        </button>
      </div>
    </main>
  )
}

