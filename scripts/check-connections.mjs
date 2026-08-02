/**
 * Проверка, что хранилища для шеринга настроены и доступны.
 *
 * Запускается один раз после `vercel env pull .env.local`, чтобы C3 не
 * начинался вслепую. Публичного маршрута для этого нарочно нет: эндпоинт,
 * отвечающий на вопрос «жива ли база», — лишняя поверхность в приложении,
 * которое сегодня целиком локальное.
 *
 *   npm run check:connections
 */

import { readFile } from 'node:fs/promises'

const ENV_FILE = '.env.local'

/** Ни одна проверка не должна висеть дольше этого: лучше внятный отказ. */
const REQUEST_TIMEOUT_MS = 15_000

/**
 * Прочитать .env.local самостоятельно.
 *
 * Скрипт запускается вне Next.js, а тот подхватывает .env.local сам и только
 * внутри своего процесса. Тянуть ради этого dotenv незачем — формат простой.
 */
async function loadEnv() {
  let raw
  try {
    raw = await readFile(ENV_FILE, 'utf8')
  } catch {
    return null
  }

  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const separator = trimmed.indexOf('=')
    if (separator === -1) continue

    const key = trimmed.slice(0, separator).trim()
    let value = trimmed.slice(separator + 1).trim()

    // vercel env pull заключает значения в кавычки
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    if (!process.env[key]) process.env[key] = value
  }

  return true
}

/**
 * Заглушка, которую `vercel env pull` пишет вместо значений переменных,
 * помеченных в проекте как секретные. Их содержимое CLI не отдаёт вообще,
 * и понять это по ошибке клиента невозможно — он просто ругается на мусор.
 */
const SENSITIVE_PLACEHOLDER = '[SENSITIVE]'

/**
 * Ограничить ожидание промиса.
 *
 * Отменить сам запрос это не может — только перестать его ждать. Для проверки
 * настройки этого достаточно: важно не молчать неопределённо долго.
 */
function withTimeout(promise, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${message} за ${REQUEST_TIMEOUT_MS / 1000} с`)), REQUEST_TIMEOUT_MS)
    }),
  ])
}

function readSecret(name) {
  const value = process.env[name]

  if (!value) {
    return { ok: false, detail: `переменная ${name} не задана` }
  }

  if (value === SENSITIVE_PLACEHOLDER) {
    return {
      ok: false,
      detail: `${name} = ${SENSITIVE_PLACEHOLDER}: значение помечено секретным, ` +
        'vercel env pull его не отдаёт. Скопируйте вручную из панели Vercel.',
    }
  }

  return { ok: true, value }
}

async function checkDatabase() {
  const secret = readSecret('DATABASE_URL')
  if (!secret.ok) return secret

  const { neon } = await import('@neondatabase/serverless')
  const sql = neon(secret.value)
  const rows = await withTimeout(sql`select version() as version`, 'Neon не ответил')

  // «PostgreSQL 17.2 on x86_64...» — оставляем первые два слова
  const version = String(rows[0]?.version ?? '').split(' ').slice(0, 2).join(' ')
  return { ok: true, detail: version || 'соединение есть' }
}

/**
 * Проверка блоб-хранилища прямым запросом к API, без пакета `@vercel/blob`.
 *
 * Пакет здесь намеренно не используется, и на это две причины.
 *
 * Он ходит не через глобальный `fetch`, а своим транспортом, и в отдельных
 * окружениях блокируется наглухо: вызов не возвращается и не падает. Проверка
 * настройки, способная зависнуть на минуты, бесполезна. Прямой запрос к тому
 * же API в том же окружении отвечает за полсекунды.
 *
 * И при пустом `token` он пытается авторизоваться через OIDC, подхватывая
 * `VERCEL_OIDC_TOKEN`, который `vercel env pull` кладёт рядом, — падая с
 * «OIDC is enabled for this project, but not for the development environment»
 * при совершенно верном токене хранилища.
 *
 * Одного запроса к списку файлов достаточно: он подтверждает и что токен
 * рабочий, и что хранилище на месте. Заодно ничего не создаётся, так что и
 * убирать за собой нечего.
 *
 * Само приложение при загрузке фотографий (тикет C3) будет пользоваться
 * пакетом: там он работает в среде Vercel, для которой и написан.
 */
async function checkBlob() {
  const secret = readSecret('BLOB_READ_WRITE_TOKEN')
  if (!secret.ok) return secret

  const response = await fetch('https://blob.vercel-storage.com?limit=1', {
    headers: { authorization: `Bearer ${secret.value}` },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })

  if (response.status === 403) {
    return { ok: false, detail: 'токен отклонён (HTTP 403) — проверьте BLOB_READ_WRITE_TOKEN' }
  }

  if (!response.ok) {
    const body = await response.text()
    return { ok: false, detail: `HTTP ${response.status}: ${body.slice(0, 120)}` }
  }

  const { blobs, hasMore } = await response.json()
  const contents = blobs.length === 0
    ? 'хранилище пустое'
    : `файлов минимум ${blobs.length}${hasMore ? '+' : ''}`

  return { ok: true, detail: `токен принят, ${contents}` }
}

async function main() {
  const loaded = await loadEnv()
  if (!loaded) {
    console.error(`Нет файла ${ENV_FILE}.`)
    console.error('Заведите хранилища в панели Vercel и выполните:')
    console.error('  vercel link')
    console.error('  vercel env pull .env.local')
    process.exit(1)
  }

  const checks = [
    ['Neon Postgres', checkDatabase],
    ['Vercel Blob', checkBlob],
  ]

  let allOk = true

  for (const [name, check] of checks) {
    try {
      const { ok, detail } = await check()
      console.log(`${ok ? '✓' : '✗'} ${name}: ${detail}`)
      if (!ok) allOk = false
    } catch (error) {
      console.log(`✗ ${name}: ${error.message}`)
      allOk = false
    }
  }

  if (!allOk) {
    console.error('\nЧего-то не хватает. Смотрите .env.local.example и раздел 1 в DECISIONS.md.')
    process.exit(1)
  }

  console.log('\nОба хранилища на месте.')
}

main()
