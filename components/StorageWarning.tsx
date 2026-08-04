'use client'

/**
 * Предупреждение о том, что здесь данные не сохранятся.
 *
 * Показывается **до того, как человек начал вводить данные** — на главном
 * экране, выше всего остального. Смысл именно в порядке: узнать про изоляцию
 * хранилища после двадцати минут работы бесполезно.
 *
 * Два случая, оба ведут к потере коллекции, но говорить о них надо по-разному:
 *
 * - **встроенный браузер мессенджера** — данные сохранятся, но окажутся видны
 *   только внутри этого приложения; в Safari их не будет;
 * - **урезанное хранилище** — данные могут не сохраниться вовсе.
 */

import { useEffect, useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { track } from '@/lib/analytics'
import {
  chromeIntentUrl,
  detectInAppBrowser,
  isStandalone,
  MIN_USABLE_QUOTA,
  storageQuota,
  type InAppBrowser,
} from '@/lib/environment'

/**
 * Ключ отметки «я прочитал».
 *
 * `sessionStorage`, а не `localStorage`, и это осознанно: во встроенном браузере
 * долговременное хранилище — как раз то, чему нельзя доверять. Отметка,
 * поставленная в него, может исчезнуть вместе с коллекцией, и предупреждение
 * появится снова там, где уже не поможет. Сессии достаточно: она живёт ровно
 * столько, сколько открыта вкладка.
 */
const DISMISSED_KEY = 'myplants-storage-warning-dismissed'

interface Warning {
  kind: 'in-app' | 'low-quota'
  browser: InAppBrowser | null
  quotaMb: number | null
}

export default function StorageWarning() {
  const [warning, setWarning] = useState<Warning | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (sessionStorage.getItem(DISMISSED_KEY) === '1') {
      setDismissed(true)
      return
    }

    const browser = detectInAppBrowser(navigator.userAgent, { standalone: isStandalone() })
    if (browser) {
      setWarning({ kind: 'in-app', browser, quotaMb: null })
      // Заодно измеряем масштаб проблемы: имя приложения наше, не пользователя.
      // Догадка по номеру сборки считается отдельно (H9) — иначе не узнать, как
      // часто признак срабатывает и не ошибается ли он.
      track({
        name: 'inapp_browser_detected',
        app: browser.app ?? (browser.certain ? 'unknown' : 'ios-webview-guess'),
      })
      return
    }

    // Проверка места — вторая по очереди: встроенный браузер важнее и
    // определяется сразу, а квота требует ожидания.
    let cancelled = false
    storageQuota().then((quota) => {
      if (cancelled || quota === null || quota >= MIN_USABLE_QUOTA) return
      setWarning({ kind: 'low-quota', browser: null, quotaMb: Math.round(quota / (1024 * 1024)) })
    })

    return () => {
      cancelled = true
    }
  }, [])

  if (!warning || dismissed) return null

  const dismiss = () => {
    sessionStorage.setItem(DISMISSED_KEY, '1')
    setDismissed(true)
  }

  const intent = warning.browser?.canEscape ? chromeIntentUrl(window.location.href) : null

  return (
    <aside className="warning" role="alert">
      <AlertTriangle size={20} className="warning-icon" aria-hidden="true" />

      <div className="warning-body">
        {warning.kind === 'in-app' ? (
          <>
            {/*
              Три варианта текста, а не два, и различие не косметическое (H9).

              Признак по номеру сборки может ошибиться, и тогда это сообщение
              увидит человек в настоящем Safari. Утверждать там «вы внутри
              приложения» и советовать «откройте в Safari» — говорить ерунду.
              Поэтому у догадки свой текст: он предполагает, а не утверждает, и
              совет в нём остаётся верным в любом случае.
            */}
            <p className="warning-title">
              {warning.browser?.app
                ? `You are inside ${warning.browser.app}'s built-in browser`
                : warning.browser?.certain
                  ? 'You are inside an app’s built-in browser'
                  : 'This may be an app’s built-in browser'}
            </p>
            <p className="warning-text">
              {warning.browser?.certain === false ? (
                <>
                  If you opened this link from a messenger, the collection you save here stays
                  inside that app: it will not be in Safari later, and closing the app can wipe it.
                  Open this page in Safari — tap the ⋯ menu, then “Open in Safari” — or save a
                  backup from the bottom of this page.
                </>
              ) : (
                <>
                  A collection saved here stays inside this app. It will not be there when you open
                  Safari or Chrome later, and closing the app can wipe it.
                  {intent ? ' Open this page in Chrome first.' : ' Open this page in Safari first: tap the ⋯ menu, then “Open in Safari”.'}
                </>
              )}
            </p>
            {intent && (
              <p className="warning-action">
                {/* Обычная ссылка, а не router: intent:// уводит из этого браузера
                    в другое приложение, клиентская навигация тут не при чём. */}
                <a href={intent} className="btn btn--primary warning-button">
                  Open in Chrome
                </a>
              </p>
            )}
          </>
        ) : (
          <>
            <p className="warning-title">This browser is limiting storage</p>
            <p className="warning-text">
              It offers about {warning.quotaMb} MB, which is not enough for a collection with
              photos. Private or incognito windows do this, and so does a full disk. Photos may fail
              to save.
            </p>
          </>
        )}
      </div>

      <button type="button" onClick={dismiss} className="btn btn--icon warning-dismiss" aria-label="Dismiss warning">
        <X size={16} color="currentColor" />
      </button>
    </aside>
  )
}
