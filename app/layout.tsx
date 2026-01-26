import type { Metadata, Viewport } from 'next'
import { Lora, PT_Sans } from 'next/font/google'
import ServiceWorkerRegister from './ServiceWorkerRegister'

const lora = Lora({
  subsets: ['latin'],
  variable: '--font-lora',
  display: 'swap',
})

const ptSans = PT_Sans({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-pt-sans',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Plant Collection',
  description: 'Manage your personal plant collection',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'MyPlants',
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
}

export const viewport: Viewport = {
  themeColor: '#8d80ad',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body style={{ 
        margin: 0, 
        padding: 0, 
        fontFamily: 'var(--font-pt-sans), system-ui, -apple-system, sans-serif' 
      }} className={`${lora.variable} ${ptSans.variable}`}>
        <ServiceWorkerRegister />
        
        {children}
      </body>
    </html>
  )
}

