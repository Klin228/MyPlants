import type { Plant } from '@/lib/models/plant'
import PhotoGallery from './PhotoGallery'

interface PlantCardProps {
  plant: Plant
  onDelete: (plantId: string) => void
  onEdit: (plant: Plant) => void
}

export default function PlantCard({ plant, onDelete, onEdit }: PlantCardProps) {
  return (
    <div style={{
      border: '1px solid #8d80ad',
      borderRadius: '16px',
      padding: '0',
      backgroundColor: '#fff',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      position: 'relative'
    }}>
      {/* Delete button - small icon in top-left corner */}
      <button
        onClick={() => onDelete(plant.id)}
        style={{
          position: 'absolute',
          top: '0.5rem',
          left: '0.5rem',
          width: '36px',
          height: '36px',
          borderRadius: '50%',
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
          color: 'white',
          border: 'none',
          cursor: 'pointer',
          fontSize: '1.25rem',
          fontWeight: 'bold',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10,
          lineHeight: 1,
          padding: 0
        }}
        aria-label="Delete plant"
      >
        ×
      </button>

      {/* Photo Gallery */}
      <PhotoGallery photos={plant.photos || []} alt={plant.name} />

      {/* Plant name, price, notes, and edit button */}
      <div style={{ padding: '1rem' }}>
        <h3 style={{ 
          margin: '0 0 0.5rem 0',
          fontSize: '1.1rem',
          fontWeight: 'bold',
          color: '#1b2021',
          fontFamily: 'var(--font-lora), serif'
        }}>
          {plant.name}
        </h3>
        <p style={{ 
          margin: '0 0 0.75rem 0', 
          color: '#1b2021',
          fontSize: '1rem',
          fontWeight: '500',
          fontFamily: 'var(--font-pt-sans), sans-serif'
        }}>
          ${plant.price.toFixed(2)}
        </p>
        
        {/* Notes - only show if they exist */}
        {plant.notes && plant.notes.trim() && (
          <div style={{
            marginBottom: '0.75rem',
            padding: '0.75rem',
            backgroundColor: '#f5f5f5',
            borderRadius: '8px',
            border: '1px solid #e0e0e0'
          }}>
            <p style={{
              margin: 0,
              fontSize: '0.9rem',
              color: '#555',
              fontFamily: 'var(--font-pt-sans), sans-serif',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word'
            }}>
              {plant.notes}
            </p>
          </div>
        )}

        <button
          onClick={() => onEdit(plant)}
          style={{
            width: '100%',
            padding: '0.75rem',
            backgroundColor: '#8D80AD',
            color: 'white',
            border: 'none',
            borderRadius: '10px',
            cursor: 'pointer',
            fontSize: '1rem',
            fontWeight: 'bold',
            minHeight: '48px',
            fontFamily: 'var(--font-pt-sans), sans-serif'
          }}
        >
          Edit
        </button>
      </div>
    </div>
  )
}
