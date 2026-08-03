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

/**
 * Адрес, от которого считаются абсолютные ссылки в метаданных.
 *
 * Без него Next выведет `og:image` относительным, а краулеры мессенджеров
 * понимают только абсолютный — превью просто не появится.
 *
 * По убыванию надёжности: явно заданный адрес, стабильный домен продакшена от
 * Vercel, адрес конкретного развёртывания, локальный сервер. Два средних
 * меняются от деплоя к деплою, так что при своём домене стоит задать первый.
 */
function siteUrl(): URL {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL
  if (explicit) return new URL(explicit)

  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL
  if (production) return new URL(`https://${production}`)

  const deployment = process.env.VERCEL_URL
  if (deployment) return new URL(`https://${deployment}`)

  return new URL('http://localhost:3000')
}

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  // Название совпадает с шапкой приложения и манифестом: вкладка не должна
  // называть продукт иначе, чем он называет себя сам.
  title: 'MyPlants',
  description: 'Personal plant collection manager',
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
  /*
   * Единственные цвета вне globals.css: значение уезжает в <meta> на сборке,
   * CSS-переменная там не вычислится. Держать в паре с --color-bg.
   *
   * Две записи, а не одна: этой строкой браузер красит свою собственную
   * обвязку — адресную строку на Android, полосу состояния у установленного
   * приложения. С одним светлым значением в системной тёмной теме получалась
   * светлая полоса над тёмной страницей.
   *
   * Взят цвет фона, а не акцента: обвязка должна продолжать страницу, а не
   * спорить с ней.
   */
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#d9d0de' },
    { media: '(prefers-color-scheme: dark)', color: '#17141c' },
  ],
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

