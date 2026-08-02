/**
 * Ограничение частоты публикаций.
 *
 * Считается в Postgres. Счётчик в памяти процесса здесь бесполезен: функции
 * Vercel живут по одной на запрос, и до второй попытки он не доживёт.
 */

import { sha256Hex, sql } from './db'

/** Сколько публикаций разрешено с одного источника за окно. */
const MAX_ATTEMPTS = 10

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
  const clientHash = await hashClient(request)

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

    return { allowed: used <= MAX_ATTEMPTS, used, limit: MAX_ATTEMPTS }
  } catch (error) {
    console.error('Учёт публикаций не сработал, пропускаем:', error)
    return { allowed: true, used: 0, limit: MAX_ATTEMPTS }
  }
}

/**
 * Отпечаток источника запроса.
 *
 * Берётся адрес из заголовков, которые ставит Vercel, и сразу хешируется:
 * различать источники нужно, хранить чужие адреса — нет.
 */
async function hashClient(request: Request): Promise<string> {
  const forwarded = request.headers.get('x-forwarded-for') ?? ''
  const real = request.headers.get('x-real-ip') ?? ''

  // x-forwarded-for это список, свой прокси Vercel дописывает справа —
  // настоящий клиент первый.
  const address = forwarded.split(',')[0].trim() || real || 'unknown'

  return sha256Hex(`publish:${address}`)
}
