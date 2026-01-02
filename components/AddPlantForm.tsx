'use client'

import { useState, FormEvent } from 'react'

interface Plant {
  id: string
  name: string
  photoUrl: string
  price: number
}

interface AddPlantFormProps {
  onAddPlant: (plant: Omit<Plant, 'id'>) => void
}

export default function AddPlantForm({ onAddPlant }: AddPlantFormProps) {
  const [name, setName] = useState('')
  const [photoUrl, setPhotoUrl] = useState('')
  const [price, setPrice] = useState('')

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    
    const priceNum = parseFloat(price)
    if (!name.trim() || !photoUrl.trim() || isNaN(priceNum) || priceNum <= 0) {
      console.log('Form validation failed:', { name, photoUrl, price, priceNum })
      return
    }

    console.log('Form submitted, calling onAddPlant with:', { name, photoUrl, price: priceNum })
    onAddPlant({
      name: name.trim(),
      photoUrl: photoUrl.trim(),
      price: priceNum
    })

    // Reset form
    setName('')
    setPhotoUrl('')
    setPrice('')
  }

  return (
    <form onSubmit={handleSubmit} style={{
      padding: '1.5rem',
      border: '1px solid #ddd',
      borderRadius: '8px',
      marginBottom: '2rem',
      backgroundColor: '#fff'
    }}>
      <h2 style={{ marginTop: 0, marginBottom: '1rem' }}>Add New Plant</h2>
      
      <div style={{ marginBottom: '1rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
          Plant Name:
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{
            width: '100%',
            padding: '0.5rem',
            border: '1px solid #ddd',
            borderRadius: '4px',
            fontSize: '1rem'
          }}
          required
        />
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
          Photo URL:
        </label>
        <input
          type="url"
          value={photoUrl}
          onChange={(e) => setPhotoUrl(e.target.value)}
          style={{
            width: '100%',
            padding: '0.5rem',
            border: '1px solid #ddd',
            borderRadius: '4px',
            fontSize: '1rem'
          }}
          required
        />
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
          Price:
        </label>
        <input
          type="number"
          step="0.01"
          min="0"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          style={{
            width: '100%',
            padding: '0.5rem',
            border: '1px solid #ddd',
            borderRadius: '4px',
            fontSize: '1rem'
          }}
          required
        />
      </div>

      <button
        type="submit"
        style={{
          padding: '0.75rem 1.5rem',
          backgroundColor: '#4CAF50',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          fontSize: '1rem',
          cursor: 'pointer',
          fontWeight: 'bold'
        }}
      >
        Add Plant
      </button>
    </form>
  )
}

