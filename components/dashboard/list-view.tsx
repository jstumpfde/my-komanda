"use client"

import { useMemo, useRef } from "react"
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

function SortHeader({
  label, sortKey, sort, onToggle, align = "left",
}: {
  label: string
  sortKey: ListSortKey
  sort: ListSortState | null
  onToggle: (key: ListSortKey) => void
  align?: "left" | "center" | "right"
}) {
  const active = sort?.key === sortKey
  const dir = active ? sort!.dir : null
  const ariaSort = !active ? "none" : dir === "asc" ? "ascending" : "descending"
  return (
    <button
      type="button"
      onClick={() => onToggle(sortKey)}
      aria-sort={ariaSort}
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
function SortableHeaderCell({ id, children }: { id: string; children: React.ReactNode }) {
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
  const showResumeScore  = settings.showResumeScore !== false  // AI-резм. (undefined = вкл)
  const showPortraitScore = settings.showPortraitScore !== false  // AI-Порт (undefined = вкл)
  const showAnswersScore = settings.showAnswersScore !== false   // Демо1 — AI-балл ответов анкеты (undefined = вкл)
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
    if (score >= 40) return "bg-warning/10 text-warning border-warning/20"
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
        header: <div className="text-muted-foreground">Вакансия</div>,
        renderCell: (candidate) => {
          const vc = candidate as { vacancyTitle?: string | null; vacancyId?: string | null }
          const title = vc.vacancyTitle ?? "—"
          if (vc.vacancyId && onVacancyClick) {
            return (
              <button
                type="button"
                title={`Открыть вакансию: ${title}`}
                className="text-[13px] text-muted-foreground hover:text-primary hover:underline truncate min-w-0 text-left"
                onClick={(e) => { e.stopPropagation(); onVacancyClick(vc.vacancyId!) }}
              >
                {title}
              </button>
            )
          }
          return (
            <div className="text-[13px] text-muted-foreground truncate min-w-0" title={title}>{title}</div>
          )
        },
      })
    }

    // Порядок колонок по умолчанию (слева → вправо):
    // ФИО (закреплена) → AI-резм. → Демо → Демо1 → AI-Порт → Тест → Интервью → …
    // Пользователь может перетаскивать колонки; сброс возвращает этот порядок.

    if (showResumeScore) {
      // AI-резм. — AI-скор резюме (фикс, w-8 badge)
      list.push({
        id: "resumeScore",
        gridWidth: "56px",
        header: <SortHeader label="AI-резм." sortKey="resumeScore" sort={sort} onToggle={handleSort} align="center" />,
        renderCell: (candidate) => (
          <div className="flex items-center justify-center" title="AI-скор резюме по Портрету">
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
      // Демо — сегменты-«шаги». Ширина намеренно узкая: DemoProgressBar сам
      // ограничен max-w-[105px] и адаптируется под количество точек (tot).
      list.push({
        id: "progress",
        gridWidth: "minmax(56px, 0.7fr)",
        header: <SortHeader label="Демо" sortKey="progress" sort={sort} onToggle={handleSort} align="center" />,
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
      // AI-ан — AI-балл ответов на вопросы анкеты демо (candidates.demo_answers_score).
      // Вычисляется после прохождения демо на основании текстовых ответов кандидата.
      // Отдельно от aiScore (туда пишут v1/v2-скоринг резюме — была бы гонка).
      list.push({
        id: "answersScore",
        gridWidth: "56px",
        header: <SortHeader label="AI-ан" sortKey="answersScore" sort={sort} onToggle={handleSort} align="center" />,
        renderCell: (candidate) => (
          <div className="flex items-center justify-center" title="AI-балл ответов анкеты демо">
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
          </div>
        ),
      })
    }

    if (showPortraitScore) {
      // AI-Порт — оценка по Портрету (новый скоринг по критериям Портрета, ai_score_v2).
      // Отдельно от старого AI-балла; для старых вакансий заполняется по мере пересчёта.
      list.push({
        id: "portraitScore",
        gridWidth: "56px",
        header: <SortHeader label="AI-Порт" sortKey="portraitScore" sort={sort} onToggle={handleSort} align="center" />,
        renderCell: (candidate) => (
          <div className="flex items-center justify-center" title="Оценка по Портрету (скоринг по критериям «Что хотим видеть»)">
            {candidate.aiScoreV2 != null ? (
              <Badge
                variant="outline"
                className={cn(
                  "text-[11px] font-semibold border px-1.5 py-0 h-5 w-8 justify-center",
                  getScoreColor(candidate.aiScoreV2),
                )}
              >
                {Math.round(candidate.aiScoreV2)}
              </Badge>
            ) : (
              <span className="text-muted-foreground/40 text-xs">—</span>
            )}
          </div>
        ),
      })
    }

    if (showTestScore) {
      // Тест — лесенка: балл (бейдж) → «сдан» (отправил, балла ещё нет) →
      // «пишет» (заполняет, черновик) → «пер.» (открыл) → «отп.»
      // (отправлен) → «—» (не было).
      list.push({
        id: "testScore",
        gridWidth: "56px",
        header: <SortHeader label="Тест" sortKey="testScore" sort={sort} onToggle={handleSort} align="center" />,
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
            ) : candidate.testStatus === "submitted" ? (
              <span className="text-success text-[11px] font-medium">сдан</span>
            ) : candidate.testStatus === "in_progress" ? (
              <span className="text-blue-600 dark:text-blue-500 text-[11px] font-medium">заб</span>
            ) : candidate.testStatus === "opened" ? (
              <span className="text-muted-foreground text-[11px]">пер.</span>
            ) : candidate.testStatus === "sent" ? (
              <span className="text-muted-foreground text-[11px]">отп.</span>
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
      // Интервью — ближайшее (дата/время)
      list.push({
        id: "nextInterview",
        gridWidth: "minmax(92px, 0.9fr)",
        header: <SortHeader label="Интервью" sortKey="nextInterview" sort={sort} onToggle={handleSort} align="center" />,
        renderCell: (candidate) => {
          const iso = candidate.nextInterviewAt
          if (!iso) return <div className="text-center text-muted-foreground/40 text-xs">—</div>
          const d = new Date(iso)
          const day = d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })
          const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
          return (
            <div className="flex items-center justify-center gap-1 text-[13px] whitespace-nowrap" title="Ближайшее интервью">
              <CalendarClock className="w-3.5 h-3.5 text-primary/70 shrink-0" />
              <span className="font-medium text-foreground">{day}</span>
              <span className="text-muted-foreground">{time}</span>
            </div>
          )
        },
      })
    }

    if (showSalary) {
      // Зарплата — ужата (длинных чисел редко > 7 симв)
      list.push({
        id: "salary",
        gridWidth: "minmax(88px, 1fr)",
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
      // Дата — "DD.MM.YY"
      list.push({
        id: "responseDate",
        gridWidth: "minmax(62px, 0.7fr)",
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

    // Статус — сужен (всегда показывается)
    list.push({
      id: "status",
      gridWidth: "minmax(104px, 1.1fr)",
      header: <SortHeader label="Статус" sortKey="status" sort={sort} onToggle={handleSort} align="center" />,
      renderCell: (candidate) => (
        <div className="text-center">
          {/* В paginated-режиме все кандидаты завёрнуты в одну
              синтетическую колонку {title:"Кандидаты"}; columnTitle
              одинаков у всех. Поэтому лейбл/цвет статуса берём из
              реального candidate.stage через PLATFORM_STAGES. */}
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
        </div>
      ),
    })

    if (showSource) {
      // Источник — фикс (значки "hh"/"av" короткие)
      list.push({
        id: "source",
        gridWidth: "72px",
        header: <SortHeader label="Источн." sortKey="source" sort={sort} onToggle={handleSort} align="center" />,
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
    showVacancyColumn, showProgress, showResumeScore, showPortraitScore, showAnswersScore, showScore,
    showTestScore, showNextInterview, showSalary, showCity, showResponseDate, showSource,
    sort, onVacancyClick, onOpenProfile,
  ])

  // ─── Порядок перетаскиваемых колонок (per-user, localStorage) ─────────────
  const defaultOrder = useMemo(() => movableColumns.map((c) => c.id), [movableColumns])
  const { order, setOrder, reset, isCustom } = useColumnOrder(defaultOrder)

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
  // ☐ — 24px, justify-end. ★ — 28px, justify-center.
  // -ml-3 на ★ и Кандидате схлопывает gap до ~4px edge-to-edge.
  // Кандидат: minmax(200px, 2fr) — вмещает ФИО, длиннее → «…».
  const cols: string[] = []
  if (selectionEnabled) cols.push("24px")               // ☐ — фикс (компактнее)
  cols.push("28px")                                     // ★ — фикс (w-7, ужато)
  cols.push("minmax(200px, 2fr)")                       // Кандидат — закреплён
  for (const c of orderedColumns) cols.push(c.gridWidth)
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
  const minTableWidth = cols.reduce((sum, c) => {
    const m = c.match(/minmax\(\s*(\d+)px/) ?? c.match(/^(\d+)px$/)
    return sum + (m ? parseInt(m[1], 10) : 0)
  }, 0) + 16 // запас на gap/паддинги
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
      {/* Кнопка сброса порядка колонок — видна только когда порядок изменён */}
      {isCustom && dndEnabled && (
        <div className="flex justify-end px-4 pt-2">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground transition-colors"
            title="Вернуть колонки в исходный порядок"
          >
            <RotateCcw className="size-3" />
            Сбросить порядок
          </button>
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
          className="grid gap-3 pl-1 pr-4 py-2.5 bg-muted/60 border-b border-border text-[13px] font-medium text-muted-foreground tracking-normal items-center"
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
          <div className="flex items-center justify-center -ml-3">
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
          <div className="-ml-3">
            {onSortChange ? (
              <SortHeader label="Кандидат" sortKey="name" sort={sort} onToggle={handleSort} align="left" />
            ) : (
              <span>Кандидат</span>
            )}
          </div>

          {/* Перетаскиваемые заголовки движимых колонок */}
          <SortableContext items={order} strategy={horizontalListSortingStrategy}>
            {orderedColumns.map((col) => (
              dndEnabled ? (
                <SortableHeaderCell key={col.id} id={col.id}>
                  {col.header}
                </SortableHeaderCell>
              ) : (
                <div key={col.id} className="flex items-center">{col.header}</div>
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
                "grid gap-3 pl-1 pr-4 items-center hover:bg-muted/40 transition-colors min-h-[56px] text-[14px] cursor-pointer",
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
              <div onClick={(e) => e.stopPropagation()} className="flex items-center justify-center -ml-3">
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
              <div className="flex items-center gap-3 min-w-0 -ml-3">
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
