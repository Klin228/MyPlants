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
      } catch (error) {
        console.error('Error loading plants:', error)
        setPlants([])
      }
    }

    loadPlantsData()

    // Reload plants when the tab comes back to the foreground.
    // Возврат с add/edit сюда не относится: это клиентская навигация, компонент
    // размонтируется и на обратном пути перечитывает данные при монтировании.
    // Только visibilitychange: focus срабатывает на том же возврате на вкладку
    // и давал второе чтение из IndexedDB.
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadPlantsData()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
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
    <main className="page">
      <h1 className="page-title">MyPlants</h1>

      {plants.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state-title">Your collection is empty</p>
          <p className="empty-state-hint">Tap the button below to add your first plant!</p>
        </div>
      ) : (
        <>
          {/* Search + Filter Row */}
          <div className="toolbar">
            {/* Search Input with Icon */}
            <div className="search">
              <Search size={20} className="search-icon" color="currentColor" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search plants by name..."
                className="search-input"
              />
            </div>

            {/* Filter Button */}
            <div style={{ position: 'relative' }} ref={filterRef}>
              <button
                onClick={() => setIsFilterOpen(!isFilterOpen)}
                className="btn btn--icon-square"
                aria-label="Filter and sort"
              >
                <Filter size={20} color="currentColor" />
              </button>

              {/* Filter Dropdown */}
              {isFilterOpen && (
                <div className="dropdown">
                  <select
                    value={sortBy}
                    onChange={(e) => {
                      setSortBy(e.target.value as 'name' | 'price' | 'date')
                      setIsFilterOpen(false)
                    }}
                    className="select"
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
            <div className="no-results">
              <p>No plants found matching "{searchQuery}"</p>
            </div>
          ) : (
            <div className="plant-list">
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
      <div className="bottom-bar">
        {/* Total Value Block */}
        <div className="total-badge">
          <span>Total: ${totalPrice.toFixed(2)}</span>
        </div>

        {/* Add Plant Button */}
        <button onClick={handleOpenAddForm} className="btn btn--add" aria-label="Add plant">
          <Plus size={24} />
          Add plant
        </button>
      </div>
    </main>
  )
}

