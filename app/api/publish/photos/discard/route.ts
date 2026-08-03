/**
 * Уборка фотографий, загруженных для публикации, которая не состоялась.
 *
 * Фотографии уезжают в хранилище до того, как снимок доедет до базы, — иначе
 * снимку нечего было бы в себе нести: путь это хеш содержимого, и считает его
 * клиент. Значит между загрузкой и сохранением есть окно, в котором файлы уже
 * лежат в хранилище, а коллекции ещё нет. Если публикация в этом окне сорвалась
 * — 429 от ограничителя, 413, 400, 500, обрыв сети, — файлы оставались там
 * навсегда: отзыв про них не знает, потому что смотрит на строки в базе, а строк
 * нет. Это тикет X6.
 *
 * Клиент, у которого публикация сорвалась, присылает сюда пути, которые успел
 * загрузить, и просит их убрать. **Присланный список это просьба, а не
 * разрешение:** удаляются только те пути, на которые не ссылается ни одна
 * неотозванная коллекция, и решает это база — `lib/server/blobCleanup.ts`.
 *
 * Почему открытый маршрут удаления это не дыра:
 *
 * - живую публикацию им не сломать — на путь, который кто-то использует,
 *   маршрут отвечает отказом молча, файл остаётся;
 * - назвать путь может только тот, у кого есть само изображение: путь это
 *   SHA-256 его содержимого, перебором его не получить;
 * - остаётся возможность удалить чужой **непривязанный** файл — то есть мусор,
 *   ради удаления которого маршрут и существует.
 *
 * Узкое место всё же есть, и его стоит назвать: пока чья-то публикация в пути
 * (файлы загружены, снимок ещё не сохранён), её файлы выглядят непривязанными.
 * Чтобы этим воспользоваться, нужно иметь те же изображения и попасть в окно в
 * несколько секунд. Механизма против этого здесь нет — есть ограничитель частоты
 * и то, что попавший в это окно уже владеет фотографиями.
 *
 * Отправка отсюда не нарушает правила «ничего на сервер вне явного действия»:
 * это часть того самого действия — публикации, которую человек начал сам, — и
 * убирает она её же следы.
 */

import { NextResponse } from 'next/server'
import { deleteUnreferencedBlobs } from '@/lib/server/blobCleanup'
import { checkCleanupRateLimit } from '@/lib/server/rateLimit'
import { isPublicPhotoPath } from '@/lib/sharing/photoPaths'

/** Столько же, сколько проверяет за раз соседний маршрут: фотографий в разумной коллекции. */
const MAX_PATHS = 200

interface DiscardRequest {
  paths?: unknown
}

export async function POST(request: Request): Promise<NextResponse> {
  const rate = await checkCleanupRateLimit(request)
  if (!rate.allowed) {
    return NextResponse.json({ error: 'Too many cleanup requests' }, { status: 429 })
  }

  let body: DiscardRequest
  try {
    body = (await request.json()) as DiscardRequest
  } catch {
    return NextResponse.json({ error: 'Could not parse request body' }, { status: 400 })
  }

  if (!Array.isArray(body.paths)) {
    return NextResponse.json({ error: 'Paths are required' }, { status: 400 })
  }

  if (body.paths.length > MAX_PATHS) {
    return NextResponse.json({ error: 'Too many paths in one request' }, { status: 400 })
  }

  const paths = body.paths.filter((path): path is string => typeof path === 'string')

  // Проверка та же, что при выдаче токена на загрузку: путь обязан быть хешем в
  // нашей папке. Иначе список превратился бы в способ ткнуть в произвольный
  // адрес хранилища.
  if (paths.length !== body.paths.length || paths.some((path) => !isPublicPhotoPath(path))) {
    return NextResponse.json({ error: 'Invalid photo path' }, { status: 400 })
  }

  const deleted = await deleteUnreferencedBlobs(paths, { reason: 'сорванная публикация' })

  return NextResponse.json({ deleted })
}
