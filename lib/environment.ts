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
}

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
 *   `WKWebView` внутри чужого приложения его нет. Признак старый и надёжный.
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
    if (userAgent.includes(marker)) return { app, canEscape: isAndroid }
  }

  if (isAndroid && /;\s*wv[;)]/.test(userAgent)) {
    return { app: null, canEscape: true }
  }

  const isIos = /iPhone|iPad|iPod/.test(userAgent)
  if (isIos && userAgent.includes('AppleWebKit') && !userAgent.includes('Safari/')) {
    return { app: null, canEscape: false }
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
