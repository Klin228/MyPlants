'use client'

/**
 * Последний рубеж: отрисовка упала там, где этого не предусмотрели.
 *
 * Ожидаемый сбой — недоступная база — перехвачен в самой странице и
 * показывается серверной разметкой. Сюда попадает только неожиданное, то есть
 * по сути ошибка в коде. Толку от границы при этом всё равно немного: Next
 * отрисовывает её на клиенте, и без JavaScript посетитель увидит пустую
 * страницу. Убрать её из-за этого нельзя — с JavaScript она даёт человеку
 * внятный текст и кнопку вместо необработанного сбоя.
 *
 * Текст ошибки не показывается: посетителю он ничего не даст, а в сообщении
 * драйвера базы вполне может оказаться адрес подключения. В журнал сервера
 * ошибка при этом попадает целиком — Next пишет её сам.
 */
export default function CollectionError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="notice">
      <h1 className="notice-title">This collection could not be loaded</h1>
      <p className="notice-text">
        Something went wrong on our side — the collection itself is fine. Try again in a moment.
      </p>
      <div className="notice-action">
        <button type="button" className="btn btn--primary" onClick={reset}>
          Try again
        </button>
      </div>
    </main>
  )
}
