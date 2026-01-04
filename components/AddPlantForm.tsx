'use client'

import { useState, FormEvent } from 'react'
import type { Plant } from '@/lib/plantStorage'

interface AddPlantFormProps {
  onAddPlant: (plant: Omit<Plant, 'id'>) => void
  onCancel: () => void
}

export default function AddPlantForm({ onAddPlant, onCancel }: AddPlantFormProps) {
  const [name, setName] = useState('')
  const [photoUrl, setPhotoUrl] = useState('')
  const [price, setPrice] = useState('')

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    
    const parsedPrice = parseFloat(price)
    if (!name.trim() || !photoUrl.trim() || isNaN(parsedPrice) || parsedPrice <= 0) {
      return
    }

    onAddPlant({
      name: name.trim(),
      photoUrl: photoUrl.trim(),
      price: parsedPrice
    })

    // Reset form
    setName('')
    setPhotoUrl('')
    setPrice('')
  }

  return (
    <form onSubmit={handleSubmit} style={{
      padding: '1rem',
      border: '1px solid #ddd',
      borderRadius: '8px',
      marginBottom: '1.5rem',
      backgroundColor: '#fff'
    }}>
      <h2 style={{ 
        marginTop: 0, 
        marginBottom: '1rem',
        fontSize: '1.25rem',
        fontWeight: 'bold'
      }}>
        Add New Plant
      </h2>
      
      <div style={{ marginBottom: '1rem' }}>
        <label style={{ 
          display: 'block', 
          marginBottom: '0.5rem', 
          fontWeight: 'bold',
          fontSize: '0.95rem'
        }}>
          Plant Name:
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{
            width: '100%',
            padding: '0.75rem',
            border: '1px solid #ddd',
            borderRadius: '6px',
            fontSize: '16px',
            boxSizing: 'border-box'
          }}
          required
        />
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <label style={{ 
          display: 'block', 
          marginBottom: '0.5rem', 
          fontWeight: 'bold',
          fontSize: '0.95rem'
        }}>
          Photo URL:
        </label>
        <input
          type="url"
          value={photoUrl}
          onChange={(e) => setPhotoUrl(e.target.value)}
          style={{
            width: '100%',
            padding: '0.75rem',
            border: '1px solid #ddd',
            borderRadius: '6px',
            fontSize: '16px',
            boxSizing: 'border-box'
          }}
          required
        />
      </div>

      <div style={{ marginBottom: '1.25rem' }}>
        <label style={{ 
          display: 'block', 
          marginBottom: '0.5rem', 
          fontWeight: 'bold',
          fontSize: '0.95rem'
        }}>
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
            padding: '0.75rem',
            border: '1px solid #ddd',
            borderRadius: '6px',
            fontSize: '16px',
            boxSizing: 'border-box'
          }}
          required
        />
      </div>

      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <button
          type="button"
          onClick={onCancel}
          style={{
            flex: 1,
            padding: '1rem',
            backgroundColor: '#f5f5f5',
            color: '#333',
            border: '1px solid #ddd',
            borderRadius: '6px',
            fontSize: '1rem',
            cursor: 'pointer',
            fontWeight: 'bold',
            minHeight: '48px'
          }}
        >
          Cancel
        </button>
        <button
          type="submit"
          style={{
            flex: 1,
            padding: '1rem',
            backgroundColor: '#4CAF50',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '1.1rem',
            cursor: 'pointer',
            fontWeight: 'bold',
            minHeight: '48px'
          }}
        >
          Add Plant
        </button>
      </div>
    </form>
  )
}

