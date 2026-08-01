'use client'

import { useEffect } from 'react'

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      process.env.NODE_ENV !== 'production'
    ) {
      return
    }

    if (!('serviceWorker' in navigator)) {
      console.warn('[PWA] Service Worker not supported')
      return
    }

    if (window.workbox !== undefined) {
      console.log('[PWA] Registering service worker via Workbox')

      window.workbox.register()

      window.workbox.addEventListener('activated', () => {
        console.log('[PWA] Service Worker activated')
      })

      window.workbox.addEventListener('waiting', () => {
        console.log('[PWA] New Service Worker waiting')
      })
    } else {
      console.warn('[PWA] Workbox is not available')
    }
  }, [])

  return null
}
