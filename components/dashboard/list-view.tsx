"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type Modifier,
} from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import type { Candidate } from "./candidate-card"
import { CandidateAvatar } from "./candidate-avatar"
import type { CardDisplaySettings } from "./card-settings"
import { useColumnOrder } from "./use-column-order"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type { CandidateAction } from "@/lib/column-config"
import { applySortMode, type CandidateSortMode } from "@/lib/candidate-sort"
import { yearsRu } from "@/lib/plural-ru"
import { MapPin, CheckCircle2, XCircle, ArrowRight, ThumbsUp, Clock, ListFilter, ArrowUp, ArrowDown, Star, CalendarClock, CalendarPlus, MessageSquare, RotateCcw } from "lucide-react"
import { DemoProgressBar, calcDemoPercent, calcDemoFraction } from "@/components/hr/demo-progress-bar"
import { getStageLabel, getStageColorClasses } from "@/lib/stages"

// «2-я часть демо» (Путь менеджера): кандидатам с override_content_block_id
// отправлена вторая часть контента (анкета/демо), а НЕ тест-задание. Стадия у
// них — test_task_sent, но платформенный ярлык «Тест отправлен» вводит в
// заблуждение. Показываем контекстный ярлык. Ровно эта строка (не хардкод в
// глубине рендера).
const SECOND_PART_LABEL = "2-я часть"

/** Контекстный ярлык статуса. Если кандидату отправлена 2-я часть
 *  (overrideContentBlockId != null) И стадия = test_task_sent — «2-я часть»
 *  вместо «Тест отправлен». Иначе — стандартный getStageLabel. */
function resolveStatusLabel(
  candidate: Candidate,
  pipeline?: import("@/lib/stages").VacancyPipelineV2 | null,
): string {
  if (candidate.stage === "test_task_sent" && candidate.overrideContentBlockId) {
    return SECOND_PART_LABEL
  }
  return getStageLabel(candidate.stage, pipeline ?? undefined)
}

export type ListSortKey = "favorite" | "name" | "aiScore" | "answersScore" | "resumeScore" | "portraitScore" | "testScore" | "progress" | "salary" | "responseDate" | "status" | "city" | "source" | "nextInterview"
export type ListSortDir = "asc" | "desc"
export interface ListSortState {
  key: ListSortKey
  dir: ListSortDir
}

interface Column {
  id: string
  title: string
  colorFrom: string
  colorTo: string
  candidates: Candidate[]
}

interface ListViewProps {
  columns: Column[]
  settings: CardDisplaySettings
  onOpenProfile?: (candidate: Candidate, columnId: string, initialTab?: string) => void
  onAction?: (candidateId: string, columnId: string, action: CandidateAction) => void
  /** Клик по названию вакансии в строке → переход в эту вакансию. */
  onVacancyClick?: (vacancyId: string) => void
  /** Если задан — в колонке «Действия» появляется кнопка «Запланировать интервью». */
  onScheduleInterview?: (candidate: Candidate & { vacancyId?: string | null }) => void
  /** Режим «Рассылка через hh»: в каждой строке появляется иконка чата для
   *  одиночной полу-ручной рассылки (актуально для архивных hh-вакансий). */
  hhBroadcastMode?: boolean
  /** Колбэк одиночной рассылки через hh по конкретному кандидату. */
  onBroadcast?: (candidateId: string) => void
  onToggleFavorite?: (candidateId: string, isFavorite: boolean) => void
  sortMode?: CandidateSortMode
  /** Если задан — сортировка по колонке управляется снаружи (URL/сервер). */
  sort?: ListSortState | null
  onSortChange?: (next: ListSortState | null) => void
  /** Множественное выделение для bulk-операций. Если не задано — колонка чекбоксов скрыта. */
  selectedIds?: Set<string>
  onSelectionChange?: (next: Set<string>) => void
  /** @deprecated Колонка № удалена. Поле сохранено для совместимости интерфейса с callers. */
  startIndex?: number
  /** Если true — показывает дополнительную колонку «Вакансия» (для глобального списка). */
  showVacancyColumn?: boolean
  /** В paginated-режиме сервер уже отсортировал — повторно сортировать не нужно.
   *  Иначе локальный сорт по `sort.key=favorite` перетасовывает строки сразу
   *  после optimistic-апдейта isFavorite, и кандидат «пропадает» из текущей
   *  позиции (на самом деле — едет в favorites-группу). */
  serverSorted?: boolean
  /** Стадии воронки v2 текущей вакансии. Если кандидат имеет funnelV2StateJson.stageId
   *  и совпадение найдено — используется title стадии вместо платформенного лейбла. */
  funnelV2Stages?: { id: string; title?: string | null }[]
  /** Pipeline текущей вакансии (кастомные лейблы legacy-стадий через parsePipeline). */
  vacancyPipeline?: import("@/lib/stages").VacancyPipelineV2 | null
}

// Тип строки-кандидата после обогащения columnId/columnTitle/цветами.
type RowCandidate = Candidate & {
  columnId: string
  columnTitle: string
  colorFrom: string
  colorTo: string
}

// Дескриптор перетаскиваемой колонки данных. Закреплённые колонки
// (чекбокс/звезда/имя слева и «Действия» справа) дескрипторами НЕ являются —
// они рендерятся напрямую и не двигаются.
interface ColumnDescriptor {
  id: string
  /** Ширина для gridTemplateColumns (px или minmax(...)). */
  gridWidth: string
  /** Содержимое ячейки заголовка (обычно SortHeader). */
  header: React.ReactNode
  /** Рендер ячейки тела для конкретного кандидата. */
  renderCell: (c: RowCandidate, ctx: RenderCtx) => React.ReactNode
}

// Контекст, нужный ячейкам тела (вычисляется один раз на строку).
interface RenderCtx {
  demoFraction: { current: number; total: number; hasData: boolean }
  dt: { short: string; full: string } | null
  aiActuallyRan: boolean
}

// 3-state цикл сортировки: DEFAULT_DIR → reverse → null.
// Для числовых/дат-колонок DEFAULT_DIR=desc (юзер ждёт «большое сверху»),
// для текстовых — asc (алфавитный порядок естественен сверху→вниз).
const DEFAULT_DIR: Record<ListSortKey, ListSortDir> = {
  favorite:     "desc",
  name:         "asc",
  aiScore:      "desc",
  answersScore: "desc",
  resumeScore:  "desc",
  portraitScore: "desc",
  testScore:    "desc",
  progress:     "desc",
  salary:       "desc",
  responseDate: "desc",
  status:       "asc",
  city:         "asc",
  source:       "asc",
  nextInterview:"asc",
}

/** Возвращает 0..100 либо null (не приступал).
 *  Приоритет: API-поле progressPercent (page-based, корректно для всех данных).
 *  Fallback на calcDemoPercent — для legacy-записей без API-полей. */
function progressPercentOf(c: Candidate): number | null {
  const apiPct = (c as { progressPercent?: number | null }).progressPercent
  if (typeof apiPct === "number") return apiPct
  return calcDemoPercent(c.demoProgressJson).percent
}

// Символы валют hh.ru: RUR/RUB → ₽, EUR → €, USD → $, остальное → код.
function currencySymbol(code: string | null | undefined): string {
  if (!code) return "₽"
  const c = code.toUpperCase()
  if (c === "RUR" || c === "RUB") return "₽"
  if (c === "EUR") return "€"
  if (c === "USD") return "$"
  if (c === "GBP") return "£"
  return c
}

function formatResponseDate(d: Date | string | null | undefined): { short: string; full: string } | null {
  if (!d) return null
  const date = typeof d === "string" ? new Date(d) : d
  if (Number.isNaN(date.getTime())) return null
  const dd = String(date.getDate()).padStart(2, "0")
  const mm = String(date.getMonth() + 1).padStart(2, "0")
  const yy = String(date.getFullYear()).slice(-2)
  const short = `${dd}.${mm}.${yy}`
  const full = date.toLocaleString("ru-RU", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })
  return { short, full }
}

const STAGE_ORDER: Record<string, number> = {
  new: 0, demo: 1, scheduled: 2, interview: 3, interviewed: 3, decision: 4, offer: 5, final_decision: 6, hired: 7, talent_pool: 8, rejected: 9,
}

// Перетаскивание колонок — только по горизонтали (вертикальный сдвиг гасим).
const restrictToHorizontalAxis: Modifier = ({ transform }) => ({ ...transform, y: 0 })

// ─── Ресайз колонок перетаскиванием (Юрий 05.07) ───────────────────────────
// Извлекает «оптимальную» (дефолтную) ширину колонки в px из строки gridWidth
// ("76px" → 76, "minmax(84px, 130px)" → 84 — минимум-он-же-оптимум для колонок
// с диапазоном). Это одновременно и дефолтная ширина, и min-граница ресайза
// (нельзя сузить меньше — контент уже подобран впритык, см. комментарии у
// каждой колонки выше). Колонка без числового префикса (fr-эластичные) сюда
// не должна попадать — единственная такая, "Кандидат", ресайзу не подлежит
// (закреплённая колонка, не входит в movableColumns/ColumnDescriptor).
function naturalWidthPx(gridWidth: string): number {
  const m = gridWidth.match(/(\d+)px/)
  return m ? parseInt(m[1], 10) : 80
}

// Экспортируются — «Сбросить ширины колонок» живёт в попапе «Вид»
// (view-settings.tsx), отдельное поддерево компонентов, не ребёнок ListView.
// Вместо прокидывания колбэка через несколько уровней страниц (нарушило бы
// зону задачи — 4 файла) переиспользуем localStorage-ключ как общий канал:
// view-settings.tsx чистит ключ и шлёт CustomEvent, useColumnWidths здесь его
// слушает и сбрасывает свой стейт. window.dispatchEvent — тот же document,
// поэтому нативный "storage" event (кросс-вкладочный) не долетел бы сам.
export const COLUMN_WIDTHS_STORAGE_KEY = "candidate-list-column-widths-v1"
export const COLUMN_WIDTHS_RESET_EVENT = "candidate-list-column-widths-reset"

function readStoredWidths(): Record<string, number> | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(COLUMN_WIDTHS_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const out: Record<string, number> = {}
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof v === "number" && Number.isFinite(v) && v > 0) out[k] = v
      }
      return out
    }
    return null
  } catch {
    return null
  }
}

/** Персистентные per-user ширины колонок (localStorage, тот же механизм, что
 *  useColumnOrder — порядок колонок). Хранит только ЯВНО изменённые
 *  пользователем колонки; остальные берут natural-ширину из дескриптора. */
function useColumnWidths(): {
  widths: Record<string, number>
  setWidth: (id: string, px: number) => void
  resetWidth: (id: string) => void
  resetAll: () => void
} {
  const [widths, setWidths] = useState<Record<string, number>>({})

  useEffect(() => {
    const stored = readStoredWidths()
    if (stored) setWidths(stored)
    const onReset = () => setWidths({})
    window.addEventListener(COLUMN_WIDTHS_RESET_EVENT, onReset)
    return () => window.removeEventListener(COLUMN_WIDTHS_RESET_EVENT, onReset)
  }, [])

  const persist = useCallback((next: Record<string, number>) => {
    setWidths(next)
    try {
      window.localStorage.setItem(COLUMN_WIDTHS_STORAGE_KEY, JSON.stringify(next))
    } catch {
      /* localStorage недоступен (private mode) — ширины живут только в стейте */
    }
  }, [])

  const setWidth = useCallback((id: string, px: number) => {
    setWidths((prev) => {
      const next = { ...prev, [id]: px }
      try { window.localStorage.setItem(COLUMN_WIDTHS_STORAGE_KEY, JSON.stringify(next)) } catch { /* no-op */ }
      return next
    })
  }, [])

  const resetWidth = useCallback((id: string) => {
    setWidths((prev) => {
      if (!(id in prev)) return prev
      const next = { ...prev }
      delete next[id]
      try { window.localStorage.setItem(COLUMN_WIDTHS_STORAGE_KEY, JSON.stringify(next)) } catch { /* no-op */ }
      return next
    })
  }, [])

  const resetAll = useCallback(() => {
    persist({})
  }, [persist])

  return { widths, setWidth, resetWidth, resetAll }
}

// Ручка ресайза — узкая полоса на правой границе ячейки заголовка. Отдельный
// mousedown-обработчик (НЕ dnd-kit — тот двигает порядок колонок, это про
// ширину). stopPropagation — чтобы drag колонок (SortableHeaderCell) не
// перехватывал жест ресайза ручки.
function ColumnResizeHandle({
  onDragStart, onResize, onReset,
}: {
  /** Вызывается ровно один раз в момент mousedown (до первого move) —
   *  фиксирует стартовую ширину колонки, от которой считается дельта. */
  onDragStart: () => void
  /** Дельта в px от точки начала драга. */
  onResize: (deltaPx: number) => void
  /** Двойной клик — сброс к оптимуму. */
  onReset: () => void
}) {
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    onDragStart()
    const startX = e.clientX
    const onMove = (ev: MouseEvent) => onResize(ev.clientX - startX)
    const onUp = () => {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
    }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
  }
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      onMouseDown={handleMouseDown}
      onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); onReset() }}
      onClick={(e) => e.stopPropagation()}
      title="Потяните, чтобы изменить ширину колонки (двойной клик — сброс)"
      className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-primary/40 active:bg-primary/60 z-10 touch-none"
    />
  )
}

function SortHeader({
  label, sortKey, sort, onToggle, align = "left", title,
}: {
  label: string
  sortKey: ListSortKey
  sort: ListSortState | null
  onToggle: (key: ListSortKey) => void
  align?: "left" | "center" | "right"
  /** Тултип с расшифровкой заголовка (что за балл/колонка и откуда берётся).
   *  Нужен, когда label — сокращение (ширина колонки фиксирована под бейдж). */
  title?: string
}) {
  const active = sort?.key === sortKey
  const dir = active ? sort!.dir : null
  const ariaSort = !active ? "none" : dir === "asc" ? "ascending" : "descending"
  return (
    <button
      type="button"
      onClick={() => onToggle(sortKey)}
      aria-sort={ariaSort}
      title={title}
      className={cn(
        // Эталон иконок сортировки портала — как в DataHeadCell (ListFilter
        // перед заголовком, opacity-40 неактивна). ListFilter по умолчанию
        // сужается вниз (широкое сверху = «большое сверху» = убывание), поэтому
        // флип scale-y вешаем на ASC (возрастание), desc — дефолтная ориентация.
        "items-center gap-1.5 select-none whitespace-nowrap transition-colors",
        // Центрирование заголовка В ЯЧЕЙКЕ: inline-flex ужимает кнопку до контента
        // (лепится влево), поэтому для center делаем flex w-full + justify-center.
        align === "center" ? "flex w-full justify-center"
          : align === "right" ? "inline-flex flex-row-reverse"
          : "inline-flex",
        dir ? "text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <ListFilter className={cn("size-3.5 transition-transform", dir === "asc" && "scale-y-[-1]", !dir && "opacity-40")} />
      {label}
    </button>
  )
}

// Перетаскиваемая ячейка заголовка движимой колонки. Drag — за всю ячейку
// (cursor-grab), но внутри неё кнопка сортировки SortHeader продолжает работать
// по клику (PointerSensor с distance:5 не начинает drag на простом клике).
// Ручка ресайза (справа) — независимый mousedown, stopPropagation не даёт ему
// уйти в dnd-kit (иначе жест ресайза запускал бы ещё и drag порядка).
function SortableHeaderCell({
  id, children, onResizeStart, onResizeDelta, onResizeReset,
}: {
  id: string
  children: React.ReactNode
  /** Три коллбэка заданы вместе — рисуем ручку ресайза на правой границе ячейки. */
  onResizeStart?: () => void
  onResizeDelta?: (deltaPx: number) => void
  onResizeReset?: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 20 : undefined,
  }
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn("relative flex items-center min-w-0 overflow-hidden cursor-grab active:cursor-grabbing touch-none", isDragging && "rounded-md ring-1 ring-primary/40 bg-card")}
      {...attributes}
      {...listeners}
      title="Перетащите, чтобы изменить порядок колонок"
    >
      {children}
      {onResizeStart && onResizeDelta && onResizeReset && (
        <ColumnResizeHandle onDragStart={onResizeStart} onResize={onResizeDelta} onReset={onResizeReset} />
      )}
    </div>
  )
}

export function ListView({
  columns, settings, onOpenProfile, onAction, onToggleFavorite, onVacancyClick, onScheduleInterview,
  hhBroadcastMode = false, onBroadcast,
  sortMode = "date_desc", sort = null, onSortChange,
  selectedIds, onSelectionChange,
  serverSorted = false,
  showVacancyColumn = false,
  funnelV2Stages,
  vacancyPipeline,
}: ListViewProps) {
  const lastSelectedIdRef = useRef<string | null>(null)
  const selectionEnabled = !!selectedIds && !!onSelectionChange
  const showProgress     = settings.showProgress !== false
  const showResponseDate = settings.showResponseDate !== false
  const showCity         = settings.showCity
  const showScore        = settings.showScore          // AI-оцен. (оценка анкеты)
  const showResumeScore  = settings.showResumeScore !== false  // «Портрет» — оценка резюме по Портрету вакансии (undefined = вкл)
  const showAnswersScore = settings.showAnswersScore !== false   // «Анкета» — AI-балл ответов анкеты (undefined = вкл)
  const showTestScore    = settings.showTestScore !== false    // Тест (балл/статус; по умолчанию вкл)
  const showNextInterview = settings.showNextInterview !== false // Интервью (ближайшее; по умолчанию вкл)
  const showSalary       = settings.showSalary || settings.showSalaryFull
  const showSource       = settings.showSource
  const showActions      = settings.showActions

  const rawCandidates = useMemo<RowCandidate[]>(() => columns.flatMap((col) =>
    col.candidates.map((c) => ({ ...c, columnId: col.id, columnTitle: col.title, colorFrom: col.colorFrom, colorTo: col.colorTo }))
  ), [columns])

  const allCandidates = useMemo(() => {
    // В paginated-режиме сервер уже отсортировал → не пересортировываем.
    // Иначе локальная сортировка по favorite перетасует список сразу после
    // optimistic-апдейта isFavorite, и кандидат «уезжает» из своей позиции.
    if (serverSorted) return rawCandidates
    if (!sort) return applySortMode(rawCandidates, sortMode) as typeof rawCandidates
    const arr = [...rawCandidates]
    const mul = sort.dir === "asc" ? 1 : -1
    arr.sort((a, b) => {
      switch (sort.key) {
        case "favorite": {
          return mul * ((a.isFavorite ? 1 : 0) - (b.isFavorite ? 1 : 0))
        }
        case "name": {
          const na = (a.name ?? "").trim()
          const nb = (b.name ?? "").trim()
          if (!na && !nb) return 0
          if (!na) return 1
          if (!nb) return -1
          return mul * na.localeCompare(nb, "ru")
        }
        case "aiScore": {
          return mul * ((a.aiScore ?? -1) - (b.aiScore ?? -1))
        }
        case "answersScore": {
          return mul * ((a.demoAnswersScore ?? -1) - (b.demoAnswersScore ?? -1))
        }
        case "resumeScore": {
          return mul * ((a.resumeScore ?? -1) - (b.resumeScore ?? -1))
        }
        case "portraitScore": {
          return mul * ((a.aiScoreV2 ?? -1) - (b.aiScoreV2 ?? -1))
        }
        case "testScore": {
          // Ранг тест-активности: сдан с баллом (по баллу) → сдан → заполняет →
          // открыл → отправлен → ошибка → ничего. Чтобы «отп./пер.» шли наверх.
          const testRank = (c: Candidate) =>
            c.testScore != null ? 1000 + c.testScore
            : c.testStatus === "submitted" ? 900
            : c.testStatus === "in_progress" ? 800
            : c.testStatus === "opened" ? 700
            : c.testStatus === "sent" ? 500
            : -1
          return mul * (testRank(a) - testRank(b))
        }
        case "progress": {
          return mul * ((progressPercentOf(a) ?? -1) - (progressPercentOf(b) ?? -1))
        }
        case "salary": {
          const sa = a.salaryMax || a.salaryMin || 0
          const sb = b.salaryMax || b.salaryMin || 0
          return mul * (sa - sb)
        }
        case "responseDate": {
          const eff = (c: typeof a) => {
            const last = (c as { lastRespondedAt?: string | Date | null }).lastRespondedAt
            const d = last ?? c.createdAt ?? (c.addedAt as Date | undefined)
            return d ? new Date(d as string | Date).getTime() : 0
          }
          return mul * (eff(a) - eff(b))
        }
        case "status": {
          return mul * ((STAGE_ORDER[a.columnId] ?? 99) - (STAGE_ORDER[b.columnId] ?? 99))
        }
        case "city": {
          // null/пустые в конец независимо от направления — иначе они доминируют
          // и активная сортировка перестаёт давать различимый результат.
          const ca = (a.city ?? "").trim()
          const cb = (b.city ?? "").trim()
          if (!ca && !cb) return 0
          if (!ca) return 1
          if (!cb) return -1
          return mul * ca.localeCompare(cb, "ru")
        }
        case "source": {
          const sa = (a.source ?? "").trim()
          const sb = (b.source ?? "").trim()
          if (!sa && !sb) return 0
          if (!sa) return 1
          if (!sb) return -1
          return mul * sa.localeCompare(sb, "ru")
        }
        case "nextInterview": {
          // Без интервью — в конец независимо от направления.
          const ta = a.nextInterviewAt ? new Date(a.nextInterviewAt).getTime() : null
          const tb = b.nextInterviewAt ? new Date(b.nextInterviewAt).getTime() : null
          if (ta == null && tb == null) return 0
          if (ta == null) return 1
          if (tb == null) return -1
          return mul * (ta - tb)
        }
      }
      return 0
    })
    return arr
  }, [rawCandidates, sort, sortMode, serverSorted])

  const handleSort = (key: ListSortKey) => {
    if (!onSortChange) return
    // 3-state цикл: DEFAULT_DIR → reverse → null (сброс).
    // Раньше первый клик всегда давал ASC — для AI-score/salary/date это
    // выглядело как «сортировка не работает» (юзер кликнул по «AI-оцен.»
    // и ждал лучших сверху, а получил худших).
    const def = DEFAULT_DIR[key]
    const rev: ListSortDir = def === "asc" ? "desc" : "asc"
    if (!sort || sort.key !== key) {
      onSortChange({ key, dir: def })
    } else if (sort.dir === def) {
      onSortChange({ key, dir: rev })
    } else {
      onSortChange(null)
    }
  }

  const getScoreColor = (score: number) => {
    if (score > 70) return "bg-success/10 text-success border-success/20"
    // Warning-вариант (40-70) бледнее success/destructive в обеих темах —
    // токен --warning сам по себе светлее (oklch lightness ~0.7 против ~0.6 у
    // success), поэтому та же /10-/20 формула давала слабый контраст (жалоба
    // Юрия 05.07). Плотнее фон/рамка + font-bold — БЕЗ правки токена/globals.css.
    if (score >= 40) return "bg-warning/20 text-warning border-warning/40 font-bold"
    return "bg-destructive/10 text-destructive border-destructive/20"
  }

  // Балл интервью (скоркарта) — шкала 1-10, НЕ 0-100 как у остальных колонок.
  // Та же семантика цветов, что и getScoreColor (усиленный warning — см. выше).
  const getScoreColor10 = (score: number) => {
    if (score >= 7) return "bg-success/10 text-success border-success/20"
    if (score >= 4) return "bg-warning/20 text-warning border-warning/40 font-bold"
    return "bg-destructive/10 text-destructive border-destructive/20"
  }

  const getSourceColor = (source: string) => {
    const colors: Record<string, string> = {
      "hh.ru": "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800",
      "Avito": "bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 border-cyan-200 dark:border-cyan-800",
      "Telegram": "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800",
      "LinkedIn": "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-800",
    }
    return colors[source] || "bg-muted text-muted-foreground border-border"
  }

  // ─── Дескрипторы перетаскиваемых колонок данных ───────────────────────────
  // Каждый дескриптор хранит ширину (для gridTemplateColumns), JSX заголовка
  // (обычно SortHeader) и рендер ячейки тела. ВАЖНО: заголовок и тело берут
  // данные ТОЛЬКО отсюда, поэтому изменение порядка применяется к обоим сразу.
  // Закреплённые колонки (чекбокс/звезда/Кандидат слева, Действия справа)
  // дескрипторами НЕ являются — они отрисованы напрямую и не двигаются.
  //
  // Пропорциональное растяжение: разные fr-коэффициенты задают доли свободного
  // места. Источник — фиксированной ширины (без fr), не растёт.
  const movableColumns = useMemo<ColumnDescriptor[]>(() => {
    const list: ColumnDescriptor[] = []

    if (showVacancyColumn) {
      // Вакансия — капнута, чтобы длинное название не растягивало таблицу (обрезается «…»)
      list.push({
        id: "vacancy",
        gridWidth: "minmax(112px, 0.9fr)",
        header: <div className="text-muted-foreground text-center w-full">Вакансия</div>,
        renderCell: (candidate) => {
          const vc = candidate as { vacancyTitle?: string | null; vacancyId?: string | null }
          const title = vc.vacancyTitle ?? "—"
          if (vc.vacancyId && onVacancyClick) {
            return (
              <div className="flex justify-center min-w-0">
                <button
                  type="button"
                  title={`Открыть вакансию: ${title}`}
                  className="text-[13px] text-muted-foreground hover:text-primary hover:underline truncate min-w-0 text-center"
                  onClick={(e) => { e.stopPropagation(); onVacancyClick(vc.vacancyId!) }}
                >
                  {title}
                </button>
              </div>
            )
          }
          return (
            <div className="text-[13px] text-muted-foreground truncate min-w-0 text-center" title={title}>{title}</div>
          )
        },
      })
    }

    // Порядок колонок по умолчанию (слева → вправо):
    // ФИО (закреплена) → Портрет → Демо → Анкета → Тест → Интервью → …
    // (пользовательская сущность оценки — ОДНА, «Портрет»: колонка «AI портрет»
    // (осевой скоринг v2, ai_score_v2) убрана 05.07 — консолидация Юрия, см.
    // [[portrait-unified-scoring-redesign]]. Порядок и id колонок НЕ менялись,
    // только подписи + title.)
    // Пользователь может перетаскивать колонки; сброс возвращает этот порядок.

    if (showResumeScore) {
      // Портрет — AI-скор резюме по Портрету вакансии (фикс, w-8 badge).
      list.push({
        id: "resumeScore",
        // 72px — минимум под заголовок с иконкой сортировки: ListFilter 14px +
        // gap 6px + «Портрет» ~71px по факту (замер Inter 12px) → взят
        // безопасный запас (76 обрезал бы «Портрет» без запаса).
        gridWidth: "76px",
        header: (
          <SortHeader
            label="Портрет"
            sortKey="resumeScore"
            sort={sort}
            onToggle={handleSort}
            align="center"
            title="Оценка резюме по Портрету вакансии (0–100)"
          />
        ),
        renderCell: (candidate) => (
          <div className="flex items-center justify-center" title="Оценка резюме по Портрету вакансии (0–100)">
            {candidate.resumeScore != null ? (
              <Badge
                variant="outline"
                className={cn(
                  "text-[11px] font-semibold border px-1.5 py-0 h-5 w-8 justify-center",
                  getScoreColor(candidate.resumeScore),
                )}
              >
                {candidate.resumeScore}
              </Badge>
            ) : (
              <span className="text-muted-foreground/40 text-xs">—</span>
            )}
          </div>
        ),
      })
    }

    if (showProgress) {
      // Демо — сегменты-«шаги». DemoProgressBar сам ограничен max-w-[105px] и
      // адаптируется под количество точек (tot); контенту без прогресса
      // теперь достаточно ширины «—» (05.07, «Не начато» ушло в тултип).
      // 80px — замер (Inter): заголовок «Демо» 32.2px + иконка сортировки
      // 14px + gap 6px ≈ 52px, плюс запас под легко читаемую полосу сегментов.
      list.push({
        id: "progress",
        gridWidth: "80px",
        header: (
          <SortHeader
            label="Демо"
            sortKey="progress"
            sort={sort}
            onToggle={handleSort}
            align="center"
            title="Прогресс прохождения демо/анкеты (сколько шагов из скольки пройдено)"
          />
        ),
        renderCell: (candidate, ctx) => (
          <div className="flex items-center justify-center">
            <DemoProgressBar
              variant="list"
              progressPercent={ctx.demoFraction.hasData && ctx.demoFraction.total > 0
                ? Math.min(100, Math.round((ctx.demoFraction.current / ctx.demoFraction.total) * 100))
                : null}
              completedBlocks={ctx.demoFraction.hasData ? ctx.demoFraction.current : undefined}
              totalBlocks={ctx.demoFraction.hasData ? ctx.demoFraction.total : undefined}
              hasVideoVizitka={candidate.demoProgressJson?.hasVideoVizitka}
              stage={candidate.stage}
              completedByAnswers={candidate.demoCompletedByAnswers}
              demoProgress={candidate.demoProgressJson}
            />
          </div>
        ),
      })
    }

    if (showAnswersScore) {
      // Анкета (было «AI-ан», нечитаемо) — ЕДИНЫЙ AI-балл ответов на вопросы
      // анкеты демо (candidates.demo_answers_score). НЕ «второе демо» —
      // проверено по коду (lib/demo/score-answers.ts, lib/messaging/
      // second-demo-invite.ts): это скоринг ОТВЕТОВ анкеты, а «второе демо» —
      // отдельная downstream-фича, которая ЧИТАЕТ этот балл как гейт, но не
      // тождественна колонке. Вычисляется после прохождения демо на основании
      // текстовых ответов кандидата. Отдельно от aiScore (туда пишут
      // v1/v2-скоринг резюме — была бы гонка).
      //
      // Вариант Б (решение Юрия 05.07): если сдана только часть 1 — балл =
      // балл части 1 (как раньше). После сдачи части 2 — балл пересчитан по
      // ОТВЕЧЕННЫМ вопросам обеих частей (lib/demo/unified-score.ts). Рядом —
      // компактный индикатор "N/M" (сколько частей сдал кандидат из скольких
      // сконфигурировано у вакансии), показывается ТОЛЬКО когда у вакансии
      // есть 2-я часть (anketaPartsTotal >= 2) — иначе одночастевые вакансии
      // не видят лишний шум.
      list.push({
        id: "answersScore",
        // 68px — минимум под заголовок с иконкой сортировки: ListFilter 14px +
        // gap 6px + «Анкета» ~63px по факту (замер Inter 12px) → взят
        // безопасный запас. Индикатор "N/M" — надстрочный, в ширину не влезает
        // отдельным элементом, поэтому вынесен в тултип (не раздувает колонку).
        gridWidth: "68px",
        header: (
          <SortHeader
            label="Анкета"
            sortKey="answersScore"
            sort={sort}
            onToggle={handleSort}
            align="center"
            title="Единый AI-балл ответов анкеты (0–100) по отвеченным вопросам"
          />
        ),
        renderCell: (candidate) => {
          const partsTotal = candidate.anketaPartsTotal ?? 0
          const partsAnswered = candidate.anketaPartsAnswered ?? 0
          const hasParts = partsTotal >= 2
          const tooltip = hasParts
            ? `Сдана часть ${partsAnswered} из ${partsTotal}; балл по отвеченным вопросам`
            : "Единый AI-балл ответов анкеты (0–100) по отвеченным вопросам"
          return (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex flex-col items-center justify-center gap-0 leading-none">
                  {candidate.demoAnswersScore != null ? (
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[11px] font-semibold border px-1.5 py-0 h-5 w-8 justify-center",
                        getScoreColor(candidate.demoAnswersScore),
                      )}
                    >
                      {candidate.demoAnswersScore}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground/40 text-xs">—</span>
                  )}
                  {hasParts && (
                    // Юрий 05.07: было text-[9px] text-muted-foreground/70 —
                    // едва читалось в обеих темах. 10px + secondary-foreground
                    // (обычный контраст, не приглушённый /70) — заметно, но
                    // компактно (колонка 68px не раздувается).
                    <span className="mt-0.5 text-[10px] leading-none text-secondary-foreground font-medium tabular-nums">
                      {partsAnswered}/{partsTotal}
                    </span>
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent side="top">{tooltip}</TooltipContent>
            </Tooltip>
          )
        },
      })
    }

    // Колонка «AI портрет» (осевой скоринг v2, ai_score_v2) убрана 05.07 —
    // консолидация Юрия: пользовательская сущность оценки ОДНА, «Портрет»
    // (= resumeScore, колонка выше). Осевой балл остался справочно внутри
    // карточки кандидата (таб «Портрет» → «Осевой балл (справочно)»), второй
    // колонкой в списке больше не светится, чтобы не конкурировать с главным
    // баллом. sortKey "portraitScore" и showPortraitScore НЕ удалены из типов
    // (см. card-settings.tsx) — чтобы не ломать сохранённые настройки колонок
    // старых пользователей; просто эта колонка больше не рендерится.

    if (showTestScore) {
      // Тест — лесенка: балл (бейдж) → «сдан» (отправил, балла ещё нет) →
      // «запол.» (заполняет, черновик) → «пер.» (открыл) → «отп.»
      // (отправлен) → «—» (не было).
      list.push({
        id: "testScore",
        // 52px — замер (Inter): заголовок «Тест» 28.2px + иконка 14px + gap
        // 6px ≈ 48px (связывающий минимум); контент (балл w-8=32px или
        // самый длинный статус «ошибка» ~39px) уже, заголовок — потолок.
        gridWidth: "52px",
        header: (
          <SortHeader
            label="Тест"
            sortKey="testScore"
            sort={sort}
            onToggle={handleSort}
            align="center"
            title="Результат тестового задания: балл AI-проверки, либо статус (отправлен/открыл/заполняет/сдан)"
          />
        ),
        renderCell: (candidate) => (
          <div
            className={cn(
              "flex items-center justify-center",
              (candidate.testScore != null || candidate.testStatus === "submitted" || candidate.testStatus === "in_progress")
                && "cursor-pointer hover:opacity-70",
            )}
            title={(candidate.testScore != null || candidate.testStatus === "submitted" || candidate.testStatus === "in_progress")
              ? "Открыть результат теста"
              : "Результат теста"}
            onClick={(e) => {
              if (candidate.testScore != null || candidate.testStatus === "submitted" || candidate.testStatus === "in_progress") {
                e.stopPropagation()
                onOpenProfile?.(candidate, candidate.columnId, "test")
              }
            }}
          >
            {candidate.testScore != null ? (
              <Badge
                variant="outline"
                className={cn(
                  "text-[11px] font-semibold border px-1.5 py-0 h-5 w-8 justify-center",
                  getScoreColor(candidate.testScore),
                )}
              >
                {candidate.testScore}
              </Badge>
            ) : candidate.testStatus === "submitted" && candidate.testScoringStatus === "manual" ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-muted-foreground text-[11px] font-medium cursor-default">
                    ручная
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  Тест сдан. Проверка вручную — балл ждёт оценки HR (в настройках теста включён режим «Ручная проверка»).
                </TooltipContent>
              </Tooltip>
            ) : candidate.testStatus === "submitted"
              && (candidate.testScoringStatus === "pending" || candidate.testScoringStatus === "failed") ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-blue-600 dark:text-blue-500 text-[11px] font-medium cursor-default whitespace-nowrap">
                    оцен…
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  Тест сдан, AI ещё оценивает ответы (временная задержка — сеть/лимиты). Система автоматически повторит попытку в фоне, балл обновится без действий HR.
                </TooltipContent>
              </Tooltip>
            ) : candidate.testStatus === "submitted" ? (
              <span
                className="text-success text-[11px] font-medium"
                title="Тест отправлен, балл ещё не готов (идёт AI-проверка)"
              >
                сдан
              </span>
            ) : candidate.testStatus === "in_progress" ? (
              <span
                className="text-blue-600 dark:text-blue-500 text-[11px] font-medium"
                title="Кандидат заполняет тест прямо сейчас (черновик, ещё не отправил)"
              >
                запол.
              </span>
            ) : candidate.testStatus === "opened" ? (
              <span className="text-muted-foreground text-[11px]" title="Кандидат открыл тест, но ещё не начал отвечать">пер.</span>
            ) : candidate.testStatus === "sent" ? (
              <span className="text-muted-foreground text-[11px]" title="Тест отправлен кандидату, ещё не открывал">отп.</span>
            ) : candidate.testStatus === "failed" ? (
              <span className="text-destructive text-[11px] font-medium" title="Отправка теста не прошла (нет hh-чата / hh отклонил)">ошибка</span>
            ) : (
              <span className="text-muted-foreground/40 text-xs">—</span>
            )}
          </div>
        ),
      })
    }

    if (showNextInterview) {
      // Интервью — ближайшее (дата/время) + балл скоркарты по итогам интервью
      // (candidate.interviewScore, 1-10 — параллельный агент добавляет поле в
      // API 05.07). Поле МОЖЕТ отсутствовать в рантайме (undefined) до мерджа
      // его ветки — рендерим через optional chaining на локальном
      // тип-расширении, чтобы tsc был чист независимо от порядка мерджа.
      // 90px — замер (Inter): контент icon(14px)+gap(2px)+«05.07»(32.5px,
      // 13px/medium)+ml-1(4px)+«12:34»(32.5px,13px) ≈ 85px; заголовок
      // «Интервью» 61.3px+icon14+gap6 ≈ 81px. Балл-бейдж (w-8=32px) уже —
      // ширина колонки не растёт.
      list.push({
        id: "nextInterview",
        gridWidth: "90px",
        header: (
          <SortHeader
            label="Интервью"
            sortKey="nextInterview"
            sort={sort}
            onToggle={handleSort}
            align="center"
            title="Ближайшее интервью и балл по итогам интервью (скоркарта)"
          />
        ),
        renderCell: (candidate) => {
          const iso = candidate.nextInterviewAt
          const interviewScore = (candidate as { interviewScore?: number | null }).interviewScore ?? null
          const dateNode = iso ? (() => {
            const d = new Date(iso)
            const day = d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })
            const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
            return (
              <div className="flex items-center justify-center gap-0.5 text-[13px] whitespace-nowrap" title="Ближайшее интервью">
                <CalendarClock className="w-3.5 h-3.5 text-primary/70 shrink-0" />
                <span className="font-medium text-foreground">{day}</span>
                <span className="text-muted-foreground ml-1">{time}</span>
              </div>
            )
          })() : null
          const scoreNode = interviewScore != null ? (
            <Badge
              variant="outline"
              className={cn(
                "text-[11px] font-semibold border px-1.5 py-0 h-5 w-8 justify-center",
                // Шкала интервью 1-10 (НЕ 0-100, как у остальных баллов колонки) —
                // getScoreColor10 отдельная функция с той же семантикой
                // (success/warning/destructive), см. рядом с getScoreColor.
                getScoreColor10(interviewScore),
              )}
            >
              {interviewScore}
            </Badge>
          ) : null
          if (!dateNode && !scoreNode) return <div className="text-center text-muted-foreground/40 text-xs">—</div>
          if (dateNode && scoreNode) {
            return (
              <div className="flex flex-col items-center justify-center gap-0.5">
                {dateNode}
                <Tooltip>
                  <TooltipTrigger asChild>{scoreNode}</TooltipTrigger>
                  <TooltipContent side="top">Балл по итогам интервью (скоркарта)</TooltipContent>
                </Tooltip>
              </div>
            )
          }
          if (scoreNode) {
            return (
              <div className="flex items-center justify-center" title="Балл по итогам интервью (скоркарта)">
                {scoreNode}
              </div>
            )
          }
          return dateNode
        },
      })
    }

    if (showSalary) {
      // Зарплата — 84px, замер (Inter): заголовок «Зарплата» 58.8px+icon14+
      // gap6 ≈ 79px (связывающий минимум); контент «2 000 000 ₽» ≈ 73px влезает.
      list.push({
        id: "salary",
        gridWidth: "84px",
        header: <SortHeader label="Зарплата" sortKey="salary" sort={sort} onToggle={handleSort} align="center" />,
        renderCell: (candidate) => {
          // Salary — single expected value (валюта берётся из
          // candidate.salaryCurrency, fallback ₽)
          const salary = candidate.salaryMax || candidate.salaryMin
          const sym = currencySymbol(candidate.salaryCurrency)
          return (
            <div className="text-center text-[14px] font-medium text-foreground whitespace-nowrap">
              {salary ? `${salary.toLocaleString("ru-RU")} ${sym}` : "—"}
            </div>
          )
        },
      })
    }

    if (showCity) {
      // Город — сужен
      list.push({
        id: "city",
        gridWidth: "minmax(84px, 130px)",
        header: <SortHeader label="Город" sortKey="city" sort={sort} onToggle={handleSort} align="center" />,
        renderCell: (candidate) => (
          <div className="flex items-center justify-center gap-1 text-[14px] text-muted-foreground min-w-0">
            <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">{candidate.city}</span>
          </div>
        ),
      })
    }

    if (showResponseDate) {
      // Дата — "DD.MM.YY". 76px — замер (Inter): контент "05.07.26" (54.5px)
      // + маркер повторного отклика "×2" (gap-0.5 2px + ~9px, 10px/600) ≈ 66px;
      // запас на тултип-иконку курсора/hover не требуется отдельно.
      list.push({
        id: "responseDate",
        gridWidth: "76px",
        header: <SortHeader label="Дата" sortKey="responseDate" sort={sort} onToggle={handleSort} align="center" />,
        renderCell: (candidate, ctx) => {
          // Повторный отклик: показываем дату ПОСЛЕДНЕГО отклика + маркер «×2»,
          // первый отклик — в ховере (Юрий 03.07: повторные «терялись» в списке).
          const last = (candidate as { lastRespondedAt?: string | Date | null }).lastRespondedAt
          const lastDt = last ? formatResponseDate(last) : null
          const shown = lastDt ?? ctx.dt
          const isRepeat = !!(lastDt && ctx.dt && lastDt.short !== ctx.dt.short)
          return (
            <div className="text-center text-sm text-muted-foreground tabular-nums whitespace-nowrap">
              {shown ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex items-center gap-0.5">
                      {shown.short}
                      {isRepeat && <span className="text-[10px] font-semibold text-primary">×2</span>}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    {isRepeat
                      ? `Повторный отклик: ${shown.full}. Первый отклик: ${ctx.dt?.full}`
                      : shown.full}
                  </TooltipContent>
                </Tooltip>
              ) : "—"}
            </div>
          )
        },
      })
    }

    // Статус (всегда показывается). 150px — замер (Inter): самый длинный
    // платформенный лейбл стадии «Предварительный отказ» (127.8px, 11px/500)
    // + px-2 паддинг бейджа (16px) ≈ 144px — раньше при 104px он вылезал за
    // пределы ячейки (не обрезаясь — whitespace-nowrap без overflow-hidden).
    // Кастомные лейблы HR (customLabel per-vacancy) длиннее — за пределом не
    // обрезаем (whitespace-nowrap), это осознанный компромисс: 99% реальных
    // подписей короче, а обрезание платформенных названий стадий недопустимо.
    list.push({
      id: "status",
      gridWidth: "150px",
      header: <SortHeader label="Статус" sortKey="status" sort={sort} onToggle={handleSort} align="center" />,
      renderCell: (candidate) => (
        <div className="text-center">
          {/* «Пред. отказ»: кандидат не прошёл гейт анкеты, помечен на ручной
              разбор (pendingRejectionReason), сообщений ему НЕ уходило. Бэдж
              перекрывает стадию, пока HR не примет решение (Юрий 03.07). */}
          {(candidate as { pendingRejectionReason?: string | null }).pendingRejectionReason === "anketa_gate_failed" ? (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300">
              Пред. отказ
            </span>
          ) : (
          <span
            className={cn(
              "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap",
              candidate.stage ? getStageColorClasses(candidate.stage) : "",
            )}
            style={candidate.stage ? undefined : { background: `linear-gradient(135deg, ${candidate.colorFrom}, ${candidate.colorTo})`, color: "#fff" }}
          >
            {candidate.stage
              ? (() => {
                  const fv2Id = (candidate.funnelV2StateJson as { stageId?: string | null } | null)?.stageId
                  if (fv2Id && funnelV2Stages) {
                    const fv2Stage = funnelV2Stages.find((s) => s.id === fv2Id)
                    if (fv2Stage?.title) return fv2Stage.title
                  }
                  return resolveStatusLabel(candidate, vacancyPipeline)
                })()
              : (candidate.columnTitle === "Демонстрация" ? "Демо" : candidate.columnTitle)}
          </span>
          )}
        </div>
      ),
    })

    if (showSource) {
      // Источник — фикс. 92px (05.07, было 84px): заголовок «Источник» с
      // иконкой сортировки — 78.6px по факту (замер Inter), при 84px оставалось
      // ~2.7px с каждой стороны — заголовок выглядел прижатым к правому краю
      // (визуально не на одной оси с бейджем-контентом, у которого от природы
      // много воздуха). 92px даёт заголовку тот же комфортный запас (~7px с
      // каждой стороны), что и у других колонок.
      list.push({
        id: "source",
        gridWidth: "92px",
        header: (
          <SortHeader
            label="Источник"
            sortKey="source"
            sort={sort}
            onToggle={handleSort}
            align="center"
            title="Откуда пришёл отклик кандидата (hh.ru / Avito / Telegram / LinkedIn)"
          />
        ),
        renderCell: (candidate) => (
          <div className="text-center">
            <Badge variant="outline" className={cn("text-[10px] border", getSourceColor(candidate.source))}>
              {candidate.source}
            </Badge>
          </div>
        ),
      })
    }

    return list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    showVacancyColumn, showProgress, showResumeScore, showAnswersScore, showScore,
    showTestScore, showNextInterview, showSalary, showCity, showResponseDate, showSource,
    sort, onVacancyClick, onOpenProfile,
  ])

  // ─── Порядок перетаскиваемых колонок (per-user, localStorage) ─────────────
  const defaultOrder = useMemo(() => movableColumns.map((c) => c.id), [movableColumns])
  const { order, setOrder, reset, isCustom } = useColumnOrder(defaultOrder)

  // ─── Ширины перетаскиваемых колонок (per-user, localStorage) ──────────────
  const { widths: columnWidths, setWidth: setColumnWidth, resetWidth: resetColumnWidth, resetAll: resetColumnWidths } = useColumnWidths()
  // Дельта живого драга (id → накопленный сдвиг курсора с начала жеста) —
  // применяется поверх стартовой (сохранённой либо natural) ширины колонки.
  const dragStartWidthRef = useRef<Record<string, number>>({})
  const isWidthCustom = Object.keys(columnWidths).length > 0

  /** Ширина колонки для рендера: сохранённая (если юзер её менял) либо
   *  natural-дефолт из дескриптора. */
  const widthForColumn = useCallback((col: ColumnDescriptor): number => {
    return columnWidths[col.id] ?? naturalWidthPx(col.gridWidth)
  }, [columnWidths])

  const handleResizeStart = useCallback((col: ColumnDescriptor) => {
    dragStartWidthRef.current[col.id] = widthForColumn(col)
  }, [widthForColumn])

  const handleResizeDelta = useCallback((col: ColumnDescriptor, deltaPx: number) => {
    const startW = dragStartWidthRef.current[col.id] ?? widthForColumn(col)
    const natural = naturalWidthPx(col.gridWidth)
    // min = natural (нельзя сузить меньше оптимума — контент сломается);
    // max = 2× natural (разумный потолок, не даём растянуть до абсурда).
    const next = Math.round(Math.max(natural, Math.min(natural * 2, startW + deltaPx)))
    setColumnWidth(col.id, next)
  }, [setColumnWidth, widthForColumn])

  // Упорядоченные дескрипторы: проходим по сохранённому порядку, мапим в descriptor.
  // Любой id из order, которого нет среди доступных (выключен настройками) —
  // отфильтровывается; descriptor lookup по Map.
  const orderedColumns = useMemo<ColumnDescriptor[]>(() => {
    const byId = new Map(movableColumns.map((c) => [c.id, c]))
    const result: ColumnDescriptor[] = []
    for (const id of order) {
      const c = byId.get(id)
      if (c) { result.push(c); byId.delete(id) }
    }
    // На случай рассинхрона (order ещё не подхватил новый id) — добиваем хвостом.
    for (const c of byId.values()) result.push(c)
    return result
  }, [movableColumns, order])

  // Можно ли реально перетаскивать (нужно ≥2 движимых колонки).
  const dndEnabled = orderedColumns.length >= 2

  const sensors = useSensors(
    // distance:5 — простой клик по кнопке сортировки внутри заголовка не
    // запускает drag; перетаскивание начинается только после сдвига курсора.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = order.indexOf(String(active.id))
    const newIndex = order.indexOf(String(over.id))
    if (oldIndex === -1 || newIndex === -1) return
    setOrder(arrayMove(order, oldIndex, newIndex))
  }

  // ─── gridTemplateColumns из закреплённых + упорядоченных движимых ──────────
  // Единый механизм зазора (Юрий 05.07): везде gap-4 (16px, CSS gap на grid-
  // контейнере) — раньше часть «зазора» пряталась в -ml-3 (маскировали gap-3=
  // 12px под чекбоксом/звездой/именем), из-за чего visually зазоры были
  // неровными. -ml-3 убраны, ширины колонок ниже — по фактическому контенту
  // (см. комментарии у каждой колонки), БЕЗ доп. паддингов внутри ячеек.
  // ☐ — 24px, justify-end. ★ — 28px, justify-center (иконка 16px + hover-паддинг).
  // Кандидат — единственная эластичная колонка (fr): всё освободившееся от
  // сужения остальных колонок место достаётся ФИО. minmax(200px, 1fr) —
  // вмещает ФИО, длиннее → «…» (truncate уже был и остаётся).
  // Ресайз (Юрий 05.07): колонка, которую юзер явно потянул, рендерится
  // фикс-шириной в px (columnWidths[id]); остальные — как раньше, их родная
  // gridWidth-строка (px или minmax(...) — напр. «Вакансия», «Город» тянутся
  // в разумных пределах, пока их не зафиксировали ресайзом). ФИО (Кандидат) —
  // единственная эластичная колонка, ресайзу не подлежит (не в orderedColumns).
  const cols: string[] = []
  if (selectionEnabled) cols.push("24px")               // ☐ — фикс (компактнее)
  cols.push("28px")                                     // ★ — фикс (w-7, ужато)
  cols.push("minmax(200px, 1fr)")                       // Кандидат — закреплён, единственный fr
  for (const c of orderedColumns) {
    cols.push(c.id in columnWidths ? `${columnWidths[c.id]}px` : c.gridWidth)
  }
  if (showActions) {
    // База: 3 иконки (advance/reject/open) = 80px, +28px на «Запланировать интервью».
    // В режиме рассылки hh добавляем ещё иконку чата → +28px.
    const baseActionsW = onScheduleInterview ? 108 : 80
    cols.push(`${baseActionsW + (hhBroadcastMode ? 28 : 0)}px`)
  }

  // Минимальная ширина таблицы = сумма минимумов колонок (px из фикс-ширин и
  // из minmax(Npx, …)). Нужна, чтобы при узком экране сетка ПЕРЕПОЛНЯЛА контейнер
  // и включался горизонтальный скролл (контейнер overflow-x-auto), а не обрезалась.
  // На широком экране сетка тянется по fr (minWidth — только нижняя граница).
  // +(cols.length-1)*16 — реальные CSS-gap между треками (gap-4=16px, единый
  // зазор везде, см. комментарий выше), не константа «на глаз».
  const minTableWidth = cols.reduce((sum, c) => {
    const m = c.match(/minmax\(\s*(\d+)px/) ?? c.match(/^(\d+)px$/)
    return sum + (m ? parseInt(m[1], 10) : 0)
  }, 0) + Math.max(0, cols.length - 1) * 16
  const gridStyle = { gridTemplateColumns: cols.join(" "), minWidth: `${minTableWidth}px` }

  // ─── Selection helpers ──────────────────────────────────────────────────
  const visibleIds = useMemo(() => allCandidates.map((c) => c.id), [allCandidates])
  const selectedCount = useMemo(() => {
    if (!selectedIds) return 0
    let n = 0
    for (const id of visibleIds) if (selectedIds.has(id)) n++
    return n
  }, [selectedIds, visibleIds])
  const headerState: boolean | "indeterminate" =
    selectedCount === 0 ? false : selectedCount === visibleIds.length ? true : "indeterminate"

  const toggleAllVisible = () => {
    if (!selectedIds || !onSelectionChange) return
    const next = new Set(selectedIds)
    if (selectedCount === visibleIds.length) {
      for (const id of visibleIds) next.delete(id)
    } else {
      for (const id of visibleIds) next.add(id)
    }
    onSelectionChange(next)
  }

  const toggleOne = (id: string, e?: React.MouseEvent | React.KeyboardEvent) => {
    if (!selectedIds || !onSelectionChange) return
    const next = new Set(selectedIds)
    const isShift = !!(e && (e as React.MouseEvent).shiftKey)
    if (isShift && lastSelectedIdRef.current && lastSelectedIdRef.current !== id) {
      const fromIdx = visibleIds.indexOf(lastSelectedIdRef.current)
      const toIdx = visibleIds.indexOf(id)
      if (fromIdx !== -1 && toIdx !== -1) {
        const [lo, hi] = fromIdx < toIdx ? [fromIdx, toIdx] : [toIdx, fromIdx]
        const shouldSelect = !next.has(id)
        for (let i = lo; i <= hi; i++) {
          if (shouldSelect) next.add(visibleIds[i])
          else next.delete(visibleIds[i])
        }
        lastSelectedIdRef.current = id
        onSelectionChange(next)
        return
      }
    }
    if (next.has(id)) next.delete(id)
    else next.add(id)
    lastSelectedIdRef.current = id
    onSelectionChange(next)
  }

  return (
    <div className="rounded-xl border border-border overflow-x-auto bg-card">
      {/* Кнопки сброса порядка/ширины колонок — видны только когда изменены.
          Дублируют пункт «Сбросить ширины колонок» в попапе «Вид» (view-settings.tsx) —
          тот доступен не с каждой страницы-обёртки списка, эта кнопка — всегда рядом с таблицей. */}
      {((isCustom && dndEnabled) || isWidthCustom) && (
        <div className="flex justify-end gap-3 px-4 pt-2">
          {isCustom && dndEnabled && (
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground transition-colors"
              title="Вернуть колонки в исходный порядок"
            >
              <RotateCcw className="size-3" />
              Сбросить порядок
            </button>
          )}
          {isWidthCustom && (
            <button
              type="button"
              onClick={resetColumnWidths}
              className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground transition-colors"
              title="Вернуть колонкам оптимальную ширину"
            >
              <RotateCcw className="size-3" />
              Сбросить ширины
            </button>
          )}
        </div>
      )}

      {/* Table Header */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToHorizontalAxis]}
        onDragEnd={handleDragEnd}
      >
        <div
          className="grid gap-4 pl-1 pr-4 py-2.5 bg-muted/60 border-b border-border text-[13px] font-medium text-muted-foreground tracking-normal items-center"
          style={gridStyle}
        >
          {selectionEnabled && (
            <div className="flex items-center justify-end" onClick={(e) => e.stopPropagation()}>
              <Checkbox
                checked={headerState}
                onCheckedChange={() => toggleAllVisible()}
                aria-label={selectedCount === visibleIds.length && visibleIds.length > 0 ? "Снять выделение со всех" : "Выделить всех на странице"}
              />
            </div>
          )}
          <div className="flex items-center justify-center">
            <button
              type="button"
              onClick={() => handleSort("favorite")}
              aria-sort={sort?.key === "favorite" ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
              aria-label="Сортировать по избранному"
              className={cn(
                "inline-flex items-center gap-0.5 rounded-md px-1 py-0.5 hover:bg-accent/60 transition-colors",
                sort?.key === "favorite" ? "text-primary bg-primary/10" : "text-muted-foreground/60",
              )}
            >
              <Star className={cn("size-4", sort?.key === "favorite" && "fill-yellow-400 text-yellow-400")} />
              {sort?.key === "favorite" && (sort.dir === "asc" ? (
                <ArrowUp className="size-3" strokeWidth={2.5} />
              ) : (
                <ArrowDown className="size-3" strokeWidth={2.5} />
              ))}
            </button>
          </div>
          <div>
            {onSortChange ? (
              <SortHeader label="Кандидат" sortKey="name" sort={sort} onToggle={handleSort} align="left" />
            ) : (
              <span>Кандидат</span>
            )}
          </div>

          {/* Перетаскиваемые заголовки движимых колонок. Ручка ресайза —
              независимая от dndEnabled (можно тянуть ширину даже когда
              осталась 1 движимая колонка и порядок менять уже нечем). */}
          <SortableContext items={order} strategy={horizontalListSortingStrategy}>
            {orderedColumns.map((col) => (
              dndEnabled ? (
                <SortableHeaderCell
                  key={col.id}
                  id={col.id}
                  onResizeStart={() => handleResizeStart(col)}
                  onResizeDelta={(deltaPx) => handleResizeDelta(col, deltaPx)}
                  onResizeReset={() => resetColumnWidth(col.id)}
                >
                  {col.header}
                </SortableHeaderCell>
              ) : (
                <div key={col.id} className="relative flex items-center min-w-0 overflow-hidden">
                  {col.header}
                  <ColumnResizeHandle
                    onDragStart={() => handleResizeStart(col)}
                    onResize={(deltaPx) => handleResizeDelta(col, deltaPx)}
                    onReset={() => resetColumnWidth(col.id)}
                  />
                </div>
              )
            ))}
          </SortableContext>

          {showActions && <div className="text-center">Действия</div>}
        </div>
      </DndContext>

      {/* Rows */}
      <div className="divide-y divide-border">
        {allCandidates.map((candidate, i) => {
          const isDecisionStage = candidate.columnId === "interview" || candidate.columnId === "offer"
          const aiActuallyRan = candidate.aiScore != null && !!candidate.aiSummary
          // Источник истины — поля demoTotalBlocks/demoCompletedBlocks из API
          // (см. /api/modules/hr/candidates), где total = lessons.length + 2,
          // а completed = страницы пройденные хотя бы 1 блоком + анкета + спасибо.
          // Fallback на calcDemoFraction для legacy-данных без этих полей.
          const apiTotal = (candidate as { demoTotalBlocks?: number }).demoTotalBlocks
          const apiCompleted = (candidate as { demoCompletedBlocks?: number }).demoCompletedBlocks
          const demoFraction = (typeof apiTotal === "number" && apiTotal > 0)
            ? { current: apiCompleted ?? 0, total: apiTotal, hasData: true }
            : calcDemoFraction(candidate.demoProgressJson)
          const dt = formatResponseDate(candidate.createdAt ?? candidate.addedAt)
          const isSelected = !!selectedIds?.has(candidate.id)
          const ctx: RenderCtx = { demoFraction, dt, aiActuallyRan }
          return (
            <div
              key={candidate.id}
              className={cn(
                "grid gap-4 pl-1 pr-4 items-center hover:bg-muted/40 transition-colors min-h-[56px] text-[14px] cursor-pointer",
                i % 2 === 0 ? "" : "bg-muted/20",
                isSelected && "bg-primary/5 hover:bg-primary/10"
              )}
              style={gridStyle}
              onClick={() => onOpenProfile?.(candidate, candidate.columnId)}
            >
              {/* Selection checkbox */}
              {selectionEnabled && (
                <div
                  className="flex items-center justify-end"
                  onClick={(e) => { e.stopPropagation(); toggleOne(candidate.id, e) }}
                >
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => { /* handled by row click */ }}
                    aria-label={isSelected ? "Снять выделение" : "Выделить кандидата"}
                  />
                </div>
              )}

              {/* Favorite */}
              <div onClick={(e) => e.stopPropagation()} className="flex items-center justify-center">
                <button
                  type="button"
                  onClick={() => onToggleFavorite?.(candidate.id, !candidate.isFavorite)}
                  className="inline-flex items-center justify-center p-1 rounded hover:bg-accent/60 transition-colors"
                  aria-label={candidate.isFavorite ? "Убрать из избранного" : "В избранное"}
                >
                  <Star className={cn("size-4", candidate.isFavorite ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/40 hover:text-yellow-400")} />
                </button>
              </div>

              {/* Name + experience */}
              <div className="flex items-center gap-3 min-w-0">
                <CandidateAvatar
                  candidateId={candidate.id}
                  name={candidate.name}
                  photoUrl={candidate.photoUrl}
                  colorFrom={candidate.colorFrom}
                  colorTo={candidate.colorTo}
                />
                <div className="min-w-0 flex-1">
                  <p
                    className="text-[15px] font-medium text-foreground flex items-center gap-1.5 min-w-0"
                    title={candidate.isActive ? `${candidate.name} · активен сейчас` : candidate.name}
                  >
                    {candidate.isActive && (
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" aria-label="Активен сейчас" />
                    )}
                    <span className="truncate">{candidate.name}</span>
                    {candidate.nameUncertain && settings.showNameWarning !== false && (
                      <span
                        title="Имя под вопросом — бот напишет нейтрально («Здравствуйте»). Проверьте и при желании впишите имя вручную."
                        aria-label="Имя под вопросом"
                        className="shrink-0 text-[12px] text-amber-500 cursor-help"
                      >⚠</span>
                    )}
                  </p>
                  {settings.showExperience && (
                    <p
                      className="text-[13px] text-muted-foreground truncate"
                      title={candidate.experience}
                    >
                      {candidate.experienceYears ? `Опыт ${yearsRu(candidate.experienceYears)}` : (candidate.experience ? `Опыт ${candidate.experience}` : "")}
                    </p>
                  )}
                </div>
              </div>

              {/* Перетаскиваемые ячейки данных — порядок строго совпадает с заголовком */}
              {orderedColumns.map((col) => (
                <div key={col.id} className="contents">{col.renderCell(candidate, ctx)}</div>
              ))}

              {/* Actions — компактные иконки, full-height клик-зоны */}
              {showActions && (
                <div
                  className="self-stretch flex gap-1 justify-center items-center h-full"
                  onClick={(e) => e.stopPropagation()}
                >
                  {hhBroadcastMode && (
                    <button
                      type="button"
                      title="Рассылка через hh"
                      className="w-7 h-full flex items-center justify-center rounded text-orange-600 dark:text-orange-400 hover:bg-orange-500/10 transition-colors"
                      onClick={(e) => { e.stopPropagation(); onBroadcast?.(candidate.id) }}
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {isDecisionStage ? (
                    <>
                      <button
                        type="button"
                        title="Принять"
                        className="w-7 h-full flex items-center justify-center rounded text-success hover:bg-success/10 transition-colors"
                        onClick={() => onAction?.(candidate.id, candidate.columnId, "advance")}
                      >
                        <ThumbsUp className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        title="Отказать"
                        className="w-7 h-full flex items-center justify-center rounded text-destructive hover:bg-destructive/10 transition-colors"
                        onClick={() => onAction?.(candidate.id, candidate.columnId, "reject")}
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        title="В резерв"
                        className="w-7 h-full flex items-center justify-center rounded text-warning hover:bg-warning/10 transition-colors"
                        onClick={() => onAction?.(candidate.id, candidate.columnId, "reserve")}
                      >
                        <Clock className="w-4 h-4" />
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        title="Пригласить"
                        className="w-7 h-full flex items-center justify-center rounded text-success hover:bg-success/10 transition-colors"
                        onClick={() => onAction?.(candidate.id, candidate.columnId, "advance")}
                      >
                        <CheckCircle2 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        title="Отказать"
                        className="w-7 h-full flex items-center justify-center rounded text-destructive hover:bg-destructive/10 transition-colors"
                        onClick={() => onAction?.(candidate.id, candidate.columnId, "reject")}
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        title="Открыть"
                        className="w-7 h-full flex items-center justify-center rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                        onClick={() => onOpenProfile?.(candidate, candidate.columnId)}
                      >
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </>
                  )}
                  {onScheduleInterview && (
                    <button
                      type="button"
                      title="Запланировать интервью"
                      className="w-7 h-full flex items-center justify-center rounded text-violet-600 dark:text-violet-400 hover:bg-violet-500/10 transition-colors"
                      onClick={() => onScheduleInterview(candidate as Candidate & { vacancyId?: string | null })}
                    >
                      <CalendarPlus className="w-4 h-4" />
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
