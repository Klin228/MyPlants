/**
 * Счётчики событий.
 *
 * Своё, а не `posthog-js`, и причина не в размере библиотеки. У неё по
 * умолчанию включён autocapture: она сама собирает нажатия, переходы и
 * содержимое полей, плюс умеет запись сессий. Всё это пришлось бы выключать
 * набором флагов, а обещание из `CLAUDE.md` — «никакой аналитики по содержимому
 * коллекции» — держалось бы на том, что флаги выставлены верно и что следующая
 * версия библиотеки не поменяет умолчания.
 *
 * Здесь отправлять просто нечего, кроме перечисленного в `EVENTS`. Это видно
 * построчно, и проверяется чтением одного файла.
 *
 * ЧТО УХОДИТ. Имя события, несколько числовых или перечислимых свойств из
 * списка ниже, случайный идентификатор устройства и адрес страницы без строки
 * запроса. Всё.
 *
 * ЧЕГО НЕ УХОДИТ И НЕ МОЖЕТ УЙТИ. Названия растений, виды, цены, заметки,
 * источники, фотографии, заголовки коллекций, идентификаторы публикаций.
 * Свойства события проходят через `sanitize`, который пропускает только числа,
 * логические значения и строки из заранее известного набора: произвольная
 * строка не пройдёт, даже если её случайно передадут.
 */

/**
 * Событие и его допустимые свойства.
 *
 * Перечислением, а не свободным набором: так нельзя завести событие «мимо
 * списка», и весь состав того, что уходит, читается в одном месте.
 */
export type AnalyticsEvent =
  /** Человек стал пользователем: первое растение в коллекции. */
  | { name: 'first_plant_added' }
  /** Порядковый номер, а не название: видно, на каком растении бросают. */
  | { name: 'plant_added'; index: number }
  | { name: 'publish_started'; plants: number }
  | { name: 'publish_completed'; plants: number; photos: number }
  /** Знаменатель воронки: сколько раз открывали публичную страницу. */
  | { name: 'public_page_viewed' }
  /** Нажал «создать свою» с чужой страницы. */
  | { name: 'public_page_cta_clicked' }
  /** Первое растение у пришедшего по ссылке — числитель главной метрики. */
  | { name: 'collection_from_referral' }
  /** Масштаб проблемы из E1. Имя приложения — из известного списка. */
  | { name: 'inapp_browser_detected'; app: string }
  /**
   * `other` — не заглушка, а настоящий случай: установленное на настольном
   * браузере приложение. Подсказку на нём не показывают, а вот подтверждение
   * установки приходит, и раньше оно уезжало как `android` — грязь в отчёте на
   * ровном месте. Найдено ревью F3.
   */
  | { name: 'a2hs_prompt_shown'; platform: 'ios' | 'android' | 'other' }
  | { name: 'a2hs_confirmed'; platform: 'ios' | 'android' | 'other' }
  /** Каким путём восстанавливались и получилось ли. */
  | { name: 'restore_attempted'; source: 'file' | 'publication'; ok: boolean }
  /**
   * Лендинг: сколько раз открыли и сколько раз ушли в приложение (тикет J4).
   *
   * Два числа, а не одно, и это важно: без них нельзя отличить «канал не
   * приводит людей» от «лендинг не убеждает». Первое лечится другими
   * площадками, второе — текстом на странице.
   */
  | { name: 'landing_viewed' }
  | { name: 'landing_cta_clicked' }

/**
 * Строки, которые разрешено отправлять как значения свойств.
 *
 * Белый список, а не проверка «это не похоже на название растения»: перечислить
 * допустимое надёжнее, чем угадывать недопустимое. Названия приложений здесь
 * те же, что в `lib/environment.ts` — они наши, не пользовательские.
 */
const ALLOWED_STRINGS = new Set([
  'ios',
  'android',
  // Настольный браузер. Без него `other` заменялся бы на `unknown` молча —
  // правило «новое строковое свойство сначала в белый список» ровно об этом.
  'other',
  'file',
  'publication',
  'unknown',
  /*
   * Встроенный браузер, опознанный по номеру сборки, а не по имени (тикет H9).
   * Отдельное значение, а не `unknown`: признак косвенный, и по отчёту должно
   * быть видно, как часто он срабатывает — иначе проверить догадку нечем.
   */
  'ios-webview-guess',
  'Instagram',
  'Facebook',
  'Telegram',
  'VK',
  'WeChat',
  'LINE',
  'X',
  'Snapchat',
  'TikTok',
  'WhatsApp',
  'Pinterest',
])

/**
 * Пропустить только то, что заведомо не содержит данных коллекции.
 *
 * Числа и логические значения проходят как есть — по числу нельзя узнать
 * название растения. Строки — только из белого списка; всё остальное
 * заменяется на `unknown` и остаётся в журнале разработчика.
 */
function sanitize(event: AnalyticsEvent): Record<string, number | boolean | string> {
  const { name, ...rest } = event
  const safe: Record<string, number | boolean | string> = {}

  for (const [key, value] of Object.entries(rest)) {
    if (typeof value === 'number' && Number.isFinite(value)) safe[key] = value
    else if (typeof value === 'boolean') safe[key] = value
    else if (typeof value === 'string' && ALLOWED_STRINGS.has(value)) safe[key] = value
    else {
      console.warn(`Свойство ${key} события ${name} не в белом списке и не отправлено`)
      safe[key] = 'unknown'
    }
  }

  return safe
}

/**
 * Случайный идентификатор устройства.
 *
 * Нужен, чтобы воронка отличала одного человека от двух: без него «добавил
 * первое растение» и «опубликовал» не связываются в путь. Ни к чему не
 * привязан, ничего о человеке не значит и живёт в `localStorage` — если его
 * сотрут вместе с данными, устройство станет новым, и это нормально.
 */
const DEVICE_KEY = 'myplants-device'

function deviceId(): string {
  const existing = localStorage.getItem(DEVICE_KEY)
  if (existing) return existing

  // `crypto.randomUUID` есть не всюду (нужен защищённый контекст), поэтому
  // тот же запасной путь, что в `lib/ids.ts`.
  const generated =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) =>
          b.toString(16).padStart(2, '0')
        ).join('')

  localStorage.setItem(DEVICE_KEY, generated)
  return generated
}

/**
 * Отправить событие.
 *
 * Молчит и ничего не ломает, если ключ не задан: в разработке и у того, кто
 * поднял приложение себе, аналитики просто нет. Ошибки сети глотаются — не
 * отправленное событие это потерянная строка в отчёте, а не сломанный экран.
 *
 * `keepalive` — чтобы событие ушло даже если человек в тот же момент уходит со
 * страницы: без него `publish_completed` терялся бы у тех, кто сразу закрывает
 * вкладку.
 */
export function track(event: AnalyticsEvent): void {
  if (typeof window === 'undefined') return

  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST
  if (!key || !host) return

  const body = {
    api_key: key,
    event: event.name,
    distinct_id: deviceId(),
    properties: {
      ...sanitize(event),
      /*
       * Адрес без строки запроса и без хеша. На публичной странице путь
       * содержит идентификатор коллекции, поэтому он заменяется на `/c/*` —
       * знать, какую именно коллекцию смотрели, аналитике незачем, а нам нужно
       * лишь «это была публичная страница».
       */
      $current_url: window.location.pathname.startsWith('/c/')
        ? '/c/*'
        : window.location.pathname,
    },
    timestamp: new Date().toISOString(),
  }

  void fetch(`${host}/i/v0/e/`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    keepalive: true,
  }).catch((error) => {
    console.warn(`Событие ${event.name} не отправлено:`, error)
  })
}
