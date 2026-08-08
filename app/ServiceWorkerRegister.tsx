'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

export default function ServiceWorkerRegister() {
  const pathname = usePathname()

  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      process.env.NODE_ENV !== 'production'
    ) {
      return
    }

    // На чужую коллекцию заходят по ссылке один раз. Ставить такому посетителю
    // наше приложение офлайн — и лишняя работа при первой отрисовке, и просто
    // неожиданно: он открыл страницу посмотреть на растения, а не установить
    // PWA. Маршрут /c/ обслуживается сервером и в офлайн-режиме не нуждается.
    if (pathname?.startsWith('/c/')) {
      return
    }

    // Лендинг — по той же причине (тикет J4): человек пришёл из поиска
    // почитать, что это такое, а не ставить себе приложение офлайн. Ставить
    // сервис-воркер тому, кто ещё не решил, — работа без спроса.
    if (pathname === '/about') {
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
    // Путь в зависимостях: приложение одностраничное, и переход с чужой
    // коллекции на главную должен привести к регистрации. Повторный вызов
    // register() безвреден — браузер видит тот же адрес и ничего не делает.
  }, [pathname])

  return null
}
