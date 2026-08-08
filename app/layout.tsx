import type { Metadata, Viewport } from 'next'
import { Fraunces, Lora, PT_Sans } from 'next/font/google'
import ServiceWorkerRegister from './ServiceWorkerRegister'
import './globals.css'

/**
 * Дисплейный шрифт заголовков (тикет G1).
 *
 * Переменный, вес до 900: у Lora максимум 700, и на крупном кегле она выглядит
 * тонкой и широкой — плотности, которую хотел владелец, из неё не выжать.
 *
 * Ось `opsz` включена явно. По умолчанию `next/font` берёт из переменного шрифта
 * только вес, а у Fraunces оптический размер меняет пропорции букв: на заголовке
 * в четыре сантиметра они становятся плотнее, чем в подписи.
 *
 * **Кириллицы в Fraunces нет**, и это не оплошность подключения: в наборе только
 * латиница. Названия растений вводит человек, они бывают русскими — поэтому Lora
 * остаётся вторым шрифтом в стеке `--font-display`, и подстановка идёт по глифам.
 */
const fraunces = Fraunces({
  subsets: ['latin'],
  axes: ['opsz'],
  variable: '--font-fraunces',
  display: 'swap',
  /*
   * Автоматическая подменная гарнитура выключена, и без этого замысел не
   * работал: `next/font` дописывает в стек своё `__Fraunces_Fallback` — местный
   * системный шрифт с подогнанными метриками, — и ставит его **перед** нашей
   * Lora. Кириллица есть и у него, поэтому подстановка по глифам останавливалась
   * там, и русские названия набирались системным шрифтом вместо Lora. Замерено:
   * строка «Монстера» выходила 192.48 пикселя вместо 196.32 у Lora.
   *
   * Плата: пока шрифт грузится, подстановка идёт сразу на Lora, метрики которой
   * под Fraunces не подогнаны, — то есть сдвиг вёрстки при подмене чуть заметнее.
   * Lora к этому моменту уже загружена и покрывает оба алфавита, так что обмен
   * честный.
   */
  adjustFontFallback: false,
})

const lora = Lora({
  subsets: ['latin', 'cyrillic'],
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
  title: 'Plantorium',
  description: 'Personal plant collection manager',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Plantorium',
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

  /*
   * Страница занимает экран целиком, включая область выреза и полосы жестов.
   *
   * Без этой строки браузер сам держит контент в безопасной области, а
   * `env(safe-area-inset-*)` отдаёт нули — то есть все обращения к инсетам в
   * `globals.css` ничего не делали, и обнаружить это по виду приложения было
   * нельзя (тикет X1).
   *
   * Плата за строку — вся геометрия краёв теперь наша забота: контент под вырез
   * браузер больше не подвинет. Отступы расставлены токенами `--safe-*` и всегда
   * как `max(обычный, инсет)`, чтобы на устройстве без выреза ничего не поехало.
   */
  viewportFit: 'cover',
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
    <html lang="en" className={`${fraunces.variable} ${lora.variable} ${ptSans.variable}`}>
      <body>
        <ServiceWorkerRegister />
        
        {children}
      </body>
    </html>
  )
}

