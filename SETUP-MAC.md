> **Внимание: документ исторический.** Написан до тикета A1, когда проект был
> распакованным архивом без `.git`.
>
> Сейчас это обычный репозиторий на ветке `main` с историей, сборка проходит,
> `@ducanh2912/next-pwa` уже установлен. Разделы про инициализацию git, про
> падающую сборку и про замену `next-pwa` выполнять не нужно. Шаг с копированием
> `lib/imageCompression.ts` выполнить невозможно: такого файла никогда не было.
>
> Что из документа осталось полезным: порядок настройки окружения и переменных.
> Актуальный образец — `.env.local.example`. Найдено ревью F3.

# Запуск проекта на маке

## 1. Node

Проверьте, стоит ли он и какой версии:

```bash
node -v
```

Нужна 18 или выше. Если команда не найдена или версия старая — ставьте через nvm, это удобнее, чем установщик с сайта, потому что позволяет держать несколько версий:

```bash
# nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash

# перезапустите терминал, затем
nvm install --lts
nvm use --lts
node -v
```

Альтернатива, если у вас уже есть Homebrew:

```bash
brew install node
```

## 2. Вернуть проект под git

**Это надо сделать до всего остального.** Сейчас у вас распакованный архив, а не репозиторий: папка `MyPlants-main`, внутри нет `.git`, изменения не отслеживаются и запушить их некуда.

Клонируем рядом заново и переносим правки:

```bash
cd ~/Downloads
git clone https://github.com/Klin228/MyPlants.git
```

Затем скопируйте изменённые файлы из `MyPlants-main` в свежий `MyPlants`:

```bash
cd ~/Downloads
cp MyPlants-main/lib/repositories/photosRepository.ts   MyPlants/lib/repositories/
cp MyPlants-main/lib/imageCompression.ts                MyPlants/lib/
cp MyPlants-main/components/PhotoGallery.tsx            MyPlants/components/
cp MyPlants-main/components/FullscreenPhotoViewer.tsx   MyPlants/components/
cp MyPlants-main/components/AddPlantForm.tsx            MyPlants/components/
cp MyPlants-main/REVIEW.md MyPlants-main/TASKS.md MyPlants-main/CLAUDE.md MyPlants-main/SETUP-MAC.md  MyPlants/
```

Проверьте, что git видит изменения:

```bash
cd MyPlants
git status
git diff --stat
```

Дальше работайте в `MyPlants`, а `MyPlants-main` можно удалить.

## 3. Зависимости

```bash
cd ~/Downloads/MyPlants
npm install
```

Первый раз качается долго, дальше быстро.

## 4. Запуск

Для разработки — это то, что нужно в 95% случаев:

```bash
npm run dev
```

Откроется на `http://localhost:3000`. Правки в коде подхватываются сразу без перезапуска.

**Чтобы проверить на телефоне** — а свайпы иначе не проверить, в десктопном браузере они ведут себя по-другому — узнайте локальный адрес мака:

```bash
ipconfig getifaddr en0
```

Получите что-то вроде `192.168.1.42`. Запустите с доступом извне:

```bash
npm run dev -- -H 0.0.0.0
```

И откройте на телефоне `http://192.168.1.42:3000`, будучи в той же вайфай-сети.

## 5. Продакшен-сборка

```bash
npm run build
```

**Она сейчас упадёт, и это не из-за моих правок.** Ошибка:

```
[PWA] Failed to build fallback worker
TypeError: Cannot read properties of undefined (reading 'toString')
    at node_modules/next-pwa/build-fallback-worker.js:138
```

`next-pwa@5.6.0` заброшен с 2022 года и конфликтует с Next 14 App Router, когда в конфиге задан `fallbacks.document`. Два способа починить, оба в тикете A2 из `TASKS.md`:

Быстрый — убрать `fallbacks` из `next.config.js`. Офлайн-страница перестанет показываться, остальное кеширование продолжит работать.

Правильный — перейти на живой форк:

```bash
npm uninstall next-pwa
npm install @ducanh2912/next-pwa
```

И поправить импорт в `next.config.js`.

## 6. Проверка типов

Эта команда проходит чисто и не зависит от сборки:

```bash
npx tsc --noEmit
```

Полезно гонять после каждой правки — быстрее, чем полный билд.

## 7. Claude Code

```bash
curl -fsSL https://claude.ai/install.sh | bash
```

Нужна подписка Pro или Max. Затем:

```bash
cd ~/Downloads/MyPlants
claude
```

`CLAUDE.md` он прочитает сам при старте. Дальше давайте ему тикеты из `TASKS.md` по одному.

## Мелочи, отличающиеся от винды

Пути через `/`, а не `\`. Регистр в именах файлов на маке по умолчанию не учитывается, но на сервере Vercel учитывается — поэтому `import PlantCard from './plantcard'` соберётся локально и упадёт при деплое. Следите за точным регистром в импортах.

`node_modules` в репозиторий не коммитится, он уже в `.gitignore`. Папка `.next` тоже.
