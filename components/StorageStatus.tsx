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

import { useEffect, useState } from 'react'
import { HardDrive, X } from 'lucide-react'
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

interface State {
  usage: StorageUsage | null
  persisted: boolean | null
  platform: Platform
  /** Показывать ли подсказку про установку на домашний экран. */
  offerInstall: boolean
}

export default function StorageStatus() {
  const [state, setState] = useState<State | null>(null)
  const [hintDismissed, setHintDismissed] = useState(false)

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
