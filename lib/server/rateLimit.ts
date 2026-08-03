/**
 * Ограничение частоты обращений к маршрутам публикации.
 *
 * Считается в Postgres. Счётчик в памяти процесса здесь бесполезен: функции
 * Vercel живут по одной на запрос, и до второй попытки он не доживёт.
 *
 * Счётчиков два — на публикацию и на уборку после неудавшейся публикации.
 * Разделены они не для порядка: уборка случается ровно тогда, когда публикация
 * не удалась, и складывать их в один счётчик значило бы наказывать за сорванную
 * публикацию вторым списанием. Различаются они солью в отпечатке, поэтому
 * отдельного столбца в таблице не потребовалось.
 */

import { sha256Hex, sql } from './db'

/** Сколько публикаций разрешено с одного источника за окно. */
const MAX_ATTEMPTS = 10

/**
 * Сколько уборок разрешено с одного источника за окно.
 *
 * Больше, чем публикаций: на одну сорванную публикацию приходится один запрос
 * уборки, но обрыв сети посреди загрузки может повторяться, и отказать в уборке
 * значит оставить мусор в хранилище.
 */
const MAX_CLEANUPS = 30

/** Длина окна в минутах. */
const WINDOW_MINUTES = 60

/** Насколько назад чистим историю попыток. */
const KEEP_HOURS = 24

export interface RateLimitResult {
  allowed: boolean
  /** Сколько попыток уже израсходовано в окне */
  used: number
  limit: number
}

/**
 * Учесть попытку и сказать, разрешена ли она.
 *
 * Запись делается всегда, даже когда попытка отклоняется: иначе достаточно
 * долбиться в закрытую дверь, чтобы окно само рассосалось.
 *
 * Отказ базы не должен блокировать публикацию: если учёт не работает, честнее
 * пропустить, чем не дать поделиться коллекцией. Защита от спама важна, но она
 * вторична по отношению к тому, ради чего приложение существует.
 */
export async function checkPublishRateLimit(request: Request): Promise<RateLimitResult> {
  return check(request, 'publish', MAX_ATTEMPTS)
}

/**
 * То же для уборки файлов после неудавшейся публикации.
 *
 * Своё окно, свой предел — см. пояснение к счётчикам сверху файла.
 */
export async function checkCleanupRateLimit(request: Request): Promise<RateLimitResult> {
  return check(request, 'cleanup', MAX_CLEANUPS)
}

async function check(request: Request, action: string, limit: number): Promise<RateLimitResult> {
  const clientHash = await hashClient(request, action)

  try {
    const db = sql()

    await db`insert into publish_attempts (client_hash) values (${clientHash})`

    // Драйвер описывает результат объединением типов, поэтому приведение
    // здесь и в остальных запросах: форму строк мы задаём сами в select.
    const rows = (await db`
      select count(*)::int as used
      from publish_attempts
      where client_hash = ${clientHash}
        and attempted_at > now() - (${WINDOW_MINUTES} || ' minutes')::interval
    `) as { used: number }[]

    const used = rows[0]?.used ?? 0

    // Уборка старых записей идёт заодно с проверкой: отдельного расписания в
    // проекте нет, а таблица иначе растёт без предела.
    await db`delete from publish_attempts where attempted_at < now() - (${KEEP_HOURS} || ' hours')::interval`

    return { allowed: used <= limit, used, limit }
  } catch (error) {
    console.error(`Учёт (${action}) не сработал, пропускаем:`, error)
    return { allowed: true, used: 0, limit }
  }
}

/**
 * Отпечаток источника запроса.
 *
 * Берётся адрес из заголовков, которые ставит Vercel, и сразу хешируется:
 * различать источники нужно, хранить чужие адреса — нет.
 */
async function hashClient(request: Request, action: string): Promise<string> {
  const forwarded = request.headers.get('x-forwarded-for') ?? ''
  const real = request.headers.get('x-real-ip') ?? ''

  // x-forwarded-for это список, свой прокси Vercel дописывает справа —
  // настоящий клиент первый.
  const address = forwarded.split(',')[0].trim() || real || 'unknown'

  /*
   * Соль обязательна, и без неё обещание из `DECISIONS.md` («накапливать чужие
   * IP — нет») не выполнялось: пространство IPv4 это 2³², префикс был
   * константный, и полный перебор восстанавливал адрес за минуты. Поймано
   * независимым ревью (F3).
   *
   * Солью служит уже существующий серверный секрет — строка подключения к базе.
   * Новой переменной окружения это не требует, а без доступа к серверу перебор
   * становится невозможен. Значение соли никуда не уходит: в хеш попадает
   * только результат.
   */
  const salt = process.env.DATABASE_URL ?? 'myplants-no-salt-configured'

  // Действие входит в хеш: так у публикации и уборки разные счётчики в одной
  // таблице, без столбца и без переноса данных.
  return sha256Hex(`${action}:${salt}:${address}`)
}
