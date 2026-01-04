import type { Plant } from '@/lib/plantStorage'

interface PlantCardProps {
  plant: Plant
  onDelete: (plantId: string) => void
}

export default function PlantCard({ plant, onDelete }: PlantCardProps) {
  return (
    <div style={{
      border: '1px solid #ddd',
      borderRadius: '8px',
      padding: '0',
      backgroundColor: '#fff',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column'
    }}>
      <img 
        src={plant.photoUrl} 
        alt={plant.name}
        style={{
          width: '100%',
          height: '200px',
          objectFit: 'cover',
          display: 'block'
        }}
      />
      <div style={{ padding: '1rem' }}>
        <h3 style={{ 
          margin: '0 0 0.5rem 0',
          fontSize: '1.1rem',
          fontWeight: 'bold'
        }}>
          {plant.name}
        </h3>
        <p style={{ 
          margin: '0 0 1rem 0', 
          color: '#666',
          fontSize: '1rem',
          fontWeight: '500'
        }}>
          ${plant.price.toFixed(2)}
        </p>
        <button
          onClick={() => onDelete(plant.id)}
          style={{
            padding: '0.75rem',
            backgroundColor: '#f44336',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '1rem',
            fontWeight: 'bold',
            width: '100%',
            minHeight: '48px'
          }}
        >
          Delete
        </button>
      </div>
    </div>
  )
}

