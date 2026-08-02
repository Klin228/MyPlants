/**
 * Применение SQL-миграций к Neon.
 *
 * Мигратора в проекте нет и не нужно: миграции редкие, файлы применяются по
 * порядку номеров, применённые записываются в таблицу `migrations`. Повторный
 * прогон ничего не делает.
 *
 *   npm run migrate
 *   npm run migrate -- --dry   показать, что применилось бы
 */

import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

const MIGRATIONS_DIR = 'db/migrations'
const ENV_FILE = '.env.local'
const SENSITIVE_PLACEHOLDER = '[SENSITIVE]'

async function loadEnv() {
  let raw
  try {
    raw = await readFile(ENV_FILE, 'utf8')
  } catch {
    return false
  }

  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const separator = trimmed.indexOf('=')
    if (separator === -1) continue

    const key = trimmed.slice(0, separator).trim()
    let value = trimmed.slice(separator + 1).trim()
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
 * Разобрать файл миграции на отдельные операторы.
 *
 * Драйвер по HTTP не выполняет несколько операторов одним запросом, поэтому
 * файл приходится делить. Делить по регулярке нельзя: первая же версия этого
 * скрипта разрезала `create table` пополам на точке с запятой внутри
 * комментария — «Токен живёт на устройстве владельца;». Поэтому проход по
 * символам с учётом того, где мы находимся.
 *
 * Комментарии выбрасываются: серверу они ни к чему, а спотыкаться о них
 * незачем. Строковые литералы и закавыченные идентификаторы не трогаются —
 * точка с запятой и два дефиса внутри них ничего не разделяют.
 */
function splitStatements(source) {
  const statements = []
  let current = ''
  let inSingleQuote = false
  let inDoubleQuote = false
  let inLineComment = false
  let inBlockComment = false

  for (let i = 0; i < source.length; i++) {
    const char = source[i]
    const next = source[i + 1]

    if (inLineComment) {
      if (char === '\n') {
        inLineComment = false
        current += char
      }
      continue
    }

    if (inBlockComment) {
      if (char === '*' && next === '/') {
        inBlockComment = false
        i++
      }
      continue
    }

    if (!inSingleQuote && !inDoubleQuote) {
      if (char === '-' && next === '-') {
        inLineComment = true
        i++
        continue
      }
      if (char === '/' && next === '*') {
        inBlockComment = true
        i++
        continue
      }
      if (char === ';') {
        const trimmed = current.trim()
        if (trimmed) statements.push(trimmed)
        current = ''
        continue
      }
    }

    // Внутри литерала кавычка удваивается для экранирования: '' и "". Обе
    // половины проходят через эту ветку и состояние возвращается на место.
    if (char === "'" && !inDoubleQuote) inSingleQuote = !inSingleQuote
    if (char === '"' && !inSingleQuote) inDoubleQuote = !inDoubleQuote

    current += char
  }

  const tail = current.trim()
  if (tail) statements.push(tail)

  return statements
}

async function main() {
  const dryRun = process.argv.includes('--dry')

  if (!(await loadEnv())) {
    console.error(`Нет файла ${ENV_FILE}. Смотрите .env.local.example.`)
    process.exit(1)
  }

  const url = process.env.DATABASE_URL
  if (!url || url === SENSITIVE_PLACEHOLDER) {
    console.error(
      url === SENSITIVE_PLACEHOLDER
        ? `DATABASE_URL = ${SENSITIVE_PLACEHOLDER}: значение помечено секретным, скопируйте его из панели Vercel вручную.`
        : 'DATABASE_URL не задана.'
    )
    process.exit(1)
  }

  const { neon } = await import('@neondatabase/serverless')
  const sql = neon(url)

  await sql`
    create table if not exists migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    )
  `

  const applied = new Set(
    (await sql`select name from migrations`).map((row) => row.name)
  )

  const files = (await readdir(MIGRATIONS_DIR))
    .filter((name) => name.endsWith('.sql'))
    .sort()

  let count = 0

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`· ${file} — уже применена`)
      continue
    }

    if (dryRun) {
      console.log(`→ ${file} — применилась бы`)
      count++
      continue
    }

    const source = await readFile(join(MIGRATIONS_DIR, file), 'utf8')
    const chunks = splitStatements(source)

    for (const chunk of chunks) {
      await sql.query(chunk)
    }

    await sql`insert into migrations (name) values (${file})`
    console.log(`✓ ${file} — применена (${chunks.length} оператор(ов))`)
    count++
  }

  if (count === 0) {
    console.log('\nВсё уже применено.')
  } else {
    console.log(`\n${dryRun ? 'К применению' : 'Применено'}: ${count}.`)
  }
}

main().catch((error) => {
  console.error('Миграция не прошла:', error.message)
  process.exit(1)
})
