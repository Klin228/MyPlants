/**
 * Где именно открыто приложение — и стоит ли доверять здесь хранилищу.
 *
 * Задача не праздная. Ссылка на публичную коллекцию, открытая из телеграма или
 * инстаграма, запускает встроенный браузер приложения: на iOS это отдельный
 * `WKWebView` со **своим хранилищем, изолированным от Safari**. Человек
 * добавляет три растения с фотографиями, закрывает мессенджер, на следующий
 * день открывает Safari — и не находит ничего.
 *
 * Это не редкий край: публичная страница со ссылкой в мессенджере и есть тот
 * канал, ради которого сделан этап C. Самый серьёзный риск проекта создаётся
 * его же механизмом роста.
 *
 * Разбор в `DURABILITY-AND-GROWTH.md`, часть 1.
 */

/** Приложение со встроенным браузером, если удалось узнать его по имени. */
export interface InAppBrowser {
  /** Название для показа человеку, либо null — знаем только сам факт. */
  app: string | null
  /** Android умеет вытолкнуть страницу в Chrome, iOS — нет. */
  canEscape: boolean
  /**
   * Признак прямой или косвенный.
   *
   * `true` — приложение назвало себя, либо в строке агента нет `Safari/`: тут
   * сомнений нет. `false` — вывод сделан по номеру сборки (см. ниже), и говорить
   * человеку надо осторожнее, потому что ошибка возможна.
   */
  certain: boolean
}

/**
 * Номер сборки, который настоящий Safari на iOS сообщает всегда.
 *
 * Apple заморозила его много версий назад: строка агента Safari на любом
 * iPhone содержит `Mobile/15E148`, какой бы ни была система. Тот же
 * замороженный номер копируют Chrome, Firefox и Edge на iOS — они тоже
 * настоящие браузеры со своим постоянным хранилищем.
 *
 * `WKWebView` внутри чужого приложения ставит **настоящий** номер сборки
 * системы. Отсюда признак: номер отличается — значит страница открыта не в
 * браузере, а внутри приложения.
 */
const SAFARI_FROZEN_BUILD = '15E148'

/**
 * Приложения, которые называют себя в строке агента.
 *
 * Порядок важен: `FB_IAB` встречается и у инстаграма, поэтому инстаграм ищется
 * первым. Проверки по подстроке, а не по регулярным выражениям с границами:
 * производители этих строк меняют формат чаще, чем сами метки.
 */
const NAMED: [marker: string, app: string][] = [
  ['Instagram', 'Instagram'],
  ['FBAN', 'Facebook'],
  ['FBAV', 'Facebook'],
  ['FB_IAB', 'Facebook'],
  ['Telegram', 'Telegram'],
  ['VKAndroidApp', 'VK'],
  ['VKClient', 'VK'],
  ['MicroMessenger', 'WeChat'],
  ['Line/', 'LINE'],
  ['Twitter', 'X'],
  ['Snapchat', 'Snapchat'],
  ['musical_ly', 'TikTok'],
  ['BytedanceWebview', 'TikTok'],
  ['WhatsApp', 'WhatsApp'],
  ['Pinterest', 'Pinterest'],
]

/**
 * Определить встроенный браузер.
 *
 * Два уровня. Сначала имена из списка выше — тогда можно назвать приложение.
 * Если имени нет, остаются общие признаки:
 *
 * - Android: метка `wv` в строке агента, её ставит системный `WebView`. Так
 *   ловится телеграм на андроиде, который себя не называет.
 * - iOS: у настоящего Safari в строке агента всегда есть `Safari/`. У
 *   `WKWebView` внутри чужого приложения его нет. Признак старый, но **уже не
 *   покрывает главный для нас случай** — см. ниже.
 * - iOS, второй заход: номер сборки. Телеграм на iPhone не называет себя и при
 *   этом ставит `Safari/604.1`, то есть проходил мимо обоих признаков выше.
 *   Владелец открыл приложение из телеграма и предупреждения не увидел —
 *   строка агента оттуда: `… iPhone OS 18_7 … Version/26.5.2 Mobile/23F84
 *   Safari/604.1`. Отличие от настоящего Safari в ней ровно одно: номер сборки
 *   вместо замороженного `15E148`. Признак косвенный, поэтому помечается
 *   `certain: false`.
 *
 * **Установленное на домашний экран приложение исключается отдельно, и это
 * главная ловушка.** Оно тоже работает в `WKWebView` без `Safari/` в строке
 * агента, то есть попадает под тот же признак — но это ровно тот хороший
 * случай, к которому мы призываем в E2. Показать там предупреждение о потере
 * данных значило бы отпугивать человека от единственного способа их сохранить.
 */
export function detectInAppBrowser(
  userAgent: string,
  { standalone = false }: { standalone?: boolean } = {}
): InAppBrowser | null {
  if (standalone) return null

  const isAndroid = userAgent.includes('Android')

  for (const [marker, app] of NAMED) {
    if (userAgent.includes(marker)) return { app, canEscape: isAndroid, certain: true }
  }

  if (isAndroid && /;\s*wv[;)]/.test(userAgent)) {
    return { app: null, canEscape: true, certain: true }
  }

  const isIos = /iPhone|iPad|iPod/.test(userAgent)
  if (!isIos || !userAgent.includes('AppleWebKit')) return null

  if (!userAgent.includes('Safari/')) {
    return { app: null, canEscape: false, certain: true }
  }

  /*
   * Номер сборки — последняя проверка, и она единственная, которая может
   * ошибиться. Порядок поэтому такой: сначала имя приложения, потом прямые
   * признаки, и только в конец догадка.
   *
   * Ошибиться она может в одну сторону: если Apple когда-нибудь разморозит номер,
   * настоящий Safari попадёт под признак. Поэтому вывод помечен как
   * предположение, и текст предупреждения для него другой — обещать человеку,
   * что он «внутри приложения», по такому основанию нельзя.
   *
   * Номер отсутствует — молчим: `Mobile/` есть в строке агента всегда, и если
   * формат изменился, догадываться не о чем.
   */
  const build = /\bMobile\/([A-Za-z0-9]+)/.exec(userAgent)
  if (build && build[1] !== SAFARI_FROZEN_BUILD) {
    return { app: null, canEscape: false, certain: false }
  }

  return null
}

/** Приложение открыто как установленное, а не во вкладке браузера. */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false

  // navigator.standalone — нестандартное свойство Safari на iOS, в типах его нет
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone
  return iosStandalone === true || window.matchMedia('(display-mode: standalone)').matches
}

/**
 * Сколько места браузер вообще готов дать приложению.
 *
 * **Намеренно не пытается определить приватный режим.** Надёжного способа для
 * всех браузеров нет: старые приёмы закрыты, а ходовая проверка «маленькая
 * квота значит инкогнито» ошибается на обычном браузере с занятым диском. Врать
 * человеку «вы в приватном режиме», когда это не так, хуже, чем промолчать.
 *
 * Поэтому измеряется то, что измеримо, и сообщается как факт: если браузер даёт
 * меньше порога, фотографии действительно могут не сохраниться — независимо от
 * того, приватный это режим, кончившийся диск или настройки. Приватный режим
 * при этом попадает под проверку сам, потому что квота там и правда крошечная.
 *
 * @returns предел в байтах, либо null — браузер не умеет отвечать
 */
export async function storageQuota(): Promise<number | null> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return null

  try {
    const { quota } = await navigator.storage.estimate()
    return typeof quota === 'number' ? quota : null
  } catch {
    return null
  }
}

/**
 * Порог, ниже которого хранилище считается непригодным.
 *
 * Одна фотография после уменьшения — сотни килобайт, коллекция на сорок
 * растений это порядка десяти мегабайт. Пятьдесят взято с запасом: столько
 * обычный браузер даёт всегда, а урезанный контекст — почти никогда.
 */
export const MIN_USABLE_QUOTA = 50 * 1024 * 1024

/**
 * Адрес для принудительного открытия в Chrome на Android.
 *
 * `intent://` — андроидный механизм: система разбирает ссылку и передаёт её
 * названному приложению. На iOS такого нет вовсе, там остаётся только
 * объяснить словами.
 */
export function chromeIntentUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null

    const withoutScheme = `${parsed.host}${parsed.pathname}${parsed.search}`
    return `intent://${withoutScheme}#Intent;scheme=${parsed.protocol.replace(':', '')};package=com.android.chrome;end`
  } catch {
    return null
  }
}

/**
 * Попросить браузер не вытеснять наши данные.
 *
 * Зачем: по умолчанию хранилище считается «лучшим усилием» — браузер вправе
 * стереть его при нехватке места, а Safari стирает всё скриптовое хранилище
 * через семь дней использования браузера без захода на сайт.
 *
 * Как это встречают браузеры, а это важно для места вызова:
 *
 * - **Safari** решает сам, по истории взаимодействия, ничего не спрашивая;
 * - **Chrome** — по своей эвристике вовлечённости, тоже молча;
 * - **Firefox** показывает пользователю вопрос.
 *
 * Из-за Firefox нельзя дёргать это на каждой загрузке: человек получит окно
 * с вопросом ни с того ни с сего. Отсюда вызов ровно в момент добавления
 * первого растения — взаимодействие уже состоялось, просьба выглядит уместной,
 * а вероятность одобрения выше — и отметка о попытке, чтобы не спрашивать
 * дважды.
 *
 * @returns стало ли хранилище постоянным, либо null — браузер не умеет
 */
export async function requestPersistentStorage(): Promise<boolean | null> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return null

  try {
    // Уже постоянное — второй раз не просим, чтобы не звать окно в Firefox
    if (navigator.storage.persisted && (await navigator.storage.persisted())) return true

    return await navigator.storage.persist()
  } catch {
    return null
  }
}

/** Помечено ли хранилище постоянным. `null` — браузер не отвечает. */
export async function isStoragePersisted(): Promise<boolean | null> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persisted) return null

  try {
    return await navigator.storage.persisted()
  } catch {
    return null
  }
}

export interface StorageUsage {
  used: number
  quota: number
}

/**
 * Сколько занято и сколько всего доступно.
 *
 * Число приблизительное по замыслу браузера: он округляет его, чтобы по
 * точному размеру нельзя было опознать посетителя. Для «сколько я уже
 * набрал и сколько влезет» этого достаточно.
 */
export async function storageUsage(): Promise<StorageUsage | null> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return null

  try {
    const { usage, quota } = await navigator.storage.estimate()
    if (typeof usage !== 'number' || typeof quota !== 'number') return null
    return { used: usage, quota }
  } catch {
    return null
  }
}

/** Размер человеку: мегабайты до десятых, гигабайты до десятых. */
export function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024)
  if (mb < 0.1) return 'less than 0.1 MB'
  if (mb < 1024) return `${mb.toFixed(1)} MB`
  return `${(mb / 1024).toFixed(1)} GB`
}

/** Платформа — только чтобы дать верную подсказку об установке. */
export type Platform = 'ios' | 'android' | 'other'

export function detectPlatform(userAgent: string): Platform {
  if (/iPhone|iPad|iPod/.test(userAgent)) return 'ios'
  if (userAgent.includes('Android')) return 'android'
  return 'other'
}
