/**
 * Лендинг (тикет J4).
 *
 * Закрывает два разных дефицита одной страницей, и оба названы в `ROADMAP.md`.
 *
 * Первый: постам из кампании некуда вести, кроме самого приложения, а
 * приложение открывается пустым экраном — оно не продаёт себя, оно ждёт первое
 * растение.
 *
 * Второй серьёзнее и неочевиден: `allow_indexing` у публикаций выключен по
 * умолчанию и меняться не должен — секретность ссылки в том, что её нельзя
 * угадать, — а значит **у продукта нет ни одной индексируемой страницы вообще**.
 * Эта первая.
 *
 * Серверный компонент без единой строчки клиентской логики, кроме счётчика на
 * кнопке. Сервис-воркер здесь не регистрируется намеренно (см.
 * `ServiceWorkerRegister`): человек пришёл из поиска почитать, что это такое, а
 * не ставить себе приложение офлайн.
 *
 * Тексты — из `BRAND.md`, раздел «Готовые тексты для дыр в воронке».
 */

import type { Metadata } from 'next'
import LandingBeacon from '@/components/LandingBeacon'
import LandingCollage from '@/components/LandingCollage'
import LandingParallax from '@/components/LandingParallax'

/**
 * Ссылка на живую коллекцию — из окружения, а не из кода.
 *
 * Хардкодить сюда идентификатор чьей-то публикации нельзя: это адрес личных
 * данных конкретного человека, он может её отозвать, и тогда лендинг поведёт
 * гостя на «коллекция не найдена». Не задана — кнопки просто нет: пустая
 * вторая кнопка хуже одной работающей.
 *
 * Значением может быть и полный адрес, и один идентификатор — второе короче
 * писать в настройках Vercel.
 */
function exampleCollectionUrl(): string | null {
  const value = process.env.NEXT_PUBLIC_EXAMPLE_COLLECTION?.trim()
  if (!value) return null

  if (value.startsWith('https://') || value.startsWith('http://')) return value
  return `/c/${value}`
}

/*
 * Заголовок страницы пишется под запрос, у которого есть спрос, а отличие
 * продаётся уже после клика — правило из `ROADMAP.md`. Поисковый спрос есть у
 * `plant inventory app` и `houseplant collection app`; у `plant collection
 * value` и `share my plant collection` подсказок Google нет вовсе, и ставить их
 * в заголовок бессмысленно.
 *
 * Индексация здесь разрешена явно, и это единственная такая страница продукта.
 */
export const metadata: Metadata = {
  title: 'Plant collection inventory — Plantorium',
  description:
    'A houseplant collection inventory: what you own, what you paid, where it came from. Publish it as a link that opens for anyone. No account, on either end.',
  robots: { index: true, follow: true },
  openGraph: {
    title: 'Plant collection inventory — Plantorium',
    description:
      'What you own, what you paid, where it came from. Publish your plant collection as a link — no account, on either end.',
    type: 'website',
  },
}

export default function LandingPage() {
  const example = exampleCollectionUrl()

  return (
    <main className="landing">
      <section className="landing-hero">
        <div className="landing-hero-text">
        {/*
          Заголовок набран тем же плотным столбиком, что шапка приложения и
          витрина: `BRAND.md` называет этот приём голосом продукта, и новая
          поверхность обязана говорить им же, иначе лендинг и приложение
          выглядят как два разных продукта.
        */}
        <h1 className="landing-title">What you own, what you paid, where it came from.</h1>

        <p className="landing-lead">
          A catalogue for a plant collection. Publish it as a link that opens for anyone — no
          account, on either end.
        </p>

        <div className="landing-actions">
          <LandingBeacon />

          {/*
            Вторая кнопка важнее первой, и порядок в разметке этому не
            противоречит: человек должен увидеть результат до любого действия, а
            «посмотреть пример» — единственный способ показать результат, ничего
            не требуя взамен. Приём найден в `GROWTH-KIT.md`: сначала своя
            коллекция, потом предложение.
          */}
          {example && (
            <a href={example} className="btn btn--secondary landing-cta">
              See an example collection
            </a>
          )}
          </div>
        </div>

        {/*
          Коллаж — второй столбик первого экрана на широком, и продолжение
          заголовка на телефоне. Он показывает продукт вместо того, чтобы
          описывать его: у обоих ближайших конкурентов первый экран устроен так
          же, и это не подражание, а то, что человек хочет увидеть до текста.
        */}
        <LandingCollage />
        <LandingParallax />
      </section>

      <section className="landing-blocks">
        <article className="landing-block">
          <h2 className="landing-block-title">It&rsquo;s not a care app</h2>
          <p className="landing-block-text">
            No watering reminders, no schedules. Planta and Greg do that well. This records what you
            have: photos, species, what you paid, when you got it, who you got it from.
          </p>
        </article>

        <article className="landing-block">
          <h2 className="landing-block-title">It adds up</h2>
          <p className="landing-block-text">
            The total sits at the top of the screen. Useful for insurance, sobering for everything
            else.
          </p>
        </article>

        <article className="landing-block">
          <h2 className="landing-block-title">You choose what leaves your device</h2>
          <p className="landing-block-text">
            Publishing is one button and it&rsquo;s read-only. Prices, notes and sources are off by
            default — you turn them on per collection. Search engines are off too.
          </p>
        </article>
      </section>

      {/*
        Честный блок про ограничения. В нише, где учёт ведут десятилетиями в
        таблицах, признанное ограничение работает лучше списка функций — и это не
        поза: всё перечисленное здесь правда, и человек всё равно упрётся в это
        на второй день. Лучше он узнает сейчас и решит сам.
      */}
      <section className="landing-limits">
        <h2 className="landing-block-title">What it doesn&rsquo;t do</h2>
        <p className="landing-block-text">
          Your collection lives in this browser, on this device. There&rsquo;s no sync between your
          phone and your laptop, and if you clear your browser data it&rsquo;s gone — there&rsquo;s
          a backup export for that reason. No accounts, no app store version, no plant
          identification. It&rsquo;s one person working on it.
        </p>
      </section>

      <footer className="landing-foot">
        <a href="/">Open Plantorium</a>
      </footer>
    </main>
  )
}
