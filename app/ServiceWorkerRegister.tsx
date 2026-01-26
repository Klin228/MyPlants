'use client'

import { useEffect } from 'react'

export default function ServiceWorkerRegister() {
  useEffect(() => {
    // Check if we're in production (service worker should only work in production)
    // In development, next-pwa is disabled, so we skip registration
    // For testing, we allow localhost in production builds
    const isProduction = typeof window !== 'undefined' && 
                         (process.env.NODE_ENV === 'production' || window.location.hostname === 'localhost')

    if (!isProduction) {
      console.log('[SW] Development mode - PWA disabled')
      return
    }

    if (!('serviceWorker' in navigator)) {
      console.warn('[SW] Service Worker not supported')
      return
    }

    // Manually register the service worker (next-pwa auto-registration doesn't work reliably with App Router)
    const registerServiceWorker = async () => {
      try {
        // Check if already registered
        const existingRegistration = await navigator.serviceWorker.getRegistration('/sw.js')
        if (existingRegistration) {
          console.log('[SW] Service Worker already registered', existingRegistration)
          console.log('[SW] Active:', existingRegistration.active)
          console.log('[SW] Installing:', existingRegistration.installing)
          console.log('[SW] Waiting:', existingRegistration.waiting)
          
          // Check for updates
          existingRegistration.update()
          return
        }

        // Register the service worker
        console.log('[SW] Registering service worker at /sw.js...')
        const registration = await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
        })

        console.log('[SW] Service Worker registered successfully', registration)
        console.log('[SW] Registration scope:', registration.scope)
        console.log('[SW] Active:', registration.active)
        console.log('[SW] Installing:', registration.installing)
        console.log('[SW] Waiting:', registration.waiting)

        // Wait for the service worker to be ready
        if (registration.installing) {
          registration.installing.addEventListener('statechange', () => {
            const state = registration.installing?.state
            console.log('[SW] Installing state changed:', state)
            if (state === 'installed') {
              console.log('[SW] Service worker installed successfully')
              // If there's no controller, this is a new service worker
              if (!navigator.serviceWorker.controller) {
                console.log('[SW] New service worker installed, reloading to activate...')
                window.location.reload()
              }
            } else if (state === 'redundant') {
              console.error('[SW] Service worker installation failed - became redundant')
              // Try to unregister and re-register
              registration.unregister().then(() => {
                console.log('[SW] Unregistered failed service worker, will retry on next load')
              })
            }
          })
        }
        
        // Also check if service worker becomes active
        if (registration.waiting) {
          console.log('[SW] Service worker is waiting, skipWaiting will activate it')
        }

        // Handle updates
        registration.addEventListener('updatefound', () => {
          console.log('[SW] Update found')
          const newWorker = registration.installing
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              console.log('[SW] New worker state:', newWorker.state)
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                console.log('[SW] New service worker available')
                // Optionally: show a notification to the user to refresh
              }
            })
          }
        })

        // Listen for controller changes (when new SW takes control)
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          console.log('[SW] New service worker activated - reloading page')
          window.location.reload()
        })

        // Check if service worker is controlling the page
        if (navigator.serviceWorker.controller) {
          console.log('[SW] Service worker is controlling this page')
        } else {
          console.log('[SW] Service worker is not yet controlling this page (will control after reload)')
        }
      } catch (error) {
        console.error('[SW] Service Worker registration failed', error)
        console.error('[SW] Error details:', {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined
        })
      }
    }

    // Register when page loads (wait a bit to ensure DOM is ready)
    const registerWhenReady = () => {
      // Small delay to ensure all resources are loaded
      setTimeout(registerServiceWorker, 100)
    }

    if (document.readyState === 'complete') {
      registerWhenReady()
    } else {
      window.addEventListener('load', registerWhenReady)
    }

    // Also listen for service worker ready
    navigator.serviceWorker.ready
      .then((registration) => {
        console.log('[SW] Service Worker ready and controlling page', registration)
        console.log('[SW] Controller:', navigator.serviceWorker.controller)
      })
      .catch((err) => {
        console.error('[SW] Service Worker ready error', err)
      })

    // Listen for service worker errors
    navigator.serviceWorker.addEventListener('error', (event) => {
      console.error('[SW] Service Worker error event:', event)
    })

    // Listen for service worker messages (for debugging)
    navigator.serviceWorker.addEventListener('message', (event) => {
      console.log('[SW] Message from service worker:', event.data)
    })
  }, [])

  return null
}

