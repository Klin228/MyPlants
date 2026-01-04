export interface Plant {
  id: string
  name: string
  photoUrl: string
  price: number
}

const STORAGE_KEY = 'plant-collection'

export function loadPlants(): Plant[] {
  try {
    const storedData = localStorage.getItem(STORAGE_KEY)
    if (storedData) {
      return JSON.parse(storedData) as Plant[]
    }
    return []
  } catch (error) {
    console.error('Error loading plants from localStorage:', error)
    return []
  }
}

export function savePlants(plants: Plant[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(plants))
  } catch (error) {
    console.error('Error saving plants to localStorage:', error)
  }
}

