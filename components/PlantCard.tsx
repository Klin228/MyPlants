import type { Plant } from '@/lib/plantStorage'

interface PlantCardProps {
  plant: Plant
  onDelete: (id: string) => void
}

export default function PlantCard({ plant, onDelete }: PlantCardProps) {
  return (
    <div style={{
      border: '1px solid #ddd',
      borderRadius: '8px',
      padding: '1rem',
      backgroundColor: '#fff',
      position: 'relative'
    }}>
      <img 
        src={plant.photoUrl} 
        alt={plant.name}
        style={{
          width: '100%',
          height: '200px',
          objectFit: 'cover',
          borderRadius: '4px',
          marginBottom: '0.5rem'
        }}
      />
      <h3 style={{ margin: '0.5rem 0' }}>{plant.name}</h3>
      <p style={{ margin: 0, color: '#666', marginBottom: '0.5rem' }}>${plant.price.toFixed(2)}</p>
      <button
        onClick={() => onDelete(plant.id)}
        style={{
          padding: '0.5rem 1rem',
          backgroundColor: '#f44336',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '0.9rem',
          fontWeight: 'bold',
          width: '100%'
        }}
      >
        Delete
      </button>
    </div>
  )
}

