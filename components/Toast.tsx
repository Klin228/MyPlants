'use client'

import { useEffect } from 'react'

interface ToastProps {
  message: string
  onClose: () => void
  duration?: number
}

export default function Toast({ message, onClose, duration = 3000 }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose()
    }, duration)

    return () => clearTimeout(timer)
  }, [onClose, duration])

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '6rem',
        left: '50%',
        transform: 'translateX(-50%)',
        backgroundColor: '#1b2021',
        color: 'white',
        padding: '0.875rem 1.25rem',
        borderRadius: '12px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
        zIndex: 10000,
        maxWidth: '90%',
        fontSize: '0.95rem',
        fontFamily: 'var(--font-pt-sans), sans-serif',
        animation: 'slideUp 0.3s ease-out'
      }}
    >
      {message}
      <style jsx>{`
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateX(-50%) translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
          }
        }
      `}</style>
    </div>
  )
}
