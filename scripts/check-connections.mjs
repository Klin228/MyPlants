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

async function checkDatabase() {
  if (!process.env.DATABASE_URL) {
    return { ok: false, detail: 'DATABASE_URL не задана' }
  }

  const { neon } = await import('@neondatabase/serverless')
  const sql = neon(process.env.DATABASE_URL)
  const rows = await sql`select version() as version`

  // «PostgreSQL 17.2 on x86_64...» — оставляем первые два слова
  const version = String(rows[0]?.version ?? '').split(' ').slice(0, 2).join(' ')
  return { ok: true, detail: version || 'соединение есть' }
}

async function checkBlob() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return { ok: false, detail: 'BLOB_READ_WRITE_TOKEN не задан' }
  }

  const { put, del } = await import('@vercel/blob')

  // Проба уходит под своим именем и удаляется в finally, чтобы не оставлять
  // мусор в хранилище даже если чтение упадёт.
  const pathname = `connection-check/${Date.now()}.txt`
  const body = 'MyPlants connection check'
  let url

  try {
    const uploaded = await put(pathname, body, {
      access: 'public',
      addRandomSuffix: false,
      contentType: 'text/plain',
    })
    url = uploaded.url

    const response = await fetch(url, { cache: 'no-store' })
    if (!response.ok) {
      return { ok: false, detail: `загрузилось, но не читается: HTTP ${response.status}` }
    }

    const text = await response.text()
    if (text !== body) {
      return { ok: false, detail: 'прочитано не то, что записано' }
    }

    return { ok: true, detail: 'запись, чтение и удаление прошли' }
  } finally {
    if (url) {
      try {
        await del(url)
      } catch (error) {
        console.warn(`  ! пробный файл не удалён, уберите вручную: ${url}`)
        console.warn(`    ${error.message}`)
      }
    }
  }
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
