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
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        padding: '2rem',
        backgroundColor: '#d9d0de',
        fontFamily: 'var(--font-pt-sans), system-ui, -apple-system, sans-serif'
      }}>
        <div style={{
          backgroundColor: 'white',
          borderRadius: '16px',
          padding: '2rem',
          maxWidth: '500px',
          textAlign: 'center',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)'
        }}>
          <h1 style={{
            fontSize: '1.5rem',
            fontWeight: 'bold',
            color: '#1b2021',
            marginBottom: '1rem',
            fontFamily: 'var(--font-lora), serif'
          }}>
            You're back online!
          </h1>
          <p style={{
            color: '#666',
            marginBottom: '1.5rem'
          }}>
            Redirecting you to the app...
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      padding: '2rem',
      backgroundColor: '#d9d0de',
      fontFamily: 'var(--font-pt-sans), system-ui, -apple-system, sans-serif'
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '16px',
        padding: '2rem',
        maxWidth: '500px',
        textAlign: 'center',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)'
      }}>
        <div style={{
          fontSize: '4rem',
          marginBottom: '1rem'
        }}>
          📡
        </div>
        <h1 style={{
          fontSize: '1.75rem',
          fontWeight: 'bold',
          color: '#1b2021',
          marginBottom: '1rem',
          fontFamily: 'var(--font-lora), serif'
        }}>
          You are offline
        </h1>
        <p style={{
          color: '#666',
          marginBottom: '1.5rem',
          lineHeight: '1.6'
        }}>
          It looks like you've lost your internet connection. 
          Don't worry - your plant collection is saved locally and you can still view it.
        </p>
        <button
          onClick={() => router.push('/')}
          style={{
            padding: '0.875rem 1.5rem',
            borderRadius: '12px',
            backgroundColor: '#8d80ad',
            color: 'white',
            border: 'none',
            fontSize: '1rem',
            fontWeight: '600',
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
            transition: 'background-color 0.2s'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = '#7a6d9a'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = '#8d80ad'
          }}
        >
          Go to My Collection
        </button>
        <p style={{
          fontSize: '0.875rem',
          color: '#888',
          marginTop: '1.5rem',
          marginBottom: 0
        }}>
          Your data is stored locally and will sync when you're back online.
        </p>
      </div>
    </div>
  )
}
