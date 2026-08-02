-- Опубликованные коллекции.
--
-- Идемпотентна: можно прогонять повторно. Мигратора в проекте нет, файлы
-- применяются по порядку номеров скриптом scripts/migrate.mjs.
--
-- Соответствие типам в lib/sharing/types.ts. Расхождение между этим файлом и
-- теми типами — ошибка; таблицы описывают то же, что уезжает в снимке.

create table if not exists collections (
  -- Публичный идентификатор из адреса /c/<id>. Он же секрет: ссылку знает
  -- только тот, кому её дали, поэтому id должен быть неугадываемым.
  id              text primary key,

  snapshot_version integer not null,
  title           text,

  -- Сумма по опубликованным растениям. null когда цены не публиковали —
  -- это разные вещи: «не показывал» и «показывал, но нулевую».
  total_price     numeric(12, 2),

  -- Хеш токена отзыва, не сам токен. Токен живёт на устройстве владельца;
  -- аккаунтов нет, и это единственное доказательство права удалить публикацию.
  revoke_token_hash text not null,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- Отзыв (тикет C7) не удаляет строку, а помечает её: так /c/<id> отдаёт 404
  -- осознанно, а не потому что «ничего не нашлось», и повторная публикация с
  -- тем же id не воскресит отозванное молча.
  revoked_at      timestamptz
);

create table if not exists collection_plants (
  id              bigserial primary key,
  collection_id   text not null references collections(id) on delete cascade,

  -- Порядок в коллекции, как его видел владелец
  position        integer not null,

  name            text not null,

  -- Вид как его написал пользователь, и нормализованный ключ для
  -- сопоставления коллекций между собой. Ключ считает сервер функцией
  -- speciesKey из lib/species.ts — присылать его с клиента значит доверять
  -- клиенту нормализацию, по которой потом ищут совпадения.
  species         text,
  species_key     text,

  -- Необязательные поля снимка. Отсутствуют, если владелец не разрешил их
  -- публиковать соответствующим флагом.
  price           numeric(12, 2),
  acquired_on     date,
  source          text,
  notes           text,

  -- Фотографии: массив объектов {path, width, height} в порядке показа.
  -- Отдельной таблицей их делать нечего — они всегда читаются вместе с
  -- растением и никогда не ищутся сами по себе.
  photos          jsonb not null default '[]'::jsonb,

  unique (collection_id, position)
);

-- Главный запрос публичной страницы: все растения одной коллекции по порядку
create index if not exists collection_plants_by_collection
  on collection_plants (collection_id, position);

-- То, ради чего вообще взята база: «у кого ещё есть такое». Частичный индекс —
-- у растений без указанного вида ключа нет, и в индексе им делать нечего.
create index if not exists collection_plants_by_species
  on collection_plants (species_key)
  where species_key is not null;
