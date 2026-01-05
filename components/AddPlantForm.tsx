'use client'

import { useState, FormEvent, useEffect } from 'react'
import type { Plant } from '@/lib/plantStorage'

interface AddPlantFormProps {
  onAddPlant: (plant: Omit<Plant, 'id'>) => void
  onCancel: () => void
  initialPlant?: Plant | null
}

export default function AddPlantForm({ onAddPlant, onCancel, initialPlant }: AddPlantFormProps) {
  const [name, setName] = useState('')
  const [photoUrl, setPhotoUrl] = useState('')
  const [price, setPrice] = useState('')
  const [photoPreview, setPhotoPreview] = useState<string>('')

  // Pre-fill form when editing
  useEffect(() => {
    if (initialPlant) {
      setName(initialPlant.name)
      setPhotoUrl(initialPlant.photoUrl)
      setPhotoPreview(initialPlant.photoUrl)
      setPrice(initialPlant.price.toString())
    } else {
      // Reset form when not editing
      setName('')
      setPhotoUrl('')
      setPhotoPreview('')
      setPrice('')
    }
  }, [initialPlant])

  // Handle file upload
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Check if it's an image
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file')
      return
    }

    const reader = new FileReader()
    reader.onloadend = () => {
      const base64String = reader.result as string
      setPhotoUrl(base64String)
      setPhotoPreview(base64String)
    }
    reader.readAsDataURL(file)
  }

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    
    const parsedPrice = parseFloat(price)
    const finalPhotoUrl = photoPreview || photoUrl
    if (!name.trim() || !finalPhotoUrl.trim() || isNaN(parsedPrice) || parsedPrice <= 0) {
      return
    }

    onAddPlant({
      name: name.trim(),
      photoUrl: finalPhotoUrl.trim(),
      price: parsedPrice
    })

    // Reset form only when adding (not editing)
    if (!initialPlant) {
      setName('')
      setPhotoUrl('')
      setPhotoPreview('')
      setPrice('')
    }
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
        {initialPlant ? 'Edit Plant' : 'Add New Plant'}
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
          Plant Photo:
        </label>
        
        {/* Photo Preview */}
        {photoPreview && (
          <div style={{ marginBottom: '0.75rem' }}>
            <img 
              src={photoPreview} 
              alt="Preview" 
              style={{
                width: '100%',
                maxHeight: '200px',
                objectFit: 'cover',
                borderRadius: '6px',
                border: '1px solid #ddd'
              }}
            />
          </div>
        )}

        {/* File Upload */}
        <div style={{ marginBottom: '0.75rem' }}>
          <input
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            style={{
              width: '100%',
              padding: '0.75rem',
              border: '1px solid #ddd',
              borderRadius: '6px',
              fontSize: '16px',
              boxSizing: 'border-box',
              cursor: 'pointer'
            }}
          />
          <p style={{ 
            margin: '0.25rem 0 0 0', 
            fontSize: '0.85rem', 
            color: '#666' 
          }}>
            Or enter a photo URL below
          </p>
        </div>

        {/* URL Input (alternative) */}
        <input
          type="url"
          value={photoUrl.startsWith('data:') ? '' : photoUrl}
          onChange={(e) => {
            const url = e.target.value
            if (!url.startsWith('data:')) {
              setPhotoUrl(url)
              setPhotoPreview(url)
            }
          }}
          placeholder="Or paste a photo URL here"
          style={{
            width: '100%',
            padding: '0.75rem',
            border: '1px solid #ddd',
            borderRadius: '6px',
            fontSize: '16px',
            boxSizing: 'border-box'
          }}
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
          {initialPlant ? 'Save Changes' : 'Add Plant'}
        </button>
      </div>
    </form>
  )
}

