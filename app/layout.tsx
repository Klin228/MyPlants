import type { Metadata, Viewport } from 'next'
import { Lora, PT_Sans } from 'next/font/google'
import ServiceWorkerRegister from './ServiceWorkerRegister'
import './globals.css'

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
  // Единственный цвет вне globals.css: значение уезжает в <meta> на сборке,
  // CSS-переменная там не вычислится. Держать в паре с --color-accent.
  themeColor: '#8d80ad',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    // Переменные шрифтов вешаются на <html>, а не на <body>: --font-body в
    // globals.css объявлен в :root и подставляет --font-pt-sans там же. На
    // <body> они были бы объявлены уровнем ниже, подстановка не нашла бы их,
    // и вся типографика молча съезжала бы на Times.
    <html lang="en" className={`${lora.variable} ${ptSans.variable}`}>
      <body>
        <ServiceWorkerRegister />
        
        {children}
      </body>
    </html>
  )
}

