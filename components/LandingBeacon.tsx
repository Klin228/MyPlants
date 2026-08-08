'use client'

/**
 * Счётчик лендинга и его главная кнопка (тикет J4).
 *
 * Клиентский компонент на серверной странице — по той же причине и на тех же
 * условиях, что `PublicPageBeacon`: `'use client'` не значит «только в
 * браузере», ссылка приезжает готовой в HTML, и требование «страница работает
 * без JavaScript» не нарушено.
 *
 * Зачем считать. `ROADMAP.md` требует от этого тикета два события, и они не
 * ради полноты отчёта: постам из кампании некуда вести, кроме приложения, и без
 * этих двух чисел нельзя отличить «канал не приводит людей» от «лендинг не
 * убеждает». Первое лечится другими площадками, второе — текстом на странице.
 */

import { useEffect } from 'react'
import { track } from '@/lib/analytics'

export default function LandingBeacon() {
  useEffect(() => {
    track({ name: 'landing_viewed' })
  }, [])

  return (
    <a
      href="/"
      className="btn btn--primary landing-cta"
      onClick={() => track({ name: 'landing_cta_clicked' })}
    >
      Start your collection
    </a>
  )
}
