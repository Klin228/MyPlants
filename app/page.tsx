'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Filter, Plus, Share2 } from 'lucide-react'
import CardGrid from '@/components/CardGrid'
import PlantCard from '@/components/PlantCard'
import ShareDialog from '@/components/ShareDialog'
import StorageStatus from '@/components/StorageStatus'
import StorageWarning from '@/components/StorageWarning'
import Toast from '@/components/Toast'
import { plantsRepository } from '@/lib/repositories/plantsRepository'
import { photosRepository, type PhotoSize } from '@/lib/repositories/photosRepository'
import { initializeDatabase } from '@/lib/repositories/migration'
import { frameRatio } from '@/lib/photoRatio'
import { speciesKey } from '@/lib/species'
import { countSpecies, describeCollection } from '@/lib/collectionSummary'
import type { Plant } from '@/lib/models/plant'

/**
 * Подписи сортировок — один список на выпадающий список и на строку состояния.
 *
 * Раньше они были выписаны только в `<option>`, и сказать, какая сортировка
 * выбрана, было нечем: пришлось бы повторить текст рядом (тикет X2).
 */
const SORT_LABELS: Record<SortBy, string> = {
  name: 'name (A-Z)',
  price: 'price (high to low)',
  date: 'date added (newest first)',
}

type SortBy = 'name' | 'price' | 'date'

export default function Home() {
  const router = useRouter()
  /**
   * Три состояния, а не два. `null` — «ещё не читали».
   *
   * Раньше список начинался с пустого массива, и на первом кадре при живой
   * коллекции мигало «Your collection is empty». С переездом суммы в шапку
   * мигало бы уже четыре вещи: сумма, сводка, поиск и кнопка «Поделиться».
   * Скелетоны (тикет D6) займут место внутри уже размеренного бокса, а сама
   * ветка «ещё не читали» нужна здесь и сейчас.
   */
  const [plants, setPlants] = useState<Plant[] | null>(null)
  /**
   * Размеры обложек — по ключу первой фотографии каждого растения (тикет X5).
   *
   * Читаются здесь, а не в карточке: из этих же чисел кладка предсказывает высоту
   * карточки, то есть они нужны родителю раньше, чем ребёнку. Одно чтение на всю
   * коллекцию вместо чтения на карточку.
   */
  const [coverSizes, setCoverSizes] = useState<Record<string, PhotoSize>>({})
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<SortBy>('name')
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [isShareOpen, setIsShareOpen] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const filterRef = useRef<HTMLDivElement>(null)
  /**
   * Кнопка и сам список — чтобы управлять фокусом.
   *
   * Открытие переводит фокус в список: иначе клавиатурой до него надо
   * дотабываться, и «открыл» ничего не даёт. Закрытие по Escape возвращает фокус
   * на кнопку — стандартное поведение раскрывающегося меню, которого здесь не
   * было (тикет X2).
   */
  const filterButtonRef = useRef<HTMLButtonElement>(null)
  const sortSelectRef = useRef<HTMLSelectElement>(null)

  /**
   * Чтение коллекции вынесено из эффекта: его же вызывает восстановление из
   * резервной копии, когда в базе появились новые растения. `useCallback` —
   * чтобы ссылка не менялась и не дёргала эффект на каждую перерисовку.
   */
  const loadPlants = useCallback(async () => {
    try {
      // Initialize database and run migration if needed
      await initializeDatabase()

      // Load plants from repository
      const loadedPlants = await plantsRepository.getAll()
      setPlants(loadedPlants)

      /*
       * Размеры обложек догружаются отдельно и после списка.
       *
       * Не в одном `await` с растениями: у фотографий, сохранённых до версии 3
       * базы, размеров нет и они обмеряются расшифровкой блоба — на сорока
       * растениях это заметное время, и держать из-за него весь экран пустым
       * незачем. До ответа карточки берут пропорцию по умолчанию.
       */
      const covers = loadedPlants
        .map((plant) => plant.photos?.[0])
        .filter((key): key is string => Boolean(key))

      if (covers.length > 0) {
        setCoverSizes(await photosRepository.getSizes(covers))
      }
    } catch (error) {
      console.error('Error loading plants:', error)
      setPlants([])
    }
  }, [])

  // Initialize database and load plants on mount and when page becomes visible
  useEffect(() => {
    loadPlants()

    // Reload plants when the tab comes back to the foreground.
    // Возврат с add/edit сюда не относится: это клиентская навигация, компонент
    // размонтируется и на обратном пути перечитывает данные при монтировании.
    // Только visibilitychange: focus срабатывает на том же возврате на вкладку
    // и давал второе чтение из IndexedDB.
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadPlants()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [loadPlants])

  /**
   * Удалить растение. Возвращает, получилось ли: карточке нужно знать, чтобы
   * при неудаче выйти из состояния «Deleting…» и вернуть кнопки.
   *
   * Об исходе сообщаем тостом, а не `alert`. Именно двухшаговое подтверждение
   * делает молчаливый сбой хуже: человек подтвердил удаление, а карточка
   * осталась на месте — без сообщения это выглядит как поломка.
   */
  const handleDeletePlant = async (plantIdToDelete: string): Promise<boolean> => {
    const name = (plants ?? []).find(plant => plant.id === plantIdToDelete)?.name

    try {
      // Delete plant (repository handles photo deletion automatically)
      await plantsRepository.delete(plantIdToDelete)

      // Update local state
      setPlants((current) => (current ?? []).filter(plant => plant.id !== plantIdToDelete))
      setToastMessage(name ? `${name} deleted` : 'Plant deleted')
      return true
    } catch (error) {
      console.error('Error deleting plant:', error)
      setToastMessage('Could not delete. Try again.')
      return false
    }
  }

  // Handle opening the add plant page
  const handleOpenAddForm = () => {
    router.push('/plant/new')
  }

  // Handle opening the edit plant page
  const handleEditPlant = (plant: Plant) => {
    router.push(`/plant/${plant.id}/edit`)
  }

  // Filter plants by name or species.
  // Вид сравнивается через speciesKey, иначе «Thai Constellation» с
  // типографским апострофом не найдётся по запросу с обычным.
  const loaded = plants ?? []
  const query = speciesKey(searchQuery)
  const filteredPlants = query === ''
    ? loaded
    : loaded.filter(plant =>
        speciesKey(plant.name).includes(query) || speciesKey(plant.species).includes(query)
      )

  // Sort filtered plants
  const sortedPlants = [...filteredPlants].sort((a, b) => {
    switch (sortBy) {
      case 'name':
        return a.name.localeCompare(b.name)
      case 'price':
        return b.price - a.price // High to low
      case 'date':
        // Даты в ISO с одним часовым поясом и фиксированной длиной, поэтому
        // обычного сравнения строк достаточно, разбирать в Date не нужно.
        return (b.createdAt ?? '').localeCompare(a.createdAt ?? '') // Newest first
      default:
        return 0
    }
  })

  /**
   * Стоимость и сводка описывают ВСЮ коллекцию и на поиск не реагируют.
   *
   * Так было и раньше для суммы, и сводка обязана быть с ней согласована:
   * «2 plants · 1 species» над суммой за все сорок одно — ложное показание в
   * главном числе продукта, читатель отнесёт деньги к двум растениям. Отклик
   * на поиск даёт отдельная строка под тулбаром.
   */
  const totalPrice = loaded.reduce((sum, plant) => sum + plant.price, 0)
  const summary = describeCollection(loaded.length, countSpecies(loaded))

  /**
   * Закрыть список и вернуть фокус на кнопку.
   *
   * Только для тех случаев, когда человек сам закончил с меню: Escape и выбор
   * сортировки. При нажатии **мимо** фокус возвращать нельзя — он выдернулся бы
   * из того, куда человек только что нажал.
   */
  const closeFilter = useCallback(() => {
    setIsFilterOpen(false)
    filterButtonRef.current?.focus()
  }, [])

  // Close filter dropdown when clicking outside
  useEffect(() => {
    if (!isFilterOpen) return

    // Слушаем и мышь, и касание: на телефоне тапом «мимо» дропдаун не
    // закрывался, потому что touchstart не сопровождается mousedown до
    // окончания жеста.
    const handleClickOutside = (event: Event) => {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
        // Без возврата фокуса — см. `closeFilter`
        setIsFilterOpen(false)
      }
    }

    /*
     * Escape закрывает список — этого не было вовсе, и выйти из него с
     * клавиатуры было нечем (тикет X2).
     *
     * Слушатель на документе, а не на контейнере: правило `CLAUDE.md` про
     * глобальные слушатели говорит о компонентах, которые рендерятся списком, —
     * там двадцать карточек дают двадцать слушателей. Здесь экран один, слушатель
     * живёт только пока список открыт, и цель как раз в том, чтобы Escape
     * работал независимо от того, где сейчас фокус.
     */
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeFilter()
    }

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('touchstart', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)

    // Фокус — в список: открыть меню и не дать до него дойти с клавиатуры
    // значило бы открыть его только для мыши
    sortSelectRef.current?.focus()

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isFilterOpen, closeFilter])

  const hasPlants = loaded.length > 0

  return (
    <main className="page">
      {/*
        Предупреждение о хранилище стоит первым и выше шапки намеренно: узнать,
        что данные здесь не сохранятся, надо до того, как их начали вводить, а
        не после. Само оно решает, показываться ли вообще.
      */}
      <StorageWarning />

      {/*
        Шапка повторяет витрину: заголовок, сводка, стоимость. Прокручивается
        вместе с содержимым, а не прилипает: на телефоне липкая шапка навсегда
        съела бы около 150 пикселей у того, ради чего экран существует, — у
        фотографий, — а сумма нужна на взгляд, не постоянно. Возврат после
        добавления растения прокручивает страницу в начало, то есть в момент,
        когда сумма и интересна, шапка на экране гарантированно.
      */}
      <div className="page-head">
        <div className="page-header">
          <h1 className="page-title">MyPlants</h1>
          {hasPlants && (
            <button
              onClick={() => setIsShareOpen(true)}
              className="btn btn--icon-square"
              aria-label="Share collection"
            >
              <Share2 size={20} color="currentColor" />
            </button>
          )}
        </div>

        {/*
          При пустой коллекции — только заголовок. Прежний «Total: $0.00»
          читался не как «пусто», а как «приложение потеряло данные». Условие по
          числу растений, а не по сумме: коллекция с незаполненными ценами даёт
          законный ноль, и его показывать надо.
        */}
        {hasPlants && (
          <>
            <p className="page-summary">{summary}</p>
            <p className="page-total">${totalPrice.toFixed(2)}</p>
          </>
        )}
      </div>

      {plants === null ? (
        // Ещё не читали из базы. Пустое состояние здесь показывать нельзя: при
        // живой коллекции оно мигнёт и исчезнет.
        null
      ) : !hasPlants ? (
        <div className="empty-state">
          <p className="empty-state-title">Your collection is empty</p>
          <p className="empty-state-hint">Tap the button below to add your first plant!</p>
        </div>
      ) : (
        <>
          {/* Search + Filter Row */}
          <div className="toolbar">
            {/* Search Input with Icon */}
            <div className="search">
              <Search size={20} className="search-icon" color="currentColor" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by name or species…"
                className="search-input"
              />
            </div>

            {/* Filter Button */}
            <div style={{ position: 'relative' }} ref={filterRef}>
              <button
                ref={filterButtonRef}
                onClick={() => setIsFilterOpen(!isFilterOpen)}
                className="btn btn--icon-square"
                /*
                  Подпись называет текущую сортировку: читалка экрана иначе
                  сообщает «фильтр и сортировка» и ни слова о том, что выбрано.
                  Видимая строка под тулбаром говорит то же зрячему.
                */
                aria-label={`Filter and sort: ${SORT_LABELS[sortBy]}`}
                aria-haspopup="true"
                aria-expanded={isFilterOpen}
              >
                <Filter size={20} color="currentColor" />
              </button>

              {/* Filter Dropdown */}
              {isFilterOpen && (
                <div className="dropdown">
                  <select
                    ref={sortSelectRef}
                    value={sortBy}
                    onChange={(e) => {
                      setSortBy(e.target.value as SortBy)
                      // Выбор сделан — закрываем и возвращаем фокус на кнопку
                      closeFilter()
                    }}
                    className="select"
                    aria-label="Sort by"
                  >
                    {(Object.keys(SORT_LABELS) as SortBy[]).map((value) => (
                      <option key={value} value={value}>
                        Sort by: {SORT_LABELS[value]}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/*
            Строка состояния под тулбаром: что нашлось и как отсортировано.
            
            Шапка не реагирует на поиск, а сетка реагирует, и в три колонки факт
            фильтрации с первого взгляда не читается — поэтому он сказан словами.
            Сортировка сказана здесь же и всегда: иконка на кнопке одинаковая при
            любой, и после закрытия списка выбранное было не видно вовсе (X2).
            Две строки вместо одной множили бы шум, поэтому через разделитель.
          */}
          {sortedPlants.length > 0 && (
            <p className="result-count">
              {query !== '' && (
                <>
                  {sortedPlants.length} of {loaded.length} {loaded.length === 1 ? 'plant' : 'plants'}
                  {' · '}
                </>
              )}
              Sorted by {SORT_LABELS[sortBy]}
            </p>
          )}

          {sortedPlants.length === 0 ? (
            <div className="no-results">
              <p>No plants found matching &quot;{searchQuery}&quot;</p>
            </div>
          ) : (
            <CardGrid
              items={sortedPlants.map((plant) => {
                const cover = plant.photos?.[0]
                const ratio = frameRatio(cover ? coverSizes[cover] : null)

                return {
                  key: plant.id,
                  ratio,
                  node: (
                    <PlantCard
                      plant={plant}
                      onDelete={handleDeletePlant}
                      onEdit={handleEditPlant}
                      ratio={ratio}
                    />
                  ),
                }
              })}
            />
          )}

        </>
      )}

      {/*
        Справка о хранилище показывается и при ПУСТОЙ коллекции — намеренно, и
        сначала было наоборот.
        Независимое ревью (F3) поймало: блок стоял внутри ветки «есть растения»,
        то есть кнопки «Restore from file» и «Restore from a link» пропадали
        ровно в том случае, для которого они и написаны — человек потерял
        коллекцию и открыл пустое приложение. Резервная копия у него есть, а
        вставить её некуда, пока не заведёт растение руками.
        Условие теперь одно: список прочитан из базы. Пока читаем — не мигаем.
      */}
      {plants !== null && <StorageStatus onRestored={loadPlants} />}

      {/*
        Слой сквозной для касаний, кнопка — нет. Прежняя прозрачная панель во
        всю ширину окна перехватывала тапы по карточкам, проезжающим под ней.
      */}
      <div className="fab-layer">
        <button onClick={handleOpenAddForm} className="btn btn--add" aria-label="Add plant">
          <Plus size={22} />
          Add plant
        </button>
      </div>

      {isShareOpen && <ShareDialog plants={loaded} onClose={() => setIsShareOpen(false)} />}

      {toastMessage && (
        <Toast message={toastMessage} onClose={() => setToastMessage(null)} />
      )}
    </main>
  )
}

