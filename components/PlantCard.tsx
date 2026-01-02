interface Plant {
  id: string
  name: string
  photoUrl: string
  price: number
}

interface PlantCardProps {
  plant: Plant
}

export default function PlantCard({ plant }: PlantCardProps) {
  return (
    <div style={{
      border: '1px solid #ddd',
      borderRadius: '8px',
      padding: '1rem',
      backgroundColor: '#fff'
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
      <p style={{ margin: 0, color: '#666' }}>${plant.price.toFixed(2)}</p>
    </div>
  )
}

