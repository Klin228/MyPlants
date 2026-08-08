/**
 * Коллаж карточек для лендинга (тикет J4, переделка визуала).
 *
 * Зачем он вообще. Лендинг без изображения выглядит технической страницей —
 * владелец сказал это прямо, посмотрев на первую версию. У обоих ближайших
 * конкурентов первый экран устроен одинаково: слева крупный заголовок, справа
 * **показан сам продукт**. Leafolio ставит макет телефона со списком растений,
 * collecto.rs — мозаику карточек коллекции на сиреневом градиенте. Второе
 * ближе: у нас нет нативного приложения, зато есть узнаваемая форма — кладка из
 * фотографий в собственных пропорциях (`BRAND.md`: её не надо ретушировать в
 * ровную сетку, она и есть форма продукта).
 *
 * **Фотографии или рисунки — решает наличие файла.**
 *
 * Владелец кладёт свои снимки в `public/landing/` под именами `plant-1.jpg` …
 * `plant-4.jpg`; лежит файл — карточка показывает его, не лежит — остаётся
 * рисунок. Проверка файловой системы на сборке, а не `onError` в браузере:
 * сломанная картинка успела бы мигнуть у каждого посетителя.
 *
 * Рисунки при этом остаются в коде не как заглушка на пять минут, а как рабочий
 * запасной путь: чужие снимки в репозитории — вопрос лицензии, и человек,
 * поднявший приложение себе, получит осмысленный первый экран без единого
 * чужого файла.
 *
 * Компонент серверный: ни строчки клиентского кода. Движение на прокрутке
 * добавляет `LandingParallax` — он ничего не рисует, только двигает уже
 * отрисованное. `aria-hidden` — это украшение, и читалке экрана здесь нечего
 * сказать.
 */

import fs from 'node:fs'
import path from 'node:path'

interface Card {
  key: string
  /** Название и цена — как на настоящей карточке в приложении */
  name: string
  price: string
  /** Пропорция кадра: те же 3:4, 1:1 и 4:3, между которыми зажата рамка (X5) */
  shape: 'tall' | 'square' | 'wide'
  art: JSX.Element
}

/*
 * Композиции построены как кадры, а не как иконки: растение упирается в края
 * рамки и обрезается ею. Иконка в центре пустого прямоугольника читается как
 * значок, обрезанный кадром силуэт — как фотография. Это и есть вся разница
 * между технической страницей и живой.
 */

/** Монстера в горшке: лист с настоящими дырами, а не с прожилками */
const monstera = (
  <svg viewBox="0 0 100 120" className="collage-art" role="presentation" preserveAspectRatio="xMidYMax slice">
    <path className="collage-art-stem" d="M50 118V54" />
    <path className="collage-art-stem" d="M50 76 26 58" />
    <path className="collage-art-stem" d="M50 64l26-18" />
    {/*
      Дыры пробиты маской, а не вырезаны в самом контуре.

      Контур с `fill-rule: evenodd` я сначала и написал — получилось окно с
      крестовиной: у монстеры дыры идут вдоль прожилок овалами, и повторить это
      одной строкой пути можно, только считая координаты руками. Маска делает то
      же самое двумя фигурами и читается.
    */}
    <mask id="monstera-holes">
      <rect x="0" y="0" width="100" height="120" fill="white" />
      <g fill="black">
        <ellipse cx="18" cy="30" rx="7" ry="4" transform="rotate(-20 18 30)" />
        <ellipse cx="34" cy="44" rx="8" ry="4" transform="rotate(-14 34 44)" />
        <ellipse cx="20" cy="48" rx="6" ry="3" transform="rotate(-24 20 48)" />
        <ellipse cx="66" cy="18" rx="7" ry="4" transform="rotate(16 66 18)" />
        <ellipse cx="82" cy="32" rx="8" ry="4" transform="rotate(10 82 32)" />
        <ellipse cx="64" cy="38" rx="6" ry="3" transform="rotate(20 64 38)" />
      </g>
    </mask>

    <g className="collage-art-leaf" mask="url(#monstera-holes)">
      <ellipse cx="26" cy="38" rx="28" ry="26" transform="rotate(-12 26 38)" />
      <ellipse cx="74" cy="26" rx="28" ry="26" transform="rotate(14 74 26)" />
    </g>
    {/* Горшок обрезан нижним краем — так снимают растение на полке */}
    <path className="collage-art-pot" d="M28 96h44l-6 34H34L28 96Z" />
  </svg>
)

/** Алоказия крупным планом: лист выходит за кадр с трёх сторон */
const alocasia = (
  <svg viewBox="0 0 100 100" className="collage-art" role="presentation" preserveAspectRatio="xMidYMid slice">
    <path
      className="collage-art-leaf"
      d="M50-12c30 22 48 52 48 78 0 24-20 42-48 42S2 90 2 66C2 40 20 10 50-12Z"
    />
    <path className="collage-art-vein" d="M50 4v100" />
    <path className="collage-art-vein" d="M50 34 18 52" />
    <path className="collage-art-vein" d="M50 34l32 18" />
    <path className="collage-art-vein" d="M50 62 24 78" />
    <path className="collage-art-vein" d="M50 62l26 16" />
  </svg>
)

/** Хойя: плеть с полки, парные листья вдоль стебля */
const hoya = (
  <svg viewBox="0 0 133 100" className="collage-art" role="presentation" preserveAspectRatio="xMidYMid slice">
    <path className="collage-art-pot" d="M2 6h40l-5 26H7L2 6Z" />
    <path className="collage-art-stem" d="M22 32c4 22 18 30 40 34s48 12 62 28" />
    <g className="collage-art-leaf">
      <ellipse cx="34" cy="48" rx="11" ry="7" transform="rotate(28 34 48)" />
      <ellipse cx="56" cy="60" rx="12" ry="7" transform="rotate(-14 56 60)" />
      <ellipse cx="80" cy="70" rx="12" ry="7" transform="rotate(22 80 70)" />
      <ellipse cx="104" cy="82" rx="11" ry="7" transform="rotate(-10 104 82)" />
      <ellipse cx="66" cy="80" rx="10" ry="6" transform="rotate(34 66 80)" />
    </g>
  </svg>
)

/** Астрофитум: короткий столбик с рёбрами, горшок обрезан краем */
const cactus = (
  <svg viewBox="0 0 100 120" className="collage-art" role="presentation" preserveAspectRatio="xMidYMax slice">
    <g className="collage-art-leaf">
      <rect x="36" y="26" width="28" height="66" rx="14" />
      <path d="M36 52H26a9 9 0 0 0-9 9v10a9 9 0 0 0 18 0V60" />
      <path d="M64 42h11a9 9 0 0 1 9 9v14a9 9 0 0 1-18 0V52" />
    </g>
    <path className="collage-art-vein" d="M50 32v56" />
    <path className="collage-art-vein" d="M42 34v52" />
    <path className="collage-art-vein" d="M58 34v52" />
    <path className="collage-art-pot" d="M26 88h48l-7 34H33l-7-34Z" />
  </svg>
)

/*
 * Четыре карточки, не пять.
 *
 * Пятая была, и из-за неё первый экран получался выше окна: коллаж занимал 1050
 * пикселей при окне 900, а заголовок с кнопками — 411. Замерено. Пятая карточка
 * ничего не добавляла к мысли «это коллекция», зато уводила кнопки за сгиб.
 *
 * Цены выдуманные и намеренно разные по порядку: коллекция, где всё стоит
 * одинаково, выглядит как заглушка. Разброс от $18 до $240 — то, что бывает на
 * настоящей полке.
 */
const CARDS: Card[] = [
  { key: 'a', name: 'Monstera adansonii', price: '$45.00', shape: 'tall', art: monstera },
  { key: 'b', name: 'Alocasia aurea', price: '$240.00', shape: 'square', art: alocasia },
  { key: 'c', name: 'Hoya carnosa', price: '$18.00', shape: 'wide', art: hoya },
  { key: 'd', name: 'Astrophytum', price: '$62.00', shape: 'tall', art: cactus },
]

/**
 * Есть ли снимок для этой карточки.
 *
 * Читается на сервере при сборке страницы — маршрут статический, значит ровно
 * один раз, а не на каждый запрос. Расширения перебираются: люди выкладывают и
 * `.jpg`, и `.jpeg`, и `.webp`, и заставлять владельца переименовывать файл
 * ради нашего удобства незачем.
 */
function photoFor(index: number): string | null {
  const dir = path.join(process.cwd(), 'public', 'landing')

  for (const ext of ['jpg', 'jpeg', 'png', 'webp']) {
    const name = `plant-${index}.${ext}`
    if (fs.existsSync(path.join(dir, name))) return `/landing/${name}`
  }

  return null
}

export default function LandingCollage() {
  return (
    <div className="collage" aria-hidden="true">
      {CARDS.map((card, index) => {
        const photo = photoFor(index + 1)

        return (
        <figure key={card.key} className={`collage-card collage-card--${card.key}`}>
          <div className={`collage-photo collage-photo--${card.shape}`}>
            {photo ? (
              /*
                Размеры не заданы намеренно: пропорцию держит рамка, а сама
                картинка растянута по ней `object-fit: cover`. Первая карточка
                грузится сразу, остальные лениво — она на первом экране, и её
                задержка это задержка первого впечатления.
              */
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photo}
                alt=""
                className="collage-image"
                loading={index === 0 ? 'eager' : 'lazy'}
                decoding="async"
              />
            ) : (
              card.art
            )}
          </div>
          <figcaption className="collage-caption">
            <span className="collage-name">{card.name}</span>
            <span className="collage-price">{card.price}</span>
          </figcaption>
        </figure>
        )
      })}
    </div>
  )
}
