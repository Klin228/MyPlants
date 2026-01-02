'use client'

import PlantCard from '@/components/PlantCard'

interface Plant {
  id: string
  name: string
  photoUrl: string
  price: number
}

export default function Home() {
  // Hardcoded plants array
  const plants: Plant[] = [
    {
      id: '1',
      name: 'Monstera Deliciosa',
      photoUrl: 'https://images.unsplash.com/photo-1519336056116-9e848d0b2d3b?w=400',
      price: 25.99
    },
    {
      id: '2',
      name: 'Snake Plant',
      photoUrl: 'https://images.unsplash.com/photo-1509423350716-97f9360b4e09?w=400',
      price: 15.50
    },
    {
      id: '3',
      name: 'Pothos',
      photoUrl: 'https://images.unsplash.com/photo-1463320890892-8b58e07a13d8?w=400',
      price: 12.00
    }
  ]

  // Calculate total price
  const totalPrice = plants.reduce((sum, plant) => sum + plant.price, 0)

  return (
    <main style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <h1 style={{ marginBottom: '2rem' }}>My Plant Collection</h1>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        {plants.map((plant) => (
          <PlantCard key={plant.id} plant={plant} />
        ))}
      </div>

      <div style={{ padding: '1rem', backgroundColor: '#f5f5f5', borderRadius: '8px', textAlign: 'center' }}>
        <strong>Total Price: ${totalPrice.toFixed(2)}</strong>
      </div>
    </main>
  )
}

