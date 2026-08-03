'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Filter, Plus, Share2 } from 'lucide-react'
import PlantCard from '@/components/PlantCard'
import ShareDialog from '@/components/ShareDialog'
import StorageStatus from '@/components/StorageStatus'
import StorageWarning from '@/components/StorageWarning'
import Toast from '@/components/Toast'
import { plantsRepository } from '@/lib/repositories/plantsRepository'
import { initializeDatabase } from '@/lib/repositories/migration'
import { speciesKey } from '@/lib/species'
import { countSpecies, describeCollection } from '@/lib/collectionSummary'
import type { Plant } from '@/lib/models/plant'

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
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<'name' | 'price' | 'date'>('name')
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [isShareOpen, setIsShareOpen] = useState(false)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const filterRef = useRef<HTMLDivElement>(null)

  // Initialize database and load plants on mount and when page becomes visible
  useEffect(() => {
    const loadPlantsData = async () => {
      try {
        // Initialize database and run migration if needed
        await initializeDatabase()

        // Load plants from repository
        const loadedPlants = await plantsRepository.getAll()
        setPlants(loadedPlants)
      } catch (error) {
        console.error('Error loading plants:', error)
        setPlants([])
      }
    }

    loadPlantsData()

    // Reload plants when the tab comes back to the foreground.
    // Возврат с add/edit сюда не относится: это клиентская навигация, компонент
    // размонтируется и на обратном пути перечитывает данные при монтировании.
    // Только visibilitychange: focus срабатывает на том же возврате на вкладку
    // и давал второе чтение из IndexedDB.
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadPlantsData()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

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

  // Close filter dropdown when clicking outside
  useEffect(() => {
    // Слушаем и мышь, и касание: на телефоне тапом «мимо» дропдаун не
    // закрывался, потому что touchstart не сопровождается mousedown до
    // окончания жеста.
    const handleClickOutside = (event: Event) => {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
        setIsFilterOpen(false)
      }
    }
    if (isFilterOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('touchstart', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
    }
  }, [isFilterOpen])

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
                onClick={() => setIsFilterOpen(!isFilterOpen)}
                className="btn btn--icon-square"
                aria-label="Filter and sort"
              >
                <Filter size={20} color="currentColor" />
              </button>

              {/* Filter Dropdown */}
              {isFilterOpen && (
                <div className="dropdown">
                  <select
                    value={sortBy}
                    onChange={(e) => {
                      setSortBy(e.target.value as 'name' | 'price' | 'date')
                      setIsFilterOpen(false)
                    }}
                    className="select"
                  >
                    <option value="name">Sort by: name (A-Z)</option>
                    <option value="price">Sort by: price (high to low)</option>
                    <option value="date">Sort by: date added (newest first)</option>
                  </select>
                </div>
              )}
            </div>
          </div>

          {/*
            Шапка не реагирует на поиск, а сетка реагирует, и в три колонки
            факт фильтрации с первого взгляда не читается. Поэтому он сказан
            словами — и только при непустом запросе.
          */}
          {query !== '' && sortedPlants.length > 0 && (
            <p className="result-count">
              {sortedPlants.length} of {loaded.length} {loaded.length === 1 ? 'plant' : 'plants'}
            </p>
          )}

          {sortedPlants.length === 0 ? (
            <div className="no-results">
              <p>No plants found matching &quot;{searchQuery}&quot;</p>
            </div>
          ) : (
            <div className="plant-grid">
              {sortedPlants.map((plant) => (
                <PlantCard
                  key={plant.id}
                  plant={plant}
                  onDelete={handleDeletePlant}
                  onEdit={handleEditPlant}
                />
              ))}
            </div>
          )}

          {/*
            Справка о хранилище — только когда коллекция есть. Пустому экрану
            рассказывать про сохранность нечего: терять пока нечего, а первый
            призыв должен быть один.
          */}
          <StorageStatus />
        </>
      )}

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

