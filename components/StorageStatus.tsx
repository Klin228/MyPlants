'use client'

/**
 * Где живёт коллекция и насколько это надёжно.
 *
 * Три вещи из тикета E2 собраны в один блок, а не разбросаны по экрану, потому
 * что говорят об одном: коллекция лежит в этом браузере, места столько, и вот
 * что сделать, чтобы её не потерять.
 *
 * Стоит **под сеткой**, а не сверху. Это не предупреждение — предупреждение
 * живёт в `StorageWarning` и появляется, когда данным правда угрожает
 * изолированное хранилище. Здесь спокойная справка, и место ей внизу.
 *
 * Про семь дней. С Safari 13.1 всё скриптовое хранилище удаляется через семь
 * дней **использования браузера** без взаимодействия с сайтом — не календарных.
 * Приложение, установленное на домашний экран, ведёт отдельный счётчик, и он
 * сбрасывается при каждом открытии, то есть установка практически снимает
 * правило. Поэтому подсказка про домашний экран объясняет сохранность, а не
 * удобство: удобство человека не убедит, потеря коллекции убедит.
 */

import { useEffect, useRef, useState } from 'react'
import { Download, HardDrive, Link2, Upload, X } from 'lucide-react'
import { track } from '@/lib/analytics'
import { createBackup, restoreBackup } from '@/lib/backup'
import {
  previewPublication,
  restoreFromPublication,
  type PublicationPreview,
} from '@/lib/sharing/restoreFromPublication'
import {
  detectInAppBrowser,
  detectPlatform,
  formatBytes,
  isStandalone,
  isStoragePersisted,
  storageUsage,
  type Platform,
  type StorageUsage,
} from '@/lib/environment'

/** Отметка «подсказку про установку видел». */
const HINT_DISMISSED_KEY = 'myplants-install-hint-dismissed'

/** Отметка «уже засчитали установку»: событие нужно один раз за устройство. */
const INSTALLED_KEY = 'myplants-installed-counted'

interface State {
  usage: StorageUsage | null
  persisted: boolean | null
  platform: Platform
  /** Показывать ли подсказку про установку на домашний экран. */
  offerInstall: boolean
}

interface StorageStatusProps {
  /** Вызывается после восстановления: коллекцию на экране надо перечитать. */
  onRestored: () => void
}

export default function StorageStatus({ onRestored }: StorageStatusProps) {
  const [state, setState] = useState<State | null>(null)
  const [hintDismissed, setHintDismissed] = useState(false)
  /** `null` — ничего не делаем; строка — что сейчас идёт или чем кончилось. */
  const [backup, setBackup] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  /** Восстановление по ссылке: поле раскрыто, что в нём, и что нашлось. */
  const [linkOpen, setLinkOpen] = useState(false)
  const [link, setLink] = useState('')
  const [preview, setPreview] = useState<PublicationPreview | null>(null)

  useEffect(() => {
    let cancelled = false

    const platform = detectPlatform(navigator.userAgent)
    /*
     * Подсказка не предлагается в трёх случаях. Уже установлено — предлагать
     * нечего. Встроенный браузер мессенджера — оттуда установить нельзя, и там
     * своё предупреждение, более срочное. Настольный браузер — семидневное
     * правило Safari про мобильный, а «добавить на домашний экран» на ноутбуке
     * человеку ничего не говорит.
     */
    const inApp = detectInAppBrowser(navigator.userAgent, { standalone: isStandalone() })
    const offerInstall = !isStandalone() && !inApp && platform !== 'other'

    Promise.all([storageUsage(), isStoragePersisted()]).then(([usage, persisted]) => {
      if (cancelled) return
      setState({ usage, persisted, platform, offerInstall })
    })

    setHintDismissed(localStorage.getItem(HINT_DISMISSED_KEY) === '1')

    /*
     * Факт установки на домашний экран напрямую не отследить: системного
     * события об этом нет ни на iOS, ни в нашем случае на Android — мы даём
     * инструкцию, а не вызываем приглашение. Зато видно следствие: приложение
     * однажды открылось как установленное. Отмечаем один раз за устройство.
     */
    if (isStandalone() && localStorage.getItem(INSTALLED_KEY) === null) {
      localStorage.setItem(INSTALLED_KEY, '1')
      track({ name: 'a2hs_confirmed', platform: platform === 'ios' ? 'ios' : 'android' })
    }

    // Подсказку показали — знаменатель для предыдущего события
    if (offerInstall && localStorage.getItem(HINT_DISMISSED_KEY) !== '1') {
      track({ name: 'a2hs_prompt_shown', platform: platform === 'ios' ? 'ios' : 'android' })
    }

    return () => {
      cancelled = true
    }
  }, [])

  // Браузер не отвечает ни на один вопрос и подсказка не нужна — блока нет
  if (!state || (!state.usage && state.persisted === null && !state.offerInstall)) return null

  const dismissHint = () => {
    localStorage.setItem(HINT_DISMISSED_KEY, '1')
    setHintDismissed(true)
  }

  const showHint = state.offerInstall && !hintDismissed

  const save = async () => {
    setBusy(true)
    setBackup('Preparing the backup…')
    try {
      const { blob, filename, plants, photos } = await createBackup(new Date())

      /*
       * Скачивание через object URL и невидимую ссылку — единственный способ
       * отдать файл, который мы собрали в памяти. Указатель освобождается
       * сразу: браузер к этому моменту уже забрал данные.
       */
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      link.click()
      URL.revokeObjectURL(url)

      setBackup(`Saved ${plants} ${plants === 1 ? 'plant' : 'plants'} and ${photos} ${photos === 1 ? 'photo' : 'photos'} to ${filename}`)
    } catch (error) {
      console.error('Не удалось собрать резервную копию:', error)
      setBackup(error instanceof Error ? error.message : 'Could not save the backup')
    } finally {
      setBusy(false)
    }
  }

  const restore = async (file: File) => {
    setBusy(true)
    setBackup('Reading the file…')
    try {
      const { added, skipped, photos, missingPhotos } = await restoreBackup(file)

      const parts = [`Restored ${added} ${added === 1 ? 'plant' : 'plants'} with ${photos} ${photos === 1 ? 'photo' : 'photos'}`]
      if (skipped > 0) parts.push(`${skipped} already here`)
      if (missingPhotos.length > 0) parts.push(`photos missing for: ${missingPhotos.join(', ')}`)
      setBackup(`${parts.join('. ')}.`)

      track({ name: 'restore_attempted', source: 'file', ok: added > 0 })
      if (added > 0) onRestored()
    } catch (error) {
      track({ name: 'restore_attempted', source: 'file', ok: false })
      console.error('Не удалось восстановить из копии:', error)
      setBackup(error instanceof Error ? error.message : 'Could not read the file')
    } finally {
      setBusy(false)
    }
  }

  /**
   * Сначала смотрим, что по ссылке, и только потом пишем.
   *
   * Два шага, а не один: критерий тикета — сказать до восстановления, каких
   * полей не будет. Общая фраза «вернётся не всё» это обещание, а посчитанное
   * по собственной публикации человека — факт, и он убедительнее.
   */
  const look = async () => {
    setBusy(true)
    setBackup(null)
    setPreview(null)
    try {
      setPreview(await previewPublication(link))
    } catch (error) {
      setBackup(error instanceof Error ? error.message : 'Could not read the link')
    } finally {
      setBusy(false)
    }
  }

  const restoreLink = async () => {
    setBusy(true)
    setBackup('Downloading photos…')
    try {
      const { added, skipped, photos, photoFailures, pricesMissing } = await restoreFromPublication(link)

      const parts = [`Restored ${added} ${added === 1 ? 'plant' : 'plants'} with ${photos} ${photos === 1 ? 'photo' : 'photos'}`]
      if (skipped > 0) parts.push(`${skipped} already here`)
      if (pricesMissing) parts.push('prices were not published, so they are set to 0')
      if (photoFailures.length > 0) parts.push(`some photos failed for: ${photoFailures.join(', ')}`)
      setBackup(`${parts.join('. ')}.`)

      track({ name: 'restore_attempted', source: 'publication', ok: added > 0 })
      setPreview(null)
      setLinkOpen(false)
      setLink('')
      if (added > 0) onRestored()
    } catch (error) {
      track({ name: 'restore_attempted', source: 'publication', ok: false })
      console.error('Не удалось восстановить из публикации:', error)
      setBackup(error instanceof Error ? error.message : 'Could not restore from the link')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="storage" aria-label="Storage">
      <p className="storage-line">
        <HardDrive size={14} className="storage-icon" aria-hidden="true" />
        <span>
          This collection is stored in this browser
          {state.usage && (
            <>
              {' — '}
              {formatBytes(state.usage.used)} of {formatBytes(state.usage.quota)} used
            </>
          )}
          {/*
            Про постоянное хранилище говорим только когда оно есть. «Не
            постоянное» пугало бы человека, которому мы и так предлагаем
            установку, а сделать с этим напрямую он ничего не может: решение
            принимает браузер.
          */}
          {state.persisted === true && ', marked as persistent'}
        </span>
      </p>

      <div className="storage-actions">
        <button type="button" onClick={save} className="btn btn--quiet" disabled={busy}>
          <Download size={16} aria-hidden="true" />
          Save a backup
        </button>
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="btn btn--quiet"
          disabled={busy}
        >
          <Upload size={16} aria-hidden="true" />
          Restore from file
        </button>
        {/*
          Поле выбора файла спрятано, а не размечено кнопкой: у него свой
          системный вид, который не сводится к остальным кнопкам, а сбрасывать
          `value` всё равно нужно вручную — иначе повторный выбор того же файла
          не вызовет события.
        */}
        <input
          ref={fileInput}
          type="file"
          accept=".zip,application/zip"
          className="storage-file"
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) restore(file)
          }}
        />

        <button
          type="button"
          onClick={() => { setLinkOpen((open) => !open); setBackup(null); setPreview(null) }}
          className="btn btn--quiet"
          disabled={busy}
        >
          <Link2 size={16} aria-hidden="true" />
          Restore from a link
        </button>
      </div>

      {linkOpen && (
        <div className="storage-link">
          <p className="storage-link-note">
            If you published this collection and lost the device, the link brings back names,
            species, acquisition dates and photos. <strong>Prices, notes and where each plant came
            from only come back if you chose to publish them</strong> — by default they never leave
            the device, so the server does not have them.
          </p>

          <div className="storage-link-row">
            <input
              type="url"
              value={link}
              onChange={(event) => setLink(event.target.value)}
              placeholder="https://…/c/…"
              className="field-input"
              aria-label="Collection link"
              disabled={busy}
            />
            <button type="button" onClick={look} className="btn btn--secondary" disabled={busy || !link.trim()}>
              Check
            </button>
          </div>

          {preview && (
            <div className="storage-link-preview">
              <p className="storage-link-found">
                Found {preview.title ? `“${preview.title}”` : 'a collection'}: {preview.plants}{' '}
                {preview.plants === 1 ? 'plant' : 'plants'}, {preview.photos}{' '}
                {preview.photos === 1 ? 'photo' : 'photos'}.
              </p>
              {/* Перечисляем именно то, чего нет в ЭТОЙ публикации, а не вообще */}
              <p className="storage-link-missing">
                {[
                  !preview.hasPrices && 'prices',
                  !preview.hasNotes && 'notes',
                  !preview.hasSource && 'sources',
                ].filter(Boolean).length > 0
                  ? `Not in this publication and will not come back: ${[
                      !preview.hasPrices && 'prices',
                      !preview.hasNotes && 'notes',
                      !preview.hasSource && 'sources',
                    ]
                      .filter(Boolean)
                      .join(', ')}.`
                  : 'This publication includes prices, notes and sources — everything comes back.'}
              </p>
              <button type="button" onClick={restoreLink} className="btn btn--primary" disabled={busy}>
                {busy ? 'Restoring…' : 'Restore these plants'}
              </button>
            </div>
          )}
        </div>
      )}

      {backup && (
        <p className="storage-result" aria-live="polite">
          {backup}
        </p>
      )}

      {showHint && (
        <div className="storage-hint">
          <div className="storage-hint-body">
            <p className="storage-hint-title">Add MyPlants to your home screen</p>
            <p className="storage-hint-text">
              {state.platform === 'ios'
                ? 'Not for convenience: Safari erases a website’s data after seven days of not visiting it, and an app on the home screen is exempt. Tap the Share button, then “Add to Home Screen”.'
                : 'Not for convenience: a browser may clear a website’s data when space runs low, and an installed app is far less likely to lose it. Open the browser menu, then “Add to Home screen”.'}
            </p>
          </div>
          <button
            type="button"
            onClick={dismissHint}
            className="btn btn--icon storage-hint-dismiss"
            aria-label="Dismiss hint"
          >
            <X size={16} color="currentColor" />
          </button>
        </div>
      )}
    </section>
  )
}
