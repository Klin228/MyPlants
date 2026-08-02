/**
 * Картинка превью для мессенджеров.
 *
 * Ссылка, вставленная в телеграм или дискорд, либо показывает сетку обложек,
 * либо пустой прямоугольник — и от этого зависит, перейдёт ли по ней кто-то
 * вообще. Файловое соглашение Next: экспортируем размер и тип, а он сам
 * добавляет в страницу `og:image` и `twitter:image` с абсолютным адресом.
 *
 * Внутри работает satori, и у него своя система координат: поддерживается
 * подмножество CSS, `grid` нет вовсе, каждый элемент с несколькими детьми
 * обязан быть `flex`. Отсюда раскладка, собранная вручную из вложенных
 * флексов, а не из сетки.
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ImageResponse } from 'next/og'
import { sql } from '@/lib/server/db'
import { speciesKey } from '@/lib/species'
import type { SnapshotPhoto } from '@/lib/sharing/types'

export const runtime = 'nodejs'

/**
 * Генерация тянет из хранилища до четырёх фотографий и рисует их в PNG.
 * Делать это на каждый запрос краулера незачем — окно то же, что у страницы.
 */
export const revalidate = 3600

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'Plant collection'

/**
 * Шрифт читается один раз на модуль, а не на каждую отрисовку.
 *
 * Встроенный шрифт satori покрывает только латиницу: без явно переданного
 * файла кириллица в названии превращается в пустые квадраты. Формат TTF —
 * WOFF2 satori не понимает, поэтому кеш `next/font` тут бесполезен.
 *
 * Читается с диска, а не через `fetch(new URL(..., import.meta.url))`: этот
 * приём работает только в рантайме edge, а в nodejs webpack подменяет его
 * путём к статике вида `/_next/static/media/…`, который `fetch` разобрать не
 * может. Попадание файла в бандл функции обеспечивает
 * `outputFileTracingIncludes` в `next.config.js` — без него на Vercel будет
 * «файл не найден» там, где локально всё работало.
 */
const fontData = readFile(join(process.cwd(), 'assets/PTSans-Bold.ttf'))

const COLORS = {
  backdrop: '#1b2021',
  surface: '#d9d0de',
  accent: '#c9bce0',
  text: '#ffffff',
  muted: 'rgba(255, 255, 255, 0.82)',
  faint: 'rgba(255, 255, 255, 0.6)',
}

/** Больше четырёх обложек в превью неразличимы. */
const MAX_COVERS = 4

interface CollectionRow {
  title: string | null
  total_price: string | null
  revoked_at: string | null
}

function blobBaseUrl(): string | null {
  const storeId = process.env.BLOB_STORE_ID
  if (!storeId) return null

  const host = storeId.replace(/^store_/, '').toLowerCase()
  return /^[a-z0-9]+$/.test(host) ? `https://${host}.public.blob.vercel-storage.com` : null
}

export default async function OpengraphImage({ params }: { params: { id: string } }) {
  const font = await fontData
  const fonts = [{ name: 'PT Sans', data: font, style: 'normal' as const, weight: 700 as const }]

  const data = await load(params.id)

  // Маршрут картинки не должен падать пятисоткой: до него доберётся только
  // тот, у кого адрес сохранён отдельно от страницы, и нейтральный холст
  // честнее ошибки.
  if (!data) {
    return new ImageResponse(<Placeholder />, { ...size, fonts })
  }

  return new ImageResponse(<Poster {...data} />, { ...size, fonts })
}

interface PosterData {
  title: string
  summary: string
  totalPrice: string | null
  covers: string[]
}

async function load(id: string): Promise<PosterData | null> {
  const db = sql()

  const rows = (await db`
    select title, total_price, revoked_at from collections where id = ${id}
  `) as CollectionRow[]

  const collection = rows[0]
  if (!collection || collection.revoked_at) return null

  const plants = (await db`
    select species, photos from collection_plants
    where collection_id = ${id}
    order by position
  `) as unknown as { species: string | null; photos: SnapshotPhoto[] }[]

  const base = blobBaseUrl()
  const covers = base
    ? plants
        // По одной обложке с растения: четыре фотографии одного куста
        // выглядели бы как коллекция из одного растения.
        .map((plant) => plant.photos[0])
        .filter(Boolean)
        .slice(0, MAX_COVERS)
        .map((photo) => `${base}/${photo.path}`)
    : []

  const species = new Set(plants.map((plant) => speciesKey(plant.species ?? '')).filter(Boolean))

  return {
    title: truncate(collection.title || 'Plant collection', 60),
    summary: describe(plants.length, species.size),
    totalPrice: collection.total_price === null ? null : Number(collection.total_price).toFixed(2),
    covers,
  }
}

function Poster({ title, summary, totalPrice, covers }: PosterData) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        position: 'relative',
        backgroundColor: COLORS.backdrop,
      }}
    >
      <Mosaic covers={covers} />

      {/*
        Затемнение снизу: без него светлая фотография съедает текст.

        Ширина задана числом, а не парой left и right: satori из двух
        противоположных отступов ширину не выводит, блок получается нулевым и
        градиента просто не видно. Ровно на этом первая версия и попалась.
      */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          bottom: 0,
          width: size.width,
          height: 340,
          display: 'flex',
          backgroundImage:
            'linear-gradient(to bottom, rgba(27, 32, 33, 0), rgba(27, 32, 33, 0.55) 45%, rgba(27, 32, 33, 0.94))',
        }}
      />

      <div
        style={{
          position: 'absolute',
          left: 56,
          bottom: 48,
          width: size.width - 112,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ display: 'flex', fontSize: 64, color: COLORS.text, lineHeight: 1.1 }}>
          {title}
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', marginTop: 18 }}>
          <div style={{ display: 'flex', fontSize: 32, color: COLORS.muted }}>{summary}</div>
          {totalPrice !== null && (
            <div style={{ display: 'flex', fontSize: 32, color: COLORS.accent, marginLeft: 24 }}>
              ${totalPrice}
            </div>
          )}
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          top: 40,
          right: 56,
          display: 'flex',
          fontSize: 26,
          color: COLORS.faint,
        }}
      >
        MyPlants
      </div>
    </div>
  )
}

/**
 * Сетка обложек.
 *
 * Раскладка зависит от числа фотографий: одна во весь холст, две половинами,
 * три — крупная слева и две справа, четыре — два на два. Всё на флексах,
 * потому что `grid` satori не поддерживает.
 */
function Mosaic({ covers }: { covers: string[] }) {
  const frame = {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    width: size.width,
    height: size.height,
    display: 'flex',
  }

  if (covers.length === 0) {
    return <div style={{ ...frame, backgroundColor: COLORS.backdrop }} />
  }

  if (covers.length === 1) {
    return (
      <div style={frame}>
        <Cover src={covers[0]} width={size.width} height={size.height} />
      </div>
    )
  }

  if (covers.length === 2) {
    return (
      <div style={frame}>
        <Cover src={covers[0]} width={size.width / 2} height={size.height} />
        <Cover src={covers[1]} width={size.width / 2} height={size.height} />
      </div>
    )
  }

  if (covers.length === 3) {
    return (
      <div style={frame}>
        <Cover src={covers[0]} width={size.width / 2} height={size.height} />
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <Cover src={covers[1]} width={size.width / 2} height={size.height / 2} />
          <Cover src={covers[2]} width={size.width / 2} height={size.height / 2} />
        </div>
      </div>
    )
  }

  return (
    <div style={{ ...frame, flexWrap: 'wrap' }}>
      {covers.slice(0, 4).map((src) => (
        <Cover key={src} src={src} width={size.width / 2} height={size.height / 2} />
      ))}
    </div>
  )
}

function Cover({ src, width, height }: { src: string; width: number; height: number }) {
  /* eslint-disable-next-line @next/next/no-img-element */
  return <img src={src} width={width} height={height} style={{ objectFit: 'cover' }} alt="" />
}

/** Коллекции нет или её отозвали. */
function Placeholder() {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: COLORS.backdrop,
      }}
    >
      <div style={{ display: 'flex', fontSize: 56, color: COLORS.surface }}>MyPlants</div>
      <div style={{ display: 'flex', fontSize: 30, color: COLORS.faint, marginTop: 20 }}>
        This collection is no longer available
      </div>
    </div>
  )
}

function describe(plantCount: number, speciesCount: number): string {
  const plants = `${plantCount} ${plantCount === 1 ? 'plant' : 'plants'}`
  if (speciesCount === 0) return plants

  return `${plants} · ${speciesCount} species`
}

/** Длинное название ломает раскладку — обрезаем по словам, а не по буквам. */
function truncate(value: string, limit: number): string {
  if (value.length <= limit) return value

  const cut = value.slice(0, limit)
  const lastSpace = cut.lastIndexOf(' ')

  return `${(lastSpace > limit / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
}
