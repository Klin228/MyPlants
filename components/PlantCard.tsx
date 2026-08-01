import type { Plant } from '@/lib/models/plant'
import PhotoGallery from './PhotoGallery'

interface PlantCardProps {
  plant: Plant
  onDelete: (plantId: string) => void
  onEdit: (plant: Plant) => void
}

export default function PlantCard({ plant, onDelete, onEdit }: PlantCardProps) {
  return (
    <div className="card">
      {/* Delete button - small icon in top-left corner */}
      <button
        onClick={() => onDelete(plant.id)}
        className="btn btn--scrim btn--scrim-lg"
        style={{ top: 'var(--space-sm)', left: 'var(--space-sm)' }}
        aria-label="Delete plant"
      >
        ×
      </button>

      {/* Photo Gallery */}
      <PhotoGallery photos={plant.photos || []} alt={plant.name} />

      {/* Plant name, price, notes, and edit button */}
      <div className="card-body">
        <h3 className="card-title">{plant.name}</h3>
        <p className="card-price">${plant.price.toFixed(2)}</p>

        {/* Notes - only show if they exist */}
        {plant.notes && plant.notes.trim() && (
          <div className="card-notes">
            <p>{plant.notes}</p>
          </div>
        )}

        <button onClick={() => onEdit(plant)} className="btn btn--accent">
          Edit
        </button>
      </div>
    </div>
  )
}
