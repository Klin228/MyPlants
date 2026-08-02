'use client'

// Подписи здесь английские — как и во всём остальном интерфейсе. Смесь языков
// разбирается целиком в тикете D5, и плодить исключения до него незачем.

import { useEffect, useState } from 'react'
import { Check, Copy, Share2, X } from 'lucide-react'
import type { Plant } from '@/lib/models/plant'
import { DEFAULT_PUBLISH_OPTIONS, type PublishOptions } from '@/lib/sharing/types'
import { publishCollection, type PublishProgress } from '@/lib/sharing/publish'
import { publicationUrl, readPublication, type Publication } from '@/lib/sharing/publication'

interface ShareDialogProps {
  plants: Plant[]
  onClose: () => void
}

const STAGE_LABELS: Record<PublishProgress['stage'], string> = {
  preparing: 'Preparing photos',
  checking: 'Checking storage',
  uploading: 'Uploading photos',
  saving: 'Saving collection',
}

const OPTION_LABELS: [keyof PublishOptions, string][] = [
  ['includePrices', 'Prices and total value'],
  ['includeNotes', 'Notes'],
  ['includeSource', 'Where each plant came from'],
]

export default function ShareDialog({ plants, onClose }: ShareDialogProps) {
  const [title, setTitle] = useState('')
  const [options, setOptions] = useState<PublishOptions>(DEFAULT_PUBLISH_OPTIONS)
  const [existing, setExisting] = useState<Publication | null>(null)
  const [progress, setProgress] = useState<PublishProgress | null>(null)
  const [result, setResult] = useState<{ url: string; skipped: string[]; updated: boolean } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // Прошлый выбор восстанавливается: обновляя публикацию, никто не хочет
  // заново вспоминать, что он тогда разрешил показывать.
  useEffect(() => {
    const publication = readPublication()
    if (!publication) return

    setExisting(publication)
    setOptions(publication.options)
    if (publication.title) setTitle(publication.title)
  }, [])

  const withoutPhotos = plants.filter((plant) => !plant.photos || plant.photos.length === 0).length
  const publishable = plants.length - withoutPhotos
  const busy = progress !== null && result === null

  const toggle = (key: keyof PublishOptions) =>
    setOptions((current) => ({ ...current, [key]: !current[key] }))

  const publish = async () => {
    setError(null)
    setProgress({ stage: 'preparing', done: 0, total: 0, reused: 0 })

    try {
      const { publication, skipped, updated } = await publishCollection(
        { plants, title, options },
        { onProgress: setProgress }
      )
      setResult({ url: publicationUrl(publication.id), skipped, updated })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      setProgress(null)
    }
  }

  const copy = async () => {
    if (!result) return
    try {
      await navigator.clipboard.writeText(result.url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Could not copy. Select the address and copy it manually.')
    }
  }

  const share = async () => {
    if (!result) return
    try {
      await navigator.share({ title: title || 'My plant collection', url: result.url })
    } catch {
      // Отказ от системного диалога — обычное дело, молчим
    }
  }

  return (
    <div className="sheet-backdrop" onClick={busy ? undefined : onClose}>
      <div className="sheet" onClick={(event) => event.stopPropagation()}>
        <div className="sheet-header">
          <h2 className="sheet-title">{result ? 'Collection published' : 'Share collection'}</h2>
          <button onClick={onClose} className="btn btn--icon" aria-label="Close" disabled={busy}>
            <X size={18} color="currentColor" />
          </button>
        </div>

        {result ? (
          <>
            <p className="sheet-text">
              {result.updated
                ? 'The address has not changed — anyone you gave it to sees the updated collection.'
                : 'The link works until you revoke it.'}
            </p>

            <input
              readOnly
              value={result.url}
              onFocus={(event) => event.target.select()}
              className="field-input"
              aria-label="Collection link"
            />

            <div className="form-actions form-actions--plain">
              <button onClick={copy} className="btn btn--secondary">
                {copied ? <Check size={18} /> : <Copy size={18} />}
                {copied ? 'Copied' : 'Copy link'}
              </button>
              {typeof navigator !== 'undefined' && 'share' in navigator && (
                <button onClick={share} className="btn btn--primary">
                  <Share2 size={18} />
                  Share
                </button>
              )}
            </div>

            {result.skipped.length > 0 && (
              <p className="sheet-note">
                Left out because they have no photo: {result.skipped.join(', ')}
              </p>
            )}
          </>
        ) : (
          <>
            <p className="sheet-text">
              {existing
                ? 'This collection is already published. Publishing again updates it at the same address.'
                : `${publishable} ${publishable === 1 ? 'plant' : 'plants'} with photos will be published.`}
            </p>

            <div className="field">
              <label className="field-label" htmlFor="share-title">
                Title (optional):
              </label>
              <input
                id="share-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="field-input"
                placeholder="My collection"
                maxLength={120}
                disabled={busy}
              />
            </div>

            <fieldset className="share-options" disabled={busy}>
              <legend className="field-label">What strangers may see:</legend>
              {OPTION_LABELS.map(([key, label]) => (
                <label key={key} className="share-option">
                  <input type="checkbox" checked={options[key]} onChange={() => toggle(key)} />
                  {label}
                </label>
              ))}
            </fieldset>

            <p className="sheet-note">
              Nothing above leaves your device unless you check it. Species and acquisition date are
              always published.
            </p>

            {withoutPhotos > 0 && (
              <p className="sheet-note">
                {withoutPhotos} {withoutPhotos === 1 ? 'plant' : 'plants'} without photos will be left out.
              </p>
            )}

            {progress && (
              <div className="share-progress" aria-live="polite">
                {STAGE_LABELS[progress.stage]}
                {progress.total > 0 && `: ${progress.done} of ${progress.total}`}
                {progress.reused > 0 && ` (already uploaded: ${progress.reused})`}
              </div>
            )}

            {error && <p className="share-error">{error}</p>}

            <div className="form-actions form-actions--plain">
              <button onClick={onClose} className="btn btn--secondary" disabled={busy}>
                Cancel
              </button>
              <button onClick={publish} className="btn btn--primary" disabled={busy || publishable === 0}>
                {busy ? 'Publishing…' : existing ? 'Update' : 'Publish'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
