/**
 * Адрес не совпал ни с одним маршрутом.
 *
 * Нужен в первую очередь ради `/c` без идентификатора: получателю ссылки
 * свойственно обрезать её до корня раздела, и встроенный 404 у Next оставляет
 * ему белый экран — весь его текст лежит в скрипте гидратации.
 *
 * У публичной коллекции есть свой, более уместный по словам: `app/c/[id]`.
 */
export default function NotFound() {
  return (
    <main className="notice">
      <h1 className="notice-title">Nothing at this address</h1>
      <p className="notice-text">
        The page you asked for does not exist. If you followed a shared collection link, check that
        it was copied whole.
      </p>
      <p className="notice-action">
        <a href="/">Go to MyPlants</a>
      </p>
    </main>
  )
}
