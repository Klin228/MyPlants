'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

export default function OfflinePage() {
  const router = useRouter()
  const [isOnline, setIsOnline] = useState(true)

  useEffect(() => {
    // Check online status
    const updateOnlineStatus = () => {
      setIsOnline(navigator.onLine)
    }

    // Set initial status
    updateOnlineStatus()

    // Listen for online/offline events
    window.addEventListener('online', updateOnlineStatus)
    window.addEventListener('offline', updateOnlineStatus)

    // If we come back online, redirect to home
    const handleOnline = () => {
      if (navigator.onLine) {
        router.push('/')
      }
    }
    window.addEventListener('online', handleOnline)

    return () => {
      window.removeEventListener('online', updateOnlineStatus)
      window.removeEventListener('offline', updateOnlineStatus)
      window.removeEventListener('online', handleOnline)
    }
  }, [router])

  // If we're back online, show a message and redirect
  if (isOnline) {
    return (
      <div className="offline">
        <div className="offline-card">
          <h1 className="offline-title">You're back online!</h1>
          <p className="offline-text">Redirecting you to the app…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="offline">
      <div className="offline-card">
        <div className="offline-icon">📡</div>
        <h1 className="offline-title offline-title--lg">You are offline</h1>
        <p className="offline-text offline-text--lead">
          It looks like you've lost your internet connection.
          Don't worry - your plant collection is saved locally and you can still view it.
        </p>
        <button onClick={() => router.push('/')} className="btn btn--link">
          Go to My Collection
        </button>
        <p className="offline-footnote">
          Your data is stored locally and will sync when you're back online.
        </p>
      </div>
    </div>
  )
}
