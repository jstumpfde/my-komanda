"use client"

import { useRef, useState, useMemo, useEffect, useCallback, Suspense } from "react"
import { useRouter } from "next/navigation"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuCheckboxItem, DropdownMenuItem,
} from "@/components/ui/dropdown-menu"
import { Video, Building2, ExternalLink, ChevronLeft, ChevronRight, List, CalendarDays, CalendarRange, Clock, Settings, Plus, GripVertical, Pencil, Trash2, Save, X, LayoutGrid, Phone, Check, Minus, FileText, ClipboardCheck, Sparkles, CalendarClock, Link2, UserCheck, Loader2, Tag } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { CalendarView } from "@/components/calendar/calendar-view"
import { getStageLabel, PLATFORM_STAGES, type StageSlug } from "@/lib/stages"
import { REJECTION_REASONS } from "@/lib/hr/rejection-reasons"
import { StageMessageControl } from "@/components/candidates/stage-message-control"
import { filterByStageCondition, hideSupersededCancelled, type StageCondition, type InterviewDecision } from "@/lib/interviews/stage-filters"
import { DemoProgressBar, calcDemoPercent, type DemoProgressData } from "@/components/hr/demo-progress-bar"
import { getDemoProgressGroup, getDemoProgressPercent } from "@/lib/demo-progress-groups"

// ─── Типы ────────────────────────────────────────────────────

type InterviewType = "Техническое" | "HR" | "Финальное"
type InterviewFormat = "Звонок" | "Онлайн" | "Офис"
type InterviewStatus = "Подтверждено" | "Ожидает" | "Пройдено" | "Не явился" | "Отменено"
type ViewMode = "list" | "calendar" | "week" | "kanban" | "day"
// StageCondition теперь живёт в lib/interviews/stage-filters.ts (чистая логика
// фильтрации, юнит-тесты) — здесь только реэкспорт типа для остального файла.
export type { StageCondition }

interface Stage {
  id: string
  name: string
  emoji: string
  color: string
  condition: StageCondition
  isDefault: boolean
}

// Ручные назначения кастомного тега на интервью (condition:"manual") —
// Record<stageId, interviewId[]>. Персистится на сервере в hiring_defaults_json
// (per-company) — см. 1c ниже. Ручная отметка исхода (condition:"outcome_passed")
// НЕ хранится отдельно — читает/пишет уже существующее поле
// calendar_events.interview_decision (см. Interview.interviewDecision ниже и
// lib/interviews/stage-filters.ts).
type ManualAssignments = Record<string, string[]>

const INTERVIEW_DECISION_OPTIONS: { id: NonNullable<InterviewDecision>; label: string }[] = [
  { id: "advance", label: "Дальше" },
  { id: "offer", label: "Оффер" },
  { id: "reject", label: "Отказ" },
  { id: "reserve", label: "В резерв" },
]

// Отдельная стадия «Отменённые» (status="Отменено") — отменённые интервью
// живут только здесь, из активных табов (Предстоящие/Сегодня/Прошедшие) они
// исключены (см. lib/interviews/stage-filters.ts). Дефолтная (не удаляется).
const CANCELLED_STAGE: Stage = { id: "cancelled", name: "Отменённые", emoji: "❌", color: "#9ca3af", condition: "status_cancelled", isDefault: true }
// «Прошёл»/«Отказ» — реальный исход интервью (calendar_events.interview_decision,
// см. lib/interviews/stage-filters.ts). «Решение» — кандидат сейчас на стадии
// воронки "decision" (lib/stages.ts PLATFORM_STAGES). Гибридные табы, решение
// владельца 15.07 (см. migrateInterviewStages ниже).
const PASSED_STAGE: Stage = { id: "passed", name: "Прошёл", emoji: "🏆", color: "#eab308", condition: "outcome_passed", isDefault: true }
const REJECTED_STAGE: Stage = { id: "rejected", name: "Отказ", emoji: "⛔", color: "#ef4444", condition: "outcome_rejected", isDefault: true }
const DECISION_STAGE: Stage = { id: "decision", name: "Решение", emoji: "⚖️", color: "#8b5cf6", condition: "stage_decision", isDefault: true }

const DEFAULT_STAGES: Stage[] = [
  { id: "upcoming", name: "Предстоящие", emoji: "📅", color: "#3b82f6", condition: "date_after", isDefault: true },
  { id: "today", name: "Сегодня", emoji: "🌅", color: "#f59e0b", condition: "date_today", isDefault: true },
  { id: "past", name: "Прошедшие", emoji: "✅", color: "#22c55e", condition: "date_before", isDefault: true },
  PASSED_STAGE,
  REJECTED_STAGE,
  DECISION_STAGE,
  CANCELLED_STAGE,
]

// 14.07: владелец сначала свёл раздел к 5 табам (Все + Предстоящие + Сегодня +
// Прошедшие + Отменённые), убрав «Повторные»/«Прошёл» — путали. 15.07 владелец
// вернул исход/решение гибридным набором табов (см. DEFAULT_STAGES выше:
// «Прошёл»/«Отказ»/«Решение»). Миграция сохранённых на сервере стадий теперь:
//  - «Повторные» (condition repeat_interview ИЛИ имя «Повторные») — концепт
//    по-прежнему выпилен, чистим безусловно.
//  - Самодельная стадия «Прошёл» с condition="manual" (кейс Revoluterra —
//    HR завёл свой таб, но вручную никто не проставлял тег, поэтому вечный
//    0) — НЕ удаляем, а перенастраиваем на condition="outcome_passed",
//    сохранив id/emoji/color/название: таб наконец начинает показывать
//    реальные данные вместо ручной разметки, которой не было.
//  - Догоняем «Отказ»/«Решение»/«Отменённые», если компания сохраняла список
//    стадий ДО того, как эти три появились в DEFAULT_STAGES.
// changed вычисляется честным сравнением содержимого (JSON.stringify), а не
// по длине массива — перенастройка condition длину не меняет, но список всё
// равно должен уйти на сервер через PATCH (иначе миграция не запишется).
function migrateInterviewStages(list: Stage[]): { stages: Stage[]; changed: boolean } {
  const withoutRepeat = list.filter(s => s.condition !== "repeat_interview" && s.name !== "Повторные")
  const reconfigured = withoutRepeat.map(s =>
    s.name === "Прошёл" && s.condition === "manual" ? { ...s, condition: "outcome_passed" as StageCondition } : s
  )
  // Дедуп: если после перенастройки «Прошёл» на сервере оказалось два
  // outcome_passed-таба (самодельный + когда-то уже сохранённый дефолтный),
  // оставляем только первый по порядку.
  let seenPassed = false
  const deduped = reconfigured.filter(s => {
    if (s.condition !== "outcome_passed") return true
    if (seenPassed) return false
    seenPassed = true
    return true
  })
  let result = deduped
  if (!result.some(s => s.condition === "outcome_rejected")) result = [...result, REJECTED_STAGE]
  if (!result.some(s => s.condition === "stage_decision")) result = [...result, DECISION_STAGE]
  // «Отменённые» — всегда последний таб. У компаний, сохранивших список ДО
  // появления «Отказ»/«Решение» (кейс Revoluterra), отменённые лежали в конце
  // сохранённого массива, и дописанные новые табы встали бы за ними — красный
  // крестик оказался бы в середине таб-бара. Поэтому не просто добираем, а
  // переносим существующий (возможно, переименованный HR) в хвост.
  const existingCancelled = result.find(s => s.condition === "status_cancelled")
  result = [
    ...result.filter(s => s.condition !== "status_cancelled"),
    existingCancelled ?? CANCELLED_STAGE,
  ]
  const changed = JSON.stringify(result) !== JSON.stringify(list)
  return { stages: result, changed }
}

// Задача 1c (13.07): стадии раньше жили ТОЛЬКО в localStorage браузера
// (per-браузер, не per-компания — у Revoluterra стадии «Повторные»/«Прошёл»
// пропадали при смене устройства). Перенесены на сервер (hiring_defaults_json,
// per-company) — см. loadInterviews-соседний эффект ниже, PATCH
// /api/modules/hr/company/hiring-defaults. STAGE_STORAGE_KEY оставлен ТОЛЬКО
// для одноразовой миграции существующих локальных кастомных стадий на сервер
// при первой загрузке страницы после деплоя (loadLocalStagesLegacy).
const STAGE_STORAGE_KEY = "hireflow-interview-stages"

function loadLocalStagesLegacy(): Stage[] | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(STAGE_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) && parsed.length > 0 ? (parsed as Stage[]) : null
  } catch { return null }
}

// Условия, доступные HR при создании/редактировании кастомной стадии.
// «Повторное интервью» (repeat_interview) по-прежнему НЕ предлагаем — концепт
// выпилен 14.07 (см. миграцию migrateInterviewStages). «Исход: прошёл/отказ»
// и «Стадия: Решение» (outcome_passed/outcome_rejected/stage_decision),
// наоборот, ПРЕДЛАГАЕМ с 15.07 — гибридные табы, решение владельца (см.
// DEFAULT_STAGES).
const CONDITION_LABELS: Partial<Record<StageCondition, string>> = {
  manual: "Вручную", date_before: "Прошедшие", date_today: "Сегодня", date_after: "Предстоящие",
  status_confirmed: "Статус: Подтверждено", status_pending: "Статус: Ожидает", status_cancelled: "Статус: Отменено",
  outcome_passed: "Исход: прошёл", outcome_rejected: "Исход: отказ", stage_decision: "Стадия: Решение",
}

const EMOJI_OPTIONS = ["📅", "🌅", "✅", "❌", "⏳", "🔥", "⭐", "📞", "🎯", "🏆", "🔔", "💼", "🎥", "🤝"]

// ─── Данные ──────────────────────────────────────────────────

interface Interview {
  id: string; date: Date; endAt: Date; time: string; endTime: string; candidate: string; vacancy: string; interviewer: string; type: InterviewType; format: InterviewFormat; status: InterviewStatus
  candidateId: string | null
  vacancyId: string | null
  // Контекст кандидата (из JOIN в /calendar) — для наполнения карточки.
  aiScore: number | null; resumeScore: number | null; phone: string | null; stage: string | null
  anketaFilled: boolean; tested: boolean; testScore: number | null; answersScore: number | null
  // Обогащение карточки (город/зарплата/демо/источник) — те же поля, что и на
  // карточке кандидата (components/dashboard/candidate-card.tsx).
  city: string | null; salaryMin: number | null; salaryMax: number | null; source: string | null
  demoProgressJson: DemoProgressData | null
  // Виртуальная карточка «Интервью проведено (по стадии)» — кандидат уже на
  // стадии final_decision/decision/hired, но события календаря нет (интервью
  // прошло вне системы или бронирование не создавалось). См. п.2 задачи 04.07.
  byStageOnly?: boolean
  // 1b (13.07): реальный исход интервью — calendar_events.interview_decision.
  // НЕ путать со status "Пройдено" (означает только "время истекло"). Уже
  // редактируется в components/candidates/candidate-drawer.tsx — здесь читаем
  // и дополнительно даём быструю отметку прямо с карточки (InterviewTagMenu).
  interviewDecision: InterviewDecision
}

// Кандидат вакансии на стадии interview/scheduled БЕЗ будущего события
// календаря — «ждёт назначения времени» (п.1 задачи 04.07).
interface WaitingCandidate {
  id: string; name: string; stage: string | null; phone: string | null; token: string | null
  // Номера пройденных демо-блоков (API отдаёт completedDemoBlockIndexes) — для
  // индикатора «⚠ не прошёл последнее демо» у кандидатов stage='interview'.
  // Стадию НЕ трогаем (владелец 14.07): кандидат остаётся в списке и может
  // быть записан.
  completedDemoBlockIndexes: number[]
  // Число демо-блоков ЭТОЙ вакансии (API отдаёт demoBlockDefs.length). Нужно,
  // чтобы бейдж считал последний блок ДИНАМИЧЕСКИ и не светился ложно на
  // вакансиях без нескольких демо (находка predeploy-guard 14.07).
  demoBlockCount: number
}

// Прошёл ли кандидат ПОСЛЕДНЕЕ демо-блок вакансии. Бейдж показываем только для
// вакансий с >1 демо-блоком (у одно-демо/легаси «последнего демо» как отдельного
// шага нет — иначе бейдж ложно светился бы на всех interview-кандидатах, находка
// predeploy-guard 14.07). Последний индекс = demoBlockCount (1-based).
function needsLastDemoBadge(c: { stage: string | null; completedDemoBlockIndexes: number[]; demoBlockCount: number }): boolean {
  return c.stage === "interview"
    && c.demoBlockCount > 1
    && !c.completedDemoBlockIndexes.includes(c.demoBlockCount)
}

// ВРЕМЕННАЯ РАЗОВАЯ ПОМЕТКА (не системная фича!) — 14.07.2026.
// Координатор вручную сверил nginx-логи (IP ручных кликов HR) с БД и
// forensic-путём определил именно этих 20 кандидатов вакансии «Менеджер по
// продажам IT (удалённо, B2B) от 170К» (Revoluterra, vacancy_id
// 6916db01-a765-4c4e-a652-81475566f95b), которых HR вручную поставил на
// стадию «ждёт назначения времени» этой ночью. Это НЕ общий признак
// «кандидата пригласили вручную» — у нас нет надёжного поля для этого:
// большинство ручных действий HR не пишут в stage_history (выяснено в ходе
// того же разбора 14.07). Список — просто фиксированный набор id для
// одноразовой визуальной сортировки в секции «Ждут назначения времени».
// Применяется только если id кандидата совпал (не завязано на vacancyId),
// так что на других вакансиях раздел просто не появляется.
// После того как HR обработает этих кандидатов (или на следующем большом
// рефакторе секции), эту константу и связанную с ней сортировку/разделитель
// можно и нужно удалить — она не должна жить в коде постоянно.
const MANUAL_FORENSIC_MARK_20260714 = new Set<string>([
  "043096da-d1ab-4d0a-a4d9-1711b40a5af9",
  "0c33d2be-8553-4fc4-b93d-1025d85c9e49",
  "0eec29fb-7ca4-4861-8378-7af6e43d8031",
  "1f56d94f-b446-4474-96ba-0a9256e549e7",
  "21398d69-e01b-4f72-ad68-cde7d515bb96",
  "28f8705d-8f79-4f4f-8641-00934e9d3916",
  "3169a9fb-0314-403b-897e-4af8845a07ce",
  "39e4910c-34b9-4f75-ab57-52b13ba5b370",
  "3fa50072-9c5d-4b82-be9b-77c04ac8fd5e",
  "77a7914b-0954-459a-91c5-ab31803578f6",
  "a9f0101b-f7f3-46ec-99ec-538cbadf3d0e",
  "b6c7d637-84a3-477e-90be-1161293f845c",
  "b90e4c2c-2674-4741-a425-3def43ece66e",
  "baacfa55-25b7-4626-bcf9-26d88fd4fed1",
  "c2d9fa88-5755-40cc-9710-74e3f20dab5f",
  "c714ad97-9806-43a3-abfd-ff470d07219b",
  "cd2f0ce7-ab32-4fdf-afc4-b036f3bbffd0",
  "d397fab6-7559-47b0-bc6a-13b5bc2427b1",
  "d7c14302-0044-4690-8879-fa2f82a2d1cc",
  "fd56367b-b315-444f-9622-20a401c90e47",
])

const today2 = new Date()

// Событие календаря type='interview' → форма Interview для этой страницы.
// candidate берём из title (HR его и заполняет), vacancy — по vacancyId через
// мапу названий. Статус: cancelled→Отменено, прошедшее→Пройдено, tentative→Ожидает,
// иначе Подтверждено. Тип/формат — из структурных полей, дефолты для старых событий.
interface CalEvent {
  id: string; title: string; startAt: string; endAt: string; status: string | null
  vacancyId: string | null; candidateId: string | null; interviewer: string | null; interviewType: string | null; interviewFormat: string | null
  interviewStatus: string | null
  // Уже существующее поле события (drizzle "Воронка v2 Фаза 2", см. schema.ts
  // calendarEvents.interviewDecision) — getTableColumns в GET /calendar
  // отдаёт его как есть, без переименования.
  interviewDecision?: string | null
  candAiScore?: number | null; candResumeScore?: number | null; candScore?: number | null; candPhone?: string | null; candStage?: string | null
  candAnketaFilled?: boolean; candTested?: boolean; candTestScore?: number | null; candAnswersScore?: number | null
  candCity?: string | null; candSalaryMin?: number | null; candSalaryMax?: number | null; candSource?: string | null
  candDemoProgressJson?: DemoProgressData | null
}
function timeStr(dt: Date): string {
  return `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`
}
// В разделе «Интервью» префикс «Интервью — » в заголовке события избыточен
// (мы и так в разделе интервью) и съедает место под ФИО — обрезает его.
// Показываем только ФИО. Тот же регэксп уже применяется в диалогах отмены/переноса.
function stripInterviewPrefix(title: string): string {
  return title.replace(/^Интервью\s*—\s*/, "")
}
// Желаемая зарплата — формат как на карточке кандидата (candidate-card.tsx).
// null/0 в обоих полях → ничего не показываем.
function formatSalaryRange(min: number | null, max: number | null): string | null {
  if (!min && !max) return null
  const lo = min ? min.toLocaleString("ru-RU") : "…"
  const hi = max ? max.toLocaleString("ru-RU") : "…"
  return min && max ? `${lo} – ${hi} руб.` : `${min ? "от " : "до "}${min ? lo : hi} руб.`
}
function mapEventToInterview(ev: CalEvent, vacMap: Map<string, string>): Interview {
  const start = new Date(ev.startAt)
  const end = new Date(ev.endAt)
  const now = new Date()
  const ALL_ST = ["Подтверждено", "Ожидает", "Пройдено", "Не явился", "Отменено"] as const
  let status: InterviewStatus
  if (ev.interviewStatus && (ALL_ST as readonly string[]).includes(ev.interviewStatus)) {
    status = ev.interviewStatus as InterviewStatus
  } else if (ev.status === "cancelled") status = "Отменено"
  else if (end < now) status = "Пройдено"
  else if (ev.status === "tentative") status = "Ожидает"
  else status = "Подтверждено"
  const type: InterviewType = (["Техническое", "HR", "Финальное"] as const).includes(ev.interviewType as InterviewType)
    ? (ev.interviewType as InterviewType) : "HR"
  const format: InterviewFormat = ev.interviewFormat === "Офис" ? "Офис" : ev.interviewFormat === "Звонок" ? "Звонок" : "Онлайн"
  const DECISION_VALUES = ["advance", "offer", "reject", "reserve"] as const
  const interviewDecision: InterviewDecision = (DECISION_VALUES as readonly string[]).includes(ev.interviewDecision ?? "")
    ? (ev.interviewDecision as InterviewDecision) : null
  return {
    id: ev.id,
    date: start,
    endAt: end,
    time: timeStr(start),
    endTime: timeStr(end),
    candidate: stripInterviewPrefix(ev.title || "Интервью"),
    vacancy: (ev.vacancyId && vacMap.get(ev.vacancyId)) || "—",
    interviewer: ev.interviewer || "—",
    type, format, status,
    candidateId: ev.candidateId ?? null,
    vacancyId: ev.vacancyId ?? null,
    aiScore: ev.candAiScore ?? ev.candResumeScore ?? null,
    resumeScore: ev.candResumeScore ?? null,
    phone: ev.candPhone ?? null,
    stage: ev.candStage ?? null,
    anketaFilled: ev.candAnketaFilled ?? false,
    tested: ev.candTested ?? false,
    testScore: ev.candTestScore ?? null,
    answersScore: ev.candAnswersScore ?? null,
    city: ev.candCity ?? null,
    salaryMin: ev.candSalaryMin ?? null,
    salaryMax: ev.candSalaryMax ?? null,
    source: ev.candSource ?? null,
    demoProgressJson: ev.candDemoProgressJson ?? null,
    interviewDecision,
  }
}

// ─── Утилиты ────────────────────────────────────────────────

// Юрий 10.07: parseInt("16:15") даёт 16 (останавливается на «:», минуты
// теряются) — при переносе интервью с длительностью меньше часа в пределах
// того же часа (16:00-16:15) разница «endTime - time» считалась как 0,
// и новое время после переноса получалось «18:00-18:00». Считаем в минутах.
function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number)
  return (h || 0) * 60 + (m || 0)
}
function minutesToTime(mins: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, mins))
  const h = Math.floor(clamped / 60)
  const m = clamped % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

// Цвет числового скоринга (0..100): зелёный/янтарный/красный.
function scoreColor(n: number | null | undefined): string {
  if (n == null) return "text-muted-foreground"
  if (n >= 70) return "text-emerald-600 dark:text-emerald-400"
  if (n >= 40) return "text-amber-600 dark:text-amber-400"
  return "text-red-600 dark:text-red-400"
}

const STATUS_STYLES: Record<InterviewStatus, string> = {
  "Подтверждено": "bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800",
  "Ожидает": "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800",
  "Пройдено": "bg-gray-100 text-gray-600 border-gray-300 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700",
  "Не явился": "bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800",
  "Отменено": "bg-gray-100 text-gray-500 border-gray-200 dark:bg-gray-800 dark:text-gray-500 dark:border-gray-700",
}
const STATUS_DOT: Record<InterviewStatus, string> = {
  "Подтверждено": "bg-emerald-500", "Ожидает": "bg-amber-500", "Пройдено": "bg-gray-400", "Не явился": "bg-red-500", "Отменено": "bg-gray-300",
}

// Легенда цветов статусов — общая для Недели/Месяца/Дня.
function StatusLegend({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-4 flex-wrap", className)}>
      {(Object.entries(STATUS_DOT) as [InterviewStatus, string][]).map(([s, c]) => (
        <div key={s} className="flex items-center gap-1.5">
          <div className={cn("w-3 h-3 rounded-full", c)} />
          <span className="text-[10px] text-muted-foreground">{s}</span>
        </div>
      ))}
    </div>
  )
}

function isSameDay(a: Date, b: Date) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate() }
function isToday(dd: Date) { return isSameDay(dd, new Date()) }
function formatDateShort(dd: Date) { return dd.toLocaleDateString("ru-RU", { day: "numeric", month: "short" }) }
function formatDayFull(dd: Date) { return dd.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" }) }

// Дропдаун ручного тегирования карточки интервью (1a) + ручной отметки исхода
// (1b, outcome_passed). Показывается только если у компании реально есть
// кастомная стадия "Вручную" или "Исход: прошёл" — иначе это мёртвый UI на
// каждой карточке. Хук-состояние живёт выше (InterviewsView), сюда прилетают
// только данные + колбэки — компонент вынесен на модульный уровень (не внутрь
// InterviewsView), чтобы не пересоздаваться на каждый рендер родителя.
function InterviewTagMenu({
  iv, manualStages, hasOutcomeStage, manualAssignments, onToggleStage, onSetDecision,
}: {
  iv: Interview
  manualStages: Stage[]
  hasOutcomeStage: boolean
  manualAssignments: ManualAssignments
  onToggleStage: (interviewId: string, stageId: string) => void
  onSetDecision: (interviewId: string, decision: InterviewDecision) => void
}) {
  if (manualStages.length === 0 && !hasOutcomeStage) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground"
          onClick={e => e.stopPropagation()}
          title="Кастомные теги / исход"
        >
          <Tag className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56" onClick={e => e.stopPropagation()}>
        {manualStages.length > 0 && (
          <>
            <DropdownMenuLabel className="text-[10px] text-muted-foreground">Кастомные стадии</DropdownMenuLabel>
            {manualStages.map(s => {
              const active = (manualAssignments[s.id] ?? []).includes(iv.id)
              return (
                <DropdownMenuCheckboxItem
                  key={s.id}
                  checked={active}
                  onSelect={e => e.preventDefault()}
                  onCheckedChange={() => onToggleStage(iv.id, s.id)}
                >
                  <span className="mr-1.5">{s.emoji}</span>{s.name}
                </DropdownMenuCheckboxItem>
              )
            })}
          </>
        )}
        {hasOutcomeStage && (
          <>
            {manualStages.length > 0 && <DropdownMenuSeparator />}
            {/* Пишет то же поле, что и вкладка «История» в карточке кандидата
                (calendar_events.interview_decision) — не параллельное хранилище. */}
            <DropdownMenuLabel className="text-[10px] text-muted-foreground">Исход интервью</DropdownMenuLabel>
            {INTERVIEW_DECISION_OPTIONS.map(opt => (
              <DropdownMenuCheckboxItem
                key={opt.id}
                checked={iv.interviewDecision === opt.id}
                onSelect={e => e.preventDefault()}
                onCheckedChange={() => onSetDecision(iv.id, iv.interviewDecision === opt.id ? null : opt.id)}
              >
                {opt.label}
              </DropdownMenuCheckboxItem>
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// Стадии, к которым HR может двигать кандидата ПОСЛЕ интервью (канон lib/stages.ts,
// sortOrder > interview). Порядок — как в воронке.
// «Рекомендации» (reference_check) убраны из меню 15.07 по решению владельца —
// стадия не нужна в рабочем процессе. Из канона lib/stages.ts слаг НЕ удаляем:
// на нём стоят живые кандидаты, он используется в блоках конструктора воронки
// и кронах. Здесь только перестаём предлагать переход туда.
const NEXT_STAGE_SLUGS: StageSlug[] = ["decision", "offer_sent", "hired"]

// Порядковый номер стадии в каноне (для гарда «не откатывать назад»). Легаси/
// неизвестные слаги (talent_pool и т.п.) → -1 (в гарде форвард-переходов не участвуют).
function stageOrder(slug: string | null | undefined): number {
  return slug && slug in PLATFORM_STAGES ? PLATFORM_STAGES[slug as StageSlug].sortOrder : -1
}

// B (14.07): ручная отметка исхода прошедшего интервью. Оффер / следующий шаг
// воронки / не пришёл / перенесён / отказ — прямо с карточки. Пишет
// interviewDecision|interviewOutcome на событие и двигает стадию кандидата
// (через колбэки родителя). Показывается только на ПРОШЕДШИХ реальных карточках.
function InterviewOutcomeMenu({
  iv, onOffer, onMoveStage, onOutcome, onReject,
}: {
  iv: Interview
  onOffer: (iv: Interview) => void
  onMoveStage: (iv: Interview, slug: StageSlug) => void
  onOutcome: (iv: Interview, outcome: "no_show" | "rescheduled") => void
  onReject: (iv: Interview) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline" size="sm" className="gap-1 text-xs h-7"
          onClick={e => e.stopPropagation()}
          title="Отметить исход интервью"
        >
          <ClipboardCheck className="h-3.5 w-3.5" /> Отметить исход
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56" onClick={e => e.stopPropagation()}>
        <DropdownMenuLabel className="text-[10px] text-muted-foreground">Исход интервью</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => onOffer(iv)}>💼 Оффер</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-[10px] text-muted-foreground">Двигать к стадии</DropdownMenuLabel>
        {NEXT_STAGE_SLUGS.map(slug => (
          <DropdownMenuItem key={slug} onSelect={() => onMoveStage(iv, slug)}>
            {getStageLabel(slug)}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onOutcome(iv, "no_show")}>🚫 Не пришёл</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onOutcome(iv, "rescheduled")}>🔄 Перенесён</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => onReject(iv)}>
          ❌ Отказать
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function MiniCard({ iv, compact }: { iv: Interview; compact?: boolean }) {
  return (
    <div className={cn("rounded-lg border p-2 transition-all cursor-pointer", STATUS_STYLES[iv.status], compact && "p-1.5")}>
      <div className="flex items-center gap-1.5">
        <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", STATUS_DOT[iv.status])} />
        <span className={cn("font-medium truncate", compact ? "text-[10px]" : "text-xs")}>{iv.time}</span>
        <span className={cn("truncate", compact ? "text-[10px]" : "text-xs")}>{iv.candidate}</span>
      </div>
      {!compact && <p className="text-[10px] text-muted-foreground truncate mt-0.5 pl-3">{iv.vacancy}</p>}
    </div>
  )
}

// ─── Внутренний компонент (читает searchParams) ──────────────

export function InterviewsView({ vacancyId, embedded, calendarOnly }: { vacancyId?: string; embedded?: boolean; calendarOnly?: boolean } = {}) {
  const router = useRouter()

  // Список интервью можно свернуть/развернуть под основным CalendarView
  // Верхний переключатель раздела: богатый вид интервью (стадии/канбан/список)
  // vs полный календарь компании. По умолчанию — «Интервью» (как было до мерджа).
  const [topTab, setTopTab] = useState<"interviews" | "calendar">(calendarOnly ? "calendar" : "interviews")

  const [view, setView] = useState<ViewMode>("list")
  const [interviews, setInterviews] = useState<Interview[]>([])
  // Кандидаты вакансии на стадии interview/scheduled без будущего события —
  // «Ждут назначения времени» (только в embedded-режиме, есть vacancyId).
  const [waitingCandidates, setWaitingCandidates] = useState<WaitingCandidate[]>([])
  // Кандидаты вакансии на стадии final_decision/decision/hired без ПРОШЕДШЕГО
  // события type=interview — «Интервью проведено (по стадии)», виртуальные
  // карточки в «Прошедшие» (п.2 задачи 04.07). Ключ — id кандидата, значение —
  // стадия (для бейджа/лейбла).
  const [passedByStageCandidates, setPassedByStageCandidates] = useState<{ id: string; name: string; stage: string }[]>([])
  const [vacOptions, setVacOptions] = useState<{ id: string; title: string }[]>([])
  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [cName, setCName] = useState("")
  // Кандидат, для которого открыт диалог из секции «Ждут назначения времени» —
  // прокидывается в POST /calendar как candidateId, чтобы событие связалось с карточкой.
  const [cCandidateId, setCCandidateId] = useState<string | null>(null)
  // Поиск кандидата по ФИО в выбранной вакансии (Юрий 04.07).
  const [candSearch, setCandSearch] = useState<Array<{ id: string; name: string; stage: string | null }>>([])
  const [candSearchLoading, setCandSearchLoading] = useState(false)
  const candSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Стадии/активная стадия объявлены здесь (а не ниже по файлу, как раньше),
  // потому что эффект загрузки company-level настроек чуть ниже пишет в них
  // через setStages при первом рендере.
  const [stages, setStages] = useState<Stage[]>(DEFAULT_STAGES)
  // Таб по умолчанию — «Сегодня» (решение владельца 15.07, было "all"). Если
  // у компании кастомный набор без стадии "today" — currentStage ниже падает
  // на stages[0], фоллбэк не ломается.
  const [activeStage, setActiveStage] = useState<string>("today")
  // Длительность по виду интервью из настроек компании (звонок/онлайн/офис).
  const [methodDurations, setMethodDurations] = useState<Record<string, number>>({})
  // 1a/1c: ручные назначения кастомного тега на интервью — persist на сервере
  // (hiring_defaults_json), тот же company-level источник, что и кастомные
  // стадии (см. эффект ниже). Исход интервью (1b) — НЕ здесь, читает/пишет
  // существующее calendar_events.interview_decision через interviews-state.
  const [manualAssignments, setManualAssignments] = useState<ManualAssignments>({})
  useEffect(() => {
    let cancelled = false
    fetch("/api/modules/hr/company/hiring-defaults")
      .then(r => r.ok ? r.json() : null)
      .then(j => {
        if (cancelled) return
        const hd = (j?.hiringDefaults ?? {}) as {
          schedule?: { interviewMethodConfigs?: Array<{ method: string; enabled?: boolean; duration?: number }> }
          interviewStages?: Stage[]
          interviewManualAssignments?: ManualAssignments
        }
        const cfgs = hd?.schedule?.interviewMethodConfigs
        if (Array.isArray(cfgs)) {
          const map: Record<string, number> = {}
          for (const c of cfgs) {
            if (!c?.enabled || !c.duration) continue
            if (c.method === "phone") map["Звонок"] = c.duration
            else if (c.method === "office") map["Офис"] = c.duration
            else map["Онлайн"] = map["Онлайн"] ?? c.duration
          }
          setMethodDurations(map)
        }
        // 1c + 14.07: стадии — сервер, если там уже что-то есть. migrateInterviewStages
        // приводит их к набору из 5 табов (убирает «Повторные»/«Прошёл», добирает
        // «Отменённые»); если что-то изменилось — перезаписываем сохранённый список.
        if (Array.isArray(hd.interviewStages) && hd.interviewStages.length > 0) {
          const { stages: migrated, changed } = migrateInterviewStages(hd.interviewStages)
          setStages(migrated)
          if (changed) {
            void fetch("/api/modules/hr/company/hiring-defaults", {
              method: "PATCH", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ interviewStages: migrated }),
            }).catch(() => {})
          }
        } else {
          // Одноразовая миграция: у этого HR в ЭТОМ браузере могли остаться
          // кастомные стадии из старого localStorage-хранилища (баг 1c) —
          // поднимаем их на сервер один раз, чтобы не потерять («Revoluterra»
          // кейс из отчёта координатора).
          const legacy = loadLocalStagesLegacy()
          if (legacy) {
            const { stages: migrated } = migrateInterviewStages(legacy)
            setStages(migrated)
            void fetch("/api/modules/hr/company/hiring-defaults", {
              method: "PATCH", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ interviewStages: migrated }),
            }).catch(() => {})
          }
        }
        if (hd.interviewManualAssignments) setManualAssignments(hd.interviewManualAssignments)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  // 1c: сохранить список стадий целиком (замена локального saveStages()).
  const saveStagesToServer = useCallback((next: Stage[]) => {
    void fetch("/api/modules/hr/company/hiring-defaults", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ interviewStages: next }),
    }).catch(() => {})
  }, [])

  // 1a: включить/выключить кастомный тег стадии на интервью. Мердж по одной
  // стадии на сервере (interviewManualAssignments в NESTED_KEYS роута) — не
  // затирает назначения других стадий, сделанные параллельно.
  const toggleManualStage = useCallback((interviewId: string, stageId: string) => {
    setManualAssignments(prev => {
      const cur = new Set(prev[stageId] ?? [])
      if (cur.has(interviewId)) cur.delete(interviewId); else cur.add(interviewId)
      const forStage = Array.from(cur)
      void fetch("/api/modules/hr/company/hiring-defaults", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interviewManualAssignments: { [stageId]: forStage } }),
      }).catch(() => {})
      return { ...prev, [stageId]: forStage }
    })
  }, [])

  // 1b: ручная отметка исхода интервью (condition:"outcome_passed"). Пишет
  // ТОЛЬКО существующее calendar_events.interview_decision через уже готовый
  // PATCH /api/modules/hr/calendar/[id] — тот же канал, что и вкладка
  // «История» в карточке кандидата (candidate-drawer.tsx), никакого
  // параллельного хранилища для исхода не заводим.
  const setInterviewDecision = useCallback((interviewId: string, decision: InterviewDecision) => {
    setInterviews(prev => prev.map(iv => iv.id === interviewId ? { ...iv, interviewDecision: decision } : iv))
    void fetch(`/api/modules/hr/calendar/${interviewId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ interviewDecision: decision }),
    }).catch(() => {})
  }, [])
  const searchCandidates = useCallback((q: string, vacId: string) => {
    if (candSearchTimer.current) clearTimeout(candSearchTimer.current)
    if (!q.trim() || !vacId) { setCandSearch([]); return }
    candSearchTimer.current = setTimeout(async () => {
      try {
        setCandSearchLoading(true)
        const res = await fetch(`/api/modules/hr/candidates?vacancyId=${vacId}&pageSize=8&search=${encodeURIComponent(q.trim())}`)
        if (!res.ok) { setCandSearch([]); return }
        const j = await res.json()
        setCandSearch((j.candidates ?? []).map((c: { id: string; name: string; stage?: string | null }) => ({ id: c.id, name: c.name, stage: c.stage ?? null })))
      } catch { setCandSearch([]) } finally { setCandSearchLoading(false) }
    }, 300)
  }, [])
  const [cVacancyId, setCVacancyId] = useState("")
  const [cDate, setCDate] = useState("")
  const [cTime, setCTime] = useState("10:00")
  const [cDuration, setCDuration] = useState("45")
  const [cInterviewer, setCInterviewer] = useState("")
  const [cType, setCType] = useState("HR")
  const [cFormat, setCFormat] = useState("Онлайн")
  // Доп. интервьюеры (участники-пользователи): руководитель/директор и т.п.
  const [cInterviewerIds, setCInterviewerIds] = useState<string[]>([])
  const [teamMembers, setTeamMembers] = useState<{ id: string; name: string }[]>([])
  const [currentUser, setCurrentUser] = useState<{ id: string; name: string } | null>(null)
  const [calMonth, setCalMonth] = useState(today2.getMonth())
  const [calYear, setCalYear] = useState(today2.getFullYear())
  const [dayOffset, setDayOffset] = useState(0)
  const [weekOffset, setWeekOffset] = useState(0)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [dragIdx, setDragIdx] = useState<number | null>(null)

  const [dragIvId, setDragIvId] = useState<string | null>(null)
  const [dropTargetHour, setDropTargetHour] = useState<number | null>(null)
  const [dropTargetDay, setDropTargetDay] = useState<string | null>(null)
  const [dropTargetStatus, setDropTargetStatus] = useState<InterviewStatus | null>(null)

  // Диалог «Уведомить кандидата о переносе?» (11.07) — честная замена легаси-
  // диалога, чьё «Да, уведомить» показывало тост об отправке, ничего не
  // отправляя. Теперь: предпросмотр/редактирование шаблона interview_rescheduled
  // (StageMessageControl), реальная отправка через reschedule-and-notify (роут
  // перезаписывает startAt/endAt и рендерит {{new_date}}/{{new_time}} из них —
  // сообщение совпадает с сохранённым временем, даже если фоновый PATCH из
  // updateInterview не дошёл), тост по факту messageSent.
  const [reschedDialog, setReschedDialog] = useState<{
    iv: Interview; startAt: Date; endAt: Date; label: string
  } | null>(null)
  const [reschedSendMessage, setReschedSendMessage] = useState(true)
  const [reschedMessageText, setReschedMessageText] = useState("")
  const [reschedSubmitting, setReschedSubmitting] = useState(false)
  const [reschedSavingTemplate, setReschedSavingTemplate] = useState(false)
  const [reschedPreview, setReschedPreview] = useState<{ loading: boolean; hasMessage: boolean }>({ loading: false, hasMessage: false })

  const saveRescheduleTemplate = async () => {
    if (!reschedDialog?.iv.vacancyId) { toast.error("Не удалось определить вакансию"); return }
    setReschedSavingTemplate(true)
    try {
      const res = await fetch(`/api/modules/hr/vacancies/${reschedDialog.iv.vacancyId}/ai-settings`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interviewRescheduledMessage: reschedMessageText }),
      })
      if (!res.ok) throw new Error()
      toast.success("Шаблон сохранён для этой вакансии")
    } catch { toast.error("Не удалось сохранить шаблон") }
    finally { setReschedSavingTemplate(false) }
  }

  const submitRescheduleNotify = async () => {
    if (!reschedDialog) return
    setReschedSubmitting(true)
    try {
      const res = await fetch(`/api/modules/hr/calendar/${reschedDialog.iv.id}/reschedule-and-notify`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: reschedMessageText,
          startAt: reschedDialog.startAt.toISOString(),
          endAt: reschedDialog.endAt.toISOString(),
        }),
      })
      if (!res.ok) throw new Error()
      const json = await res.json().catch(() => null) as { messageSent?: boolean } | null
      // Тост — по фактическому исходу отправки, не по нажатой кнопке.
      if (json?.messageSent) {
        toast.success("Кандидату отправлено сообщение о новом времени")
      } else {
        toast.warning("Перенос сохранён, но сообщение не доставлено — предупредите кандидата вручную")
      }
      setReschedDialog(null)
    } catch { toast.error("Не удалось отправить сообщение") }
    finally { setReschedSubmitting(false) }
  }

  // Диалог отмены интервью менеджером (Юрий 10.07): вкладка «Отменить» —
  // приглашение перезаписаться (слот освобождается, кандидат не отклоняется);
  // вкладка «Отказать» — реальный отказ (та же механика, что и обычный
  // отказ на карточке кандидата). Обе — с предпросмотром/редактированием
  // текста и опцией сохранить правку как новый шаблон вакансии.
  const [cancelDialogIv, setCancelDialogIv] = useState<Interview | null>(null)
  const [cancelTab, setCancelTab] = useState<"reschedule" | "reject">("reschedule")
  const [cancelSendMessage, setCancelSendMessage] = useState(true)
  const [cancelMessageText, setCancelMessageText] = useState("")
  const [cancelRejectReason, setCancelRejectReason] = useState("")
  const [cancelSubmitting, setCancelSubmitting] = useState(false)
  const [cancelSavingTemplate, setCancelSavingTemplate] = useState(false)
  // Состояние предпросмотра шаблона (guard 11.07): пока превью грузится —
  // сабмит заблокирован, а тост об отправке строится по факту, не по чекбоксу.
  const [cancelPreview, setCancelPreview] = useState<{ loading: boolean; hasMessage: boolean }>({ loading: false, hasMessage: false })

  const openCancelDialog = (iv: Interview) => {
    setCancelDialogIv(iv)
    setCancelTab("reschedule")
    // Без вакансии шаблон не загрузится и отправка невозможна — тумблер
    // честно выключен, в диалоге показывается пояснение.
    setCancelSendMessage(Boolean(iv.vacancyId))
    setCancelMessageText("")
    setCancelRejectReason("")
    setCancelPreview({ loading: Boolean(iv.vacancyId), hasMessage: false })
  }

  const saveMessageTemplate = async () => {
    if (!cancelDialogIv?.vacancyId) { toast.error("Не удалось определить вакансию"); return }
    setCancelSavingTemplate(true)
    try {
      const field = cancelTab === "reject" ? "rejectMessage" : "interviewCancelledMessage"
      const res = await fetch(`/api/modules/hr/vacancies/${cancelDialogIv.vacancyId}/ai-settings`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: cancelMessageText }),
      })
      if (!res.ok) throw new Error()
      toast.success("Шаблон сохранён для этой вакансии")
    } catch { toast.error("Не удалось сохранить шаблон") }
    finally { setCancelSavingTemplate(false) }
  }

  const submitCancelDialog = async () => {
    if (!cancelDialogIv) return
    setCancelSubmitting(true)
    try {
      if (cancelTab === "reschedule") {
        // Guard 11.07: тост — по фактическому исходу, не по чекбоксу.
        const willSend = cancelSendMessage && cancelPreview.hasMessage && cancelMessageText.trim().length > 0
        if (willSend) {
          const res = await fetch(`/api/modules/hr/calendar/${cancelDialogIv.id}/cancel-and-notify`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: cancelMessageText }),
          })
          if (!res.ok) throw new Error()
          const json = await res.json().catch(() => null) as { messageSent?: boolean } | null
          if (json?.messageSent) {
            toast.success("Интервью отменено — кандидату отправлено сообщение")
          } else {
            toast.warning("Интервью отменено, но сообщение не доставлено — предупредите кандидата вручную")
          }
        } else {
          updateInterview(cancelDialogIv.id, { status: "Отменено" })
          if (cancelSendMessage) {
            toast.warning("Интервью отменено без сообщения (текст пуст) — предупредите кандидата вручную")
          } else {
            toast.success("Интервью отменено")
          }
        }
      } else {
        if (!cancelDialogIv.candidateId) { toast.error("Кандидат не привязан к записи"); return }
        // Как и в reschedule-ветке: обещаем отправку только если шаблон
        // реально есть (превью = зеркало движка отказов).
        const willSendReject = cancelSendMessage && cancelPreview.hasMessage
        const res = await fetch(`/api/modules/hr/candidates/${cancelDialogIv.candidateId}/stage`, {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            stage: "rejected",
            sendMessage: willSendReject,
            messageOverride: willSendReject && cancelMessageText.trim() ? cancelMessageText : undefined,
            rejectionReasonCategory: cancelRejectReason || null,
            rejectionInitiator: "company",
          }),
        })
        if (!res.ok) throw new Error()
        updateInterview(cancelDialogIv.id, { status: "Отменено" })
        // Отказ уходит через движок отказов (задержка вакансии) — «будет», не «уже».
        toast.success("Кандидату отказано" + (willSendReject ? " — сообщение будет отправлено" : ""))
      }
      setCancelDialogIv(null)
      await loadInterviews()
    } catch { toast.error("Не удалось выполнить действие") }
    finally { setCancelSubmitting(false) }
  }

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState("")
  const [editEmoji, setEditEmoji] = useState("")
  const [editColor, setEditColor] = useState("")
  const [editCondition, setEditCondition] = useState<StageCondition>("manual")
  const [addMode, setAddMode] = useState(false)

  // Стадии теперь грузятся с сервера (см. эффект company/hiring-defaults выше,
  // 1c) — отдельного localStorage-эффекта больше нет.

  const loadInterviews = useCallback(async () => {
    try {
      const [evRes, vacRes] = await Promise.all([
        // В embedded-режиме (таб вакансии) — только интервью этой вакансии.
        fetch(`/api/modules/hr/calendar?type=interview${vacancyId ? `&vacancyId=${vacancyId}` : ""}`),
        fetch("/api/modules/hr/vacancies?limit=200"),
      ])
      const evJson = evRes.ok ? await evRes.json() : null
      const events = (evJson?.data ?? evJson ?? []) as CalEvent[]
      const vacJson = vacRes.ok ? await vacRes.json() : null
      const vacs = (vacJson?.vacancies ?? vacJson?.data ?? []) as { id: string; title: string }[]
      setVacOptions(vacs.map(v => ({ id: v.id, title: v.title })))
      const vacMap = new Map(vacs.map(v => [v.id, v.title]))
      setInterviews(events.map(ev => mapEventToInterview(ev, vacMap)))
    } catch { setInterviews([]) }
  }, [vacancyId])
  useEffect(() => { void loadInterviews() }, [loadInterviews])

  // «Ждут назначения времени» (п.1 задачи 04.07): кандидаты вакансии на
  // стадии interview/scheduled без будущего события type=interview. Источник —
  // /api/modules/hr/candidates (то же API, что и список кандидатов): в ответе
  // уже есть nextInterviewAt (минимальный будущий interview-event по кандидату,
  // см. app/api/modules/hr/candidates/route.ts), поэтому фильтр — чисто клиентский.
  // Только в embedded-режиме (таб вакансии) — есть vacancyId.
  const loadWaitingCandidates = useCallback(async () => {
    if (!vacancyId) { setWaitingCandidates([]); return }
    try {
      // Серверный фильтр стадии: у вакансии могут быть сотни кандидатов,
      // первая страница без фильтра не содержала интервьюшников (баг 04.07).
      const [r1, r2] = await Promise.all([
        fetch(`/api/modules/hr/candidates?vacancyId=${vacancyId}&pageSize=100&stage=interview`),
        fetch(`/api/modules/hr/candidates?vacancyId=${vacancyId}&pageSize=100&stage=scheduled`),
      ])
      const res = { ok: r1.ok && r2.ok, json: async () => {
        const [j1, j2] = await Promise.all([r1.json(), r2.json()])
        return { candidates: [...(j1.candidates ?? []), ...(j2.candidates ?? [])] }
      } } as Response
      const json = res.ok ? await res.json() : null
      // apiSuccess отдаёт data напрямую (без обёртки); при pageSize — { candidates, total, ... }.
      const list = (json?.candidates ?? json ?? []) as {
        id: string; name?: string; stage?: string | null; phone?: string | null; token?: string | null; nextInterviewAt?: string | null
        completedDemoBlockIndexes?: number[]; demoBlockCount?: number
      }[]
      const waiting = (Array.isArray(list) ? list : [])
        .filter(c => (c.stage === "interview" || c.stage === "scheduled") && !c.nextInterviewAt)
        .map(c => ({
          id: c.id, name: c.name || "Без имени", stage: c.stage ?? null, phone: c.phone ?? null, token: c.token ?? null,
          completedDemoBlockIndexes: Array.isArray(c.completedDemoBlockIndexes) ? c.completedDemoBlockIndexes : [],
          demoBlockCount: typeof c.demoBlockCount === "number" ? c.demoBlockCount : 0,
        }))
      setWaitingCandidates(waiting)

      // п.2: «Передан» (final_decision) и решение/нанят — считаем интервью
      // проведённым, даже если бронирования не было (событие календаря — как
      // фильтруем отсутствие прошедшего события — ниже, через interviews).
      const PASSED_STAGES = new Set(["final_decision", "decision", "hired"])
      const passed = (Array.isArray(list) ? list : [])
        .filter(c => c.stage && PASSED_STAGES.has(c.stage))
        .map(c => ({ id: c.id, name: c.name || "Без имени", stage: c.stage as string }))
      setPassedByStageCandidates(passed)
    } catch { setWaitingCandidates([]); setPassedByStageCandidates([]) }
  }, [vacancyId])
  useEffect(() => { void loadWaitingCandidates() }, [loadWaitingCandidates])

  // Разовая сортировка «Ждут назначения времени» для forensic-пометки 14.07
  // (см. MANUAL_FORENSIC_MARK_20260714 выше) — помеченные кандидаты идут
  // первыми (порядок между ними сохраняем как пришёл от API), остальные —
  // ниже как обычно. Если ни один id не совпал, marked пуст и разделитель не рисуется.
  const waitingCandidatesSorted = useMemo(() => {
    const marked = waitingCandidates.filter(c => MANUAL_FORENSIC_MARK_20260714.has(c.id))
    const rest = waitingCandidates.filter(c => !MANUAL_FORENSIC_MARK_20260714.has(c.id))
    return { marked, rest }
  }, [waitingCandidates])

  // Текущий пользователь (для авто-интервьюера) + команда (для доп. интервьюеров).
  useEffect(() => {
    fetch("/api/auth/me").then(r => r.ok ? r.json() : null).then((j) => {
      const u = j?.user ?? j?.data ?? j
      if (u?.id) setCurrentUser({ id: u.id, name: u.name ?? u.email ?? "Я" })
    }).catch(() => {})
    fetch("/api/team").then(r => r.ok ? r.json() : null).then((j) => {
      const list = Array.isArray(j) ? j : (j?.data ?? j?.members ?? [])
      if (Array.isArray(list)) setTeamMembers(list.map((m: { id: string; name?: string; email?: string }) => ({ id: m.id, name: m.name ?? m.email ?? "—" })))
    }).catch(() => {})
  }, [])

  // Каскад видов интервью (Юрий 04.07): Звонок → Онлайн, Онлайн → Офис.
  // После Офиса следующий этап — «Передан», новое интервью не предлагаем по виду.
  const nextFormatAfter = (f: InterviewFormat): InterviewFormat =>
    f === "Звонок" ? "Онлайн" : "Офис"

  // Открыть кандидата: в контексте вакансии — боковой панелью (?candidate= диплинк
  // на табе «Кандидаты»), вне вакансии — страница кандидата (Юрий 04.07).
  const openCandidate = useCallback((candId: string, candVacancyId?: string | null) => {
    const vid = candVacancyId || vacancyId
    if (vid) router.push(`/hr/vacancies/${vid}?tab=candidates&candidate=${candId}`)
    else router.push(`/hr/candidates/${candId}`)
  }, [vacancyId, router])

  const openCreate = (prefill?: { candidateId: string; name: string; format?: InterviewFormat }) => {
    const now = new Date()
    // #2: интервьюер по умолчанию — текущий пользователь (кто назначает).
    setCName(prefill?.name ?? ""); setCCandidateId(prefill?.candidateId ?? null)
    setCVacancyId(vacancyId ?? ""); setCInterviewer(currentUser?.name ?? ""); setCType("HR")
    const fmt = prefill?.format ?? "Онлайн"
    setCFormat(fmt)
    setCInterviewerIds([]); setCTime("10:00")
    setCDuration(String(methodDurations[fmt] ?? 45))
    setCDate(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`)
    setCreateOpen(true)
  }
  const createInterview = async () => {
    if (!cName.trim() || !cDate || !cTime) { toast.error("Заполните имя кандидата, дату и время"); return }
    setCreating(true)
    try {
      const [h, m] = cTime.split(":").map(Number)
      const start = new Date(cDate); start.setHours(h, m, 0, 0)
      const end = new Date(start.getTime() + (parseInt(cDuration) || 45) * 60000)
      const res = await fetch("/api/modules/hr/calendar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: cName.trim(), type: "interview",
          startAt: start.toISOString(), endAt: end.toISOString(),
          vacancyId: cVacancyId || null, interviewer: cInterviewer || null,
          interviewType: cType, interviewFormat: cFormat,
          // Связь события с карточкой кандидата — если диалог открыт из
          // секции «Ждут назначения времени» (openCreate с prefill).
          candidateId: cCandidateId || undefined,
          // #3: доп. интервьюеры — участники события (руководитель/директор и т.п.)
          participants: cInterviewerIds.length > 0 ? cInterviewerIds : undefined,
        }),
      })
      if (!res.ok) throw new Error()
      setCreateOpen(false)
      setCCandidateId(null)
      await Promise.all([loadInterviews(), loadWaitingCandidates()])
      toast.success("Интервью запланировано")
    } catch { toast.error("Не удалось создать интервью") } finally { setCreating(false) }
  }

  // Меняет интервью локально + персистит в календарь (PATCH): перенос времени/даты
  // пишет startAt/endAt, смена статуса маппится на статус события календаря
  // (confirmed/tentative/cancelled). Тонкие статусы (Пройдено/Не явился) — в
  // interview_status, статус события — ближайший (для конфликтов/напоминаний C6).
  const updateInterview = (id: string, patch: Partial<Interview>, msg?: string) => {
    const current = interviews.find(iv => iv.id === id)
    if (msg) toast(msg)
    if (!current) {
      setInterviews(prev => prev.map(iv => iv.id === id ? { ...iv, ...patch } : iv))
      return
    }
    const merged = { ...current, ...patch }
    const body: Record<string, unknown> = {}
    // localPatch — то же, что уходит в state; при переносе синхронизируем
    // date/endAt (Date) с новыми time/endTime, иначе endAt-таб («Прошедшие»)
    // читал бы устаревшее время перенесённого события.
    const localPatch: Partial<Interview> = { ...patch }
    if (patch.time !== undefined || patch.endTime !== undefined || patch.date !== undefined) {
      const [sh, sm] = merged.time.split(":").map(Number)
      const [eh, em] = merged.endTime.split(":").map(Number)
      const start = new Date(merged.date); start.setHours(sh, sm, 0, 0)
      const end = new Date(merged.date); end.setHours(eh, em, 0, 0)
      body.startAt = start.toISOString(); body.endAt = end.toISOString()
      localPatch.date = start; localPatch.endAt = end
    }
    setInterviews(prev => prev.map(iv => iv.id === id ? { ...iv, ...localPatch } : iv))
    if (patch.status !== undefined) {
      body.interviewStatus = patch.status
      body.status = patch.status === "Отменено" || patch.status === "Не явился" ? "cancelled"
        : patch.status === "Ожидает" ? "tentative" : "confirmed"
    }
    if (Object.keys(body).length > 0) {
      fetch(`/api/modules/hr/calendar/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      }).catch(() => {})
    }
  }

  // ─── B (14.07): ручная отметка исхода прошедшего интервью ───────────────────
  // Двигает стадию кандидата через PUT /candidates/[id]/stage. Гард: не
  // откатываем назад по канону (кроме терминальных rejected/talent_pool —
  // явное решение HR). Возвращает true, если стадия сдвинута ИЛИ уже была ≥ цели.
  const moveCandidateStage = async (candidateId: string, target: string, currentStage: string | null): Promise<boolean> => {
    const terminal = target === "rejected" || target === "talent_pool"
    if (!terminal && stageOrder(currentStage) >= stageOrder(target)) return true // уже на/после цели — не двигаем назад
    const res = await fetch(`/api/modules/hr/candidates/${candidateId}/stage`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      // sendMessage:false — тихий сдвиг стадии из отметки исхода (сообщение
      // кандидату — отдельным осознанным действием, не побочным эффектом).
      body: JSON.stringify({ stage: target, sendMessage: false, ...(target === "rejected" ? { rejectionInitiator: "company" } : {}) }),
    }).catch(() => null)
    return Boolean(res?.ok)
  }

  // Пишет исход (decision/outcome) на событие через существующий PATCH /calendar/[id].
  const patchOutcome = (id: string, body: Record<string, unknown>) =>
    fetch(`/api/modules/hr/calendar/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }).catch(() => null)

  const outcomeOffer = async (iv: Interview) => {
    setInterviewDecision(iv.id, "offer")
    if (iv.candidateId) await moveCandidateStage(iv.candidateId, "offer_sent", iv.stage)
    toast.success("Исход: оффер — кандидат передвинут к «Оффер»")
    await loadInterviews()
  }

  const outcomeMoveStage = async (iv: Interview, target: StageSlug) => {
    if (!iv.candidateId) { toast.error("Кандидат не привязан к записи"); return }
    // Решение по интервью: движение к офферу/найму = «оффер», иначе «дальше».
    setInterviewDecision(iv.id, (target === "offer_sent" || target === "hired") ? "offer" : "advance")
    const ok = await moveCandidateStage(iv.candidateId, target, iv.stage)
    toast[ok ? "success" : "error"](ok ? `Кандидат → ${getStageLabel(target)}` : "Не удалось сдвинуть стадию")
    await loadInterviews()
  }

  const outcomeMark = async (iv: Interview, outcome: "no_show" | "rescheduled") => {
    // no_show дополнительно ставит статус «Не явился» на самом событии (для карточки).
    await patchOutcome(iv.id, outcome === "no_show"
      ? { interviewOutcome: "no_show", interviewStatus: "Не явился" }
      : { interviewOutcome: "rescheduled" })
    if (outcome === "no_show") {
      setInterviews(prev => prev.map(x => x.id === iv.id ? { ...x, status: "Не явился" } : x))
    }
    toast(outcome === "no_show" ? "Отмечено: кандидат не пришёл" : "Отмечено: интервью перенесено")
    await loadInterviews()
  }

  // Добавить отклонённого кандидата в резерв (talent_pool) — по подсказке ниже.
  const reserveCandidate = async (candidateId: string) => {
    const res = await fetch(`/api/modules/hr/candidates/${candidateId}/stage`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage: "talent_pool", sendMessage: false }),
    }).catch(() => null)
    toast[res?.ok ? "success" : "error"](res?.ok ? "Кандидат добавлен в резерв" : "Не удалось добавить в резерв")
  }

  const outcomeReject = async (iv: Interview) => {
    if (!iv.candidateId) { toast.error("Кандидат не привязан к записи"); return }
    const candidateId = iv.candidateId
    setInterviewDecision(iv.id, "reject")
    const ok = await moveCandidateStage(candidateId, "rejected", iv.stage)
    if (!ok) { toast.error("Не удалось отклонить кандидата"); return }
    toast.error("Кандидат отклонён")
    // Подсказка «в резерв на будущее» — только для сильных кандидатов (балл ≥ 50).
    const score = iv.aiScore ?? iv.resumeScore ?? 0
    if (score >= 50) {
      toast("Балл кандидата высокий", {
        description: "Добавить в резерв на будущее?",
        action: { label: "В резерв", onClick: () => void reserveCandidate(candidateId) },
      })
    }
    await loadInterviews()
  }

  const ivDragStart = (id: string) => setDragIvId(id)
  const ivDragEnd = () => { setDragIvId(null); setDropTargetHour(null); setDropTargetDay(null); setDropTargetStatus(null) }

  // После drag-переноса времени/дня — предложить уведомить кандидата (диалог
  // reschedDialog). Только для реальных событий с кандидатом и вакансией (иначе
  // ни канала, ни шаблона) и не отменённых. startAt/endAt считаются из тех же
  // значений, что ушли в PATCH updateInterview, — их же перезапишет
  // reschedule-and-notify при отправке.
  const offerRescheduleNotify = (iv: Interview, patch: Partial<Interview>) => {
    if (!iv.candidateId || !iv.vacancyId || iv.byStageOnly || iv.status === "Отменено") return
    const merged = { ...iv, ...patch }
    const [sh, sm] = merged.time.split(":").map(Number)
    const [eh, em] = merged.endTime.split(":").map(Number)
    if ([sh, sm, eh, em].some(n => !Number.isFinite(n))) return
    const startAt = new Date(merged.date); startAt.setHours(sh, sm, 0, 0)
    const endAt = new Date(merged.date); endAt.setHours(eh, em, 0, 0)
    if (endAt <= startAt) return
    const label = `${startAt.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })} в ${merged.time}`
    setReschedDialog({ iv, startAt, endAt, label })
    setReschedSendMessage(true)
    setReschedMessageText("")
    setReschedPreview({ loading: true, hasMessage: false })
  }

  const dayDropOnHour = (hour: number) => {
    if (dragIvId === null) return
    const iv = interviews.find(x => x.id === dragIvId)
    if (!iv) return
    const newTime = `${String(hour).padStart(2, "0")}:00`
    const durationMin = iv.endTime && iv.time ? Math.max(5, timeToMinutes(iv.endTime) - timeToMinutes(iv.time)) : 60
    const newEnd = minutesToTime(Math.min(hour * 60 + durationMin, 20 * 60))
    updateInterview(dragIvId, { time: newTime, endTime: newEnd }, `Встреча перенесена на ${newTime}`)
    offerRescheduleNotify(iv, { time: newTime, endTime: newEnd })
    ivDragEnd()
  }

  const calDropOnDay = (targetDate: Date) => {
    if (dragIvId === null) return
    const newDate = new Date(targetDate)
    const iv = interviews.find(x => x.id === dragIvId)
    if (iv) {
      newDate.setHours(iv.date.getHours(), iv.date.getMinutes())
    }
    updateInterview(dragIvId, { date: newDate }, `Встреча перенесена на ${targetDate.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}`)
    if (iv) offerRescheduleNotify(iv, { date: newDate })
    ivDragEnd()
  }

  const kanbanDropOnStatus = (status: InterviewStatus) => {
    if (dragIvId === null) return
    updateInterview(dragIvId, { status }, `Статус изменён на «${status}»`)
    ivDragEnd()
  }

  const weekDropOnSlot = (day: Date, hour: number) => {
    if (dragIvId === null) return
    const iv = interviews.find(x => x.id === dragIvId)
    if (!iv) return
    const newDate = new Date(day); newDate.setHours(hour, 0, 0, 0)
    const newTime = `${String(hour).padStart(2, "0")}:00`
    const durationMin = iv.endTime && iv.time ? Math.max(5, timeToMinutes(iv.endTime) - timeToMinutes(iv.time)) : 60
    const newEnd = minutesToTime(Math.min(hour * 60 + durationMin, 20 * 60))
    const dayLabel = day.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })
    updateInterview(dragIvId, { date: newDate, time: newTime, endTime: newEnd }, `Встреча перенесена на ${dayLabel} в ${newTime}`)
    offerRescheduleNotify(iv, { date: newDate, time: newTime, endTime: newEnd })
    ivDragEnd()
  }

  // п.3 (14.07): отменённое интервью кандидата, который позже перезаписался
  // (есть более позднее активное событие), не должно висеть НИГДЕ — прячем во
  // всех видах (список/канбан/месяц/неделя/день). Чистая логика — в
  // lib/interviews/stage-filters.ts (юнит-тест).
  const visibleInterviews = useMemo(() => hideSupersededCancelled(interviews), [interviews])

  // п.2: интервью-список для вида «Список» = реальные события + виртуальные
  // «Интервью проведено (по стадии)» для кандидатов final_decision/decision/hired
  // без ПРОШЕДШЕГО события type=interview. Виртуальная карта датируется «вчера»,
  // чтобы попадать в «Прошедшие» (date_before) и не путаться с «Предстоящими».
  // 15.07: раньше бралось "сейчас минус секунда". С тех пор как «Сегодня» стало
  // ВЕСЬ день целиком (см. lib/interviews/stage-filters.ts date_today), такая
  // дата всплывала бы в «Сегодня» — а виртуальной карте там не место: она не
  // привязана к реальному сегодняшнему времени, это лишь отметка «интервью
  // было, судя по стадии». Сутки назад — гарантированно мимо «Сегодня», при
  // этом в «Прошедшие» она попадает как и прежде.
  const interviewsForList = useMemo(() => {
    if (passedByStageCandidates.length === 0) return visibleInterviews
    const candidateIdsWithPastEvent = new Set(
      visibleInterviews.filter(iv => iv.candidateId && iv.date < new Date()).map(iv => iv.candidateId as string),
    )
    const virtualNow = new Date(Date.now() - 24 * 3600 * 1000) // сутки назад — гарантированно "не сегодня"
    const virtuals: Interview[] = passedByStageCandidates
      .filter(c => !candidateIdsWithPastEvent.has(c.id))
      .map(c => ({
        id: `stage-virtual-${c.id}`, date: virtualNow, endAt: virtualNow, time: "—", endTime: "—",
        candidate: c.name, vacancy: vacOptions.find(v => v.id === vacancyId)?.title ?? "—",
        interviewer: "—", type: "HR" as InterviewType, format: "Онлайн" as InterviewFormat, status: "Пройдено" as InterviewStatus,
        candidateId: c.id, vacancyId: vacancyId ?? null, aiScore: null, resumeScore: null, phone: null, stage: c.stage,
        anketaFilled: false, tested: false, testScore: null, answersScore: null,
        city: null, salaryMin: null, salaryMax: null, source: null, demoProgressJson: null, byStageOnly: true,
        interviewDecision: null,
      }))
    return [...visibleInterviews, ...virtuals]
  }, [visibleInterviews, passedByStageCandidates, vacOptions, vacancyId])

  const currentStage = stages.find(s => s.id === activeStage) || stages[0]
  // 1a/1b: стадии с условием "Вручную" / "Исход: прошёл" — только они рендерят
  // InterviewTagMenu на карточках (см. ниже). Компания без таких стадий не
  // видит лишний UI на каждой карточке.
  const manualStages = useMemo(() => stages.filter(s => s.condition === "manual"), [stages])
  const hasOutcomeStage = useMemo(() => stages.some(s => s.condition === "outcome_passed"), [stages])
  // "stage_decision" (гибридные табы 15.07) фильтрует по стадии кандидата в
  // воронке — stage-filters.ts называет это поле candidateStage (модуль не
  // завязан на конкретную форму Interview), здесь просто прокидываем уже
  // имеющееся Interview.stage под этим именем.
  const interviewsForFilter = useMemo(
    () => interviewsForList.map(iv => ({ ...iv, candidateStage: iv.stage })),
    [interviewsForList],
  )
  const filtered = useMemo(() => {
    if (activeStage === "all") return [...interviewsForList].sort((a, b) => a.date.getTime() - b.date.getTime())
    if (!currentStage) return []
    const result = filterByStageCondition(interviewsForFilter, currentStage.condition, {
      manualIds: new Set(manualAssignments[currentStage.id] ?? []),
    })
    return result.sort((a, b) => currentStage.condition === "date_before" ? b.date.getTime() - a.date.getTime() : a.date.getTime() - b.date.getTime())
  }, [activeStage, currentStage, interviewsForList, interviewsForFilter, manualAssignments])

  const stageCounts = useMemo(() => {
    const m: Record<string, number> = {}
    stages.forEach(s => {
      m[s.id] = filterByStageCondition(interviewsForFilter, s.condition, {
        manualIds: new Set(manualAssignments[s.id] ?? []),
      }).length
    })
    return m
  }, [stages, interviewsForFilter, manualAssignments])

  const startEdit = (stage: Stage) => {
    setEditingId(stage.id); setEditName(stage.name); setEditEmoji(stage.emoji); setEditColor(stage.color); setEditCondition(stage.condition); setAddMode(false)
  }
  const startAdd = () => {
    setEditingId(null); setEditName(""); setEditEmoji("⭐"); setEditColor("#6b7280"); setEditCondition("manual"); setAddMode(true)
  }
  const saveEdit = () => {
    if (!editName.trim()) { toast.error("Введите название"); return }
    if (addMode) {
      const newStage: Stage = { id: `stage-${Date.now()}`, name: editName, emoji: editEmoji, color: editColor, condition: editCondition, isDefault: false }
      const next = [...stages, newStage]
      setStages(next); saveStagesToServer(next)
      toast.success(`Стадия «${editName}» добавлена`)
    } else if (editingId) {
      const next = stages.map(s => s.id === editingId ? { ...s, name: editName, emoji: editEmoji, color: editColor, condition: editCondition } : s)
      setStages(next); saveStagesToServer(next)
      toast.success("Стадия обновлена")
    }
    setEditingId(null); setAddMode(false)
  }
  const deleteStage = (id: string) => {
    const next = stages.filter(s => s.id !== id)
    setStages(next); saveStagesToServer(next)
    if (activeStage === id && next.length > 0) setActiveStage(next[0].id)
    toast.error("Стадия удалена")
  }

  const handleDragStart = (idx: number) => setDragIdx(idx)
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault()
    if (dragIdx === null || dragIdx === idx) return
    const next = [...stages]; const [moved] = next.splice(dragIdx, 1); next.splice(idx, 0, moved)
    setStages(next); setDragIdx(idx)
  }
  const handleDragEnd = () => { if (dragIdx !== null) { saveStagesToServer(stages) }; setDragIdx(null) }

  const views: { mode: ViewMode; icon: typeof List; label: string }[] = [
    { mode: "list", icon: List, label: "Список" },
    { mode: "kanban", icon: LayoutGrid, label: "Канбан" },
    // «Месяц», не «Календарь» — чтобы не путать с верхним табом «Календарь» (полный календарь компании)
    { mode: "calendar", icon: CalendarDays, label: "Месяц" },
    { mode: "week", icon: CalendarRange, label: "Неделя" },
    { mode: "day", icon: Clock, label: "День" },
  ]

  const calDate = new Date(calYear, calMonth, 1)
  const monthName = calDate.toLocaleDateString("ru-RU", { month: "long", year: "numeric" })
  const firstDay = (calDate.getDay() + 6) % 7
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate()
  // Кол-во недель в сетке зависит от месяца (5 или 6) — без пустой хвостовой строки.
  const calWeeks = Math.ceil((firstDay + daysInMonth) / 7)
  const calDays = Array.from({ length: calWeeks * 7 }, (_, i) => { const dn = i - firstDay + 1; return (dn < 1 || dn > daysInMonth) ? null : new Date(calYear, calMonth, dn) })

  const viewDay = new Date(today2); viewDay.setDate(viewDay.getDate() + dayOffset)
  const dayInterviews = visibleInterviews.filter(iv => isSameDay(iv.date, viewDay)).sort((a, b) => a.time.localeCompare(b.time))
  const dayHours = Array.from({ length: 12 }, (_, i) => i + 9)

  const weekStart = useMemo(() => {
    const d = new Date(today2); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + weekOffset * 7); d.setHours(0, 0, 0, 0); return d
  }, [weekOffset])
  const weekDays = Array.from({ length: 7 }, (_, i) => { const d = new Date(weekStart); d.setDate(d.getDate() + i); return d })
  const weekLabel = `${weekDays[0].toLocaleDateString("ru-RU", { day: "numeric" })}–${weekDays[6].toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}`
  const weekDayNames = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]

  const kanbanStatuses: InterviewStatus[] = ["Ожидает", "Подтверждено", "Пройдено", "Отменено"]

  // Контент интервью-вида (одинаков для standalone и embedded). Хром
  // (сайдбар/хедер) добавляется ниже только в standalone-режиме. ВАЖНО: не
  // оборачивать во вложенный компонент — иначе ремоунт поддерева на каждый рендер.
  const inner = (
      <>
        <main className={embedded ? "bg-background" : "flex-1 overflow-auto bg-background"}>

          {/* ═══ Заголовок + переключатель Интервью/Календарь ═══
              В embedded (таб вакансии) переключатель скрыт: показываем только
              интервью-вид (общий календарь компании живёт отдельно на /hr/interviews). */}
          {!embedded && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-14 pt-5 pb-3 border-b">
            <div className="flex items-center">
              <CalendarDays className="h-5 w-5 text-violet-600 mr-2" />
              <h1 className="text-lg font-semibold">{calendarOnly ? "Календарь" : "Интервью"}</h1>
            </div>
            {/* В режиме «только календарь» (пункт меню «Календарь») переключатель
                Интервью/Календарь скрыт — управление интервью живёт в Рабочем столе. */}
            {!calendarOnly && (
            <Tabs value={topTab} onValueChange={(v) => setTopTab(v as "interviews" | "calendar")}>
              <TabsList>
                <TabsTrigger value="interviews" className="gap-1.5 text-xs"><List className="w-3.5 h-3.5" />Интервью</TabsTrigger>
                <TabsTrigger value="calendar" className="gap-1.5 text-xs"><CalendarDays className="w-3.5 h-3.5" />Календарь</TabsTrigger>
              </TabsList>
            </Tabs>
            )}
          </div>
          )}

          {/* ═══ Таб «Календарь» — основной календарь компании (только standalone) ═══ */}
          {!embedded && topTab === "calendar" && (
          <Suspense fallback={
            <div className="flex items-center justify-center h-64 text-sm text-muted-foreground">
              Загрузка календаря…
            </div>
          }>
            <CalendarView vacancyId={vacancyId} />
          </Suspense>
          )}

          {/* ═══ Таб «Интервью» — стадии/канбан/список ═══ */}
          {topTab === "interviews" && (
          <div className="bg-background">
            {/* Компактная шапка: переключатель видов слева + кнопки справа (одна строка) */}
            <div className={cn("flex items-center justify-between gap-2 flex-wrap py-3", embedded ? "" : "px-4 sm:px-14")}>
              <div className="flex items-center gap-2">
                <Tabs value={view} onValueChange={(v) => setView(v as ViewMode)}>
                  <TabsList>
                    {views.map(v => (
                      <TabsTrigger key={v.mode} value={v.mode} className="gap-1 text-xs">
                        <v.icon className="w-3.5 h-3.5" /><span className="hidden sm:inline">{v.label}</span>
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
                <Badge variant="outline" className="text-[10px] px-1.5 h-4">{visibleInterviews.length}</Badge>
                {/* В Канбане фильтр времени — компактным дропдауном прямо в шапке */}
                {view === "kanban" && (
                  <Select value={activeStage} onValueChange={setActiveStage}>
                    <SelectTrigger className="h-7 w-auto min-w-[160px] text-xs gap-1.5"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all" className="text-xs">
                        <span className="mr-1.5">🗂</span>Все · {visibleInterviews.length}
                      </SelectItem>
                      {stages.map(s => (
                        <SelectItem key={s.id} value={s.id} className="text-xs">
                          <span className="mr-1.5">{s.emoji}</span>{s.name} · {stageCounts[s.id] || 0}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="gap-1.5 h-7 text-xs" onClick={() => setSettingsOpen(true)}>
                  <Settings className="w-3 h-3" /><span className="hidden sm:inline">Настроить стадии</span>
                </Button>
                <Button size="sm" className="gap-1.5 h-7 text-xs" onClick={() => openCreate()}>
                  <Plus className="w-3 h-3" /><span className="hidden sm:inline">Запланировать интервью</span>
                </Button>
              </div>
            </div>

            <div className={cn("pb-6", embedded ? "" : "px-4 sm:px-14")}>
              {/* Фильтр по времени (стадии) — только в Списке (полный ряд табов).
                  В Канбане — компактный дропдаун в шапке. В Месяце/Неделе/Дне фильтр
                  не нужен: эти виды показывают события по датам сами (листаешь период),
                  табы там ни на что не влияли — поэтому скрыты. */}
              {view === "list" && (
                <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 mb-5">
                  <Tabs value={activeStage} onValueChange={setActiveStage}>
                    <TabsList className="w-max sm:w-auto">
                      <TabsTrigger value="all" className="gap-1.5">
                        <span>🗂</span> Все
                        {/* п.3: счётчик списка учитывает виртуальные карточки «по стадии» (только Список) */}
                        <Badge className="ml-1 text-[10px] px-1.5 h-4 bg-primary/10 text-primary">{interviewsForList.length}</Badge>
                      </TabsTrigger>
                      {stages.map(s => (
                        <TabsTrigger key={s.id} value={s.id} className="gap-1.5">
                          <span>{s.emoji}</span> {s.name}
                          <Badge className="ml-1 text-[10px] px-1.5 h-4 bg-primary/10 text-primary">{stageCounts[s.id] || 0}</Badge>
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </Tabs>
                </div>
              )}

              {/* ═══ LIST ════════════════════════════════════════ */}
              {view === "list" && (
                <div className="space-y-3">
                  {filtered.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">Нет интервью</p>}
                  {filtered.map(iv => {
                    // п.7 (15.07, решение владельца): «Сегодня» теперь весь день целиком
                    // (см. lib/interviews/stage-filters.ts date_today) — идущее/будущее и уже
                    // завершившееся сегодня оказываются в одном табе. Уже завершившееся
                    // (endAt < now) помечаем приглушённо, чтобы визуально не путать с
                    // предстоящим. Только таб «Сегодня» и только вид «Список».
                    const isEndedToday = activeStage === "today" && !iv.byStageOnly && iv.endAt < new Date()
                    return (
                    <Card key={iv.id} className={cn("overflow-hidden transition-colors hover:border-primary/40 cursor-pointer", iv.byStageOnly && "border-dashed")} onClick={() => iv.candidateId ? openCandidate(iv.candidateId) : toast.info("Кандидат не привязан к записи")}>
                      <CardContent className="p-0">
                        <div className="flex items-stretch">
                          {/* Дата/время */}
                          <div className={cn("flex flex-col items-center justify-center min-w-[68px] bg-muted/60 py-3 px-3 border-r", isEndedToday && "opacity-50")}>
                            {iv.byStageOnly ? (
                              <UserCheck className="w-5 h-5 text-muted-foreground" />
                            ) : (
                              <>
                                <span className="text-2xl font-bold leading-none">{iv.date.getDate()}</span>
                                <span className="text-[10px] font-medium text-muted-foreground mt-0.5">{iv.date.toLocaleDateString("ru-RU", { month: "short", weekday: "short" }).toUpperCase()}</span>
                                <span className="text-xs font-semibold text-primary mt-1">{iv.time}{iv.endTime ? `–${iv.endTime}` : ""}</span>
                              </>
                            )}
                          </div>
                          {/* Кандидат + контекст */}
                          <div className="flex-1 min-w-0 py-3 px-4 flex flex-col justify-center gap-1.5">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="font-semibold text-sm truncate">{iv.candidate}</span>
                              {iv.byStageOnly ? (
                                <Badge variant="outline" className="text-[10px] border-dashed">по стадии</Badge>
                              ) : (
                                <Badge variant="outline" className={cn("text-[10px]", STATUS_STYLES[iv.status])}>{iv.status}</Badge>
                              )}
                              {isEndedToday && <Badge variant="outline" className="text-[10px] text-muted-foreground">прошло</Badge>}
                              {iv.stage && <Badge variant="secondary" className="text-[10px] font-normal">{getStageLabel(iv.stage)}</Badge>}
                              {/* Бейдж прогресса демо — как на карточке кандидата (candidate-card.tsx). */}
                              {!iv.byStageOnly && (() => {
                                const demoGroup = getDemoProgressGroup(getDemoProgressPercent(iv.demoProgressJson))
                                return (
                                  <span className={cn("rounded-md px-1.5 h-5 text-[10px] font-semibold inline-flex items-center justify-center border", demoGroup.badgeClass)} title={`Демо: ${demoGroup.label}`}>
                                    {demoGroup.label}
                                  </span>
                                )
                              })()}
                            </div>
                            {iv.byStageOnly && (
                              <p className="text-xs text-muted-foreground">Интервью проведено (этап «{getStageLabel(iv.stage)}»)</p>
                            )}
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                              <Badge variant="outline" className={cn("text-[10px]", iv.type === "Техническое" ? "border-blue-200 text-blue-700 dark:text-blue-400" : iv.type === "HR" ? "border-purple-200 text-purple-700 dark:text-purple-400" : "border-green-200 text-green-700 dark:text-green-400")}>{iv.type}</Badge>
                              <span className="inline-flex items-center gap-1">{iv.format === "Онлайн" ? <Video className="w-3 h-3" /> : iv.format === "Звонок" ? <Phone className="w-3 h-3" /> : <Building2 className="w-3 h-3" />}{iv.format}</span>
                              {iv.city && <span className="inline-flex items-center gap-1"><Building2 className="w-3 h-3" />{iv.city}</span>}
                              {formatSalaryRange(iv.salaryMin, iv.salaryMax) && <span className="text-foreground/80 font-medium">{formatSalaryRange(iv.salaryMin, iv.salaryMax)}</span>}
                              <span className="truncate">Интервьюер: <span className="text-foreground font-medium">{iv.interviewer}</span></span>
                              {iv.phone && <a href={`tel:${iv.phone}`} onClick={e => e.stopPropagation()} className="inline-flex items-center gap-1 hover:text-primary"><Phone className="w-3 h-3" />{iv.phone}</a>}
                              <span className="truncate text-muted-foreground/70">· {iv.vacancy}</span>
                            </div>
                            {/* Прогресс-бар демо — тот же компонент/пропсы, что и на канбан-карточке кандидата. */}
                            {!iv.byStageOnly && (() => {
                              const { percent, completed, total } = calcDemoPercent(iv.demoProgressJson)
                              return (
                                <DemoProgressBar
                                  variant="kanban"
                                  progressPercent={percent}
                                  completedBlocks={completed}
                                  totalBlocks={total}
                                  hasVideoVizitka={iv.demoProgressJson?.hasVideoVizitka}
                                  stage={iv.stage}
                                  demoProgress={iv.demoProgressJson}
                                  className="max-w-[220px]"
                                />
                              )
                            })()}
                          </div>
                          {/* Метрики кандидата */}
                          <div className="hidden md:flex items-center gap-5 px-5 border-l">
                            <div className="flex flex-col items-center min-w-[52px]">
                              <span className="text-[9px] uppercase tracking-wide text-muted-foreground inline-flex items-center gap-0.5"><Sparkles className="w-2.5 h-2.5" />Портрет</span>
                              <span className={cn("text-base font-bold leading-tight", scoreColor(iv.resumeScore))}>{iv.resumeScore != null ? iv.resumeScore : "—"}</span>
                            </div>
                            <div className="flex flex-col items-center min-w-[52px]">
                              <span className="text-[9px] uppercase tracking-wide text-muted-foreground inline-flex items-center gap-0.5"><FileText className="w-2.5 h-2.5" />Анкета</span>
                              {iv.answersScore != null
                                ? <span className={cn("text-base font-bold leading-tight", scoreColor(iv.answersScore))}>{iv.answersScore}</span>
                                : iv.anketaFilled ? <Check className="w-5 h-5 text-emerald-600 dark:text-emerald-400" /> : <Minus className="w-5 h-5 text-muted-foreground/40" />}
                            </div>
                            <div className="flex flex-col items-center min-w-[52px]">
                              <span className="text-[9px] uppercase tracking-wide text-muted-foreground inline-flex items-center gap-0.5"><ClipboardCheck className="w-2.5 h-2.5" />Тест</span>
                              {iv.tested
                                ? (iv.testScore != null
                                    ? <span className={cn("text-base font-bold leading-tight", scoreColor(iv.testScore))}>{iv.testScore}</span>
                                    : <Check className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />)
                                : <Minus className="w-5 h-5 text-muted-foreground/40" />}
                            </div>
                          </div>
                          {/* Действие */}
                          <div className="flex items-center gap-1 px-4 border-l shrink-0">
                            {/* Каскад: после прошедшего Звонка → Онлайн, после Онлайна → Офис */}
                            {iv.status === "Пройдено" && !iv.byStageOnly && iv.candidateId && iv.format !== "Офис" && (
                              <Button
                                variant="outline" size="sm" className="gap-1 text-xs h-7"
                                onClick={(e) => { e.stopPropagation(); openCreate({ candidateId: iv.candidateId as string, name: iv.candidate, format: nextFormatAfter(iv.format) }) }}
                              >
                                Далее: {nextFormatAfter(iv.format)}
                              </Button>
                            )}
                            {/* B (14.07): «Отметить исход» — только на ПРОШЕДШИХ реальных
                                карточках с кандидатом (интервью уже завершилось по времени). */}
                            {!iv.byStageOnly && iv.candidateId && iv.endAt < new Date() && iv.status !== "Отменено" && (
                              <InterviewOutcomeMenu
                                iv={iv} onOffer={outcomeOffer} onMoveStage={outcomeMoveStage}
                                onOutcome={outcomeMark} onReject={outcomeReject}
                              />
                            )}
                            {/* Юрий 10.07: менеджер отменяет интервью или отказывает — диалог
                                с предпросмотром/редактированием сообщения кандидату перед отправкой.
                                Только для будущих неотменённых. */}
                            {!iv.byStageOnly && iv.status !== "Отменено" && iv.status !== "Не явился" && iv.date > new Date() && (
                              <Button
                                variant="ghost" size="sm" className="gap-1 text-xs h-7 text-muted-foreground hover:text-destructive"
                                onClick={(e) => { e.stopPropagation(); openCancelDialog(iv) }}
                              >
                                <X className="h-3.5 w-3.5" /> Отменить
                              </Button>
                            )}
                            <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" tabIndex={-1}><ExternalLink className="h-3.5 w-3.5" /> Открыть</Button>
                            {/* 1a/1b: ручной тег кастомной стадии + ручная отметка исхода.
                                НЕ для виртуальных "по стадии" карточек (п.2 задачи 04.07) —
                                у них нет реального calendar_events.id для PATCH исхода. */}
                            {!iv.byStageOnly && (
                              <InterviewTagMenu
                                iv={iv} manualStages={manualStages} hasOutcomeStage={hasOutcomeStage}
                                manualAssignments={manualAssignments}
                                onToggleStage={toggleManualStage} onSetDecision={setInterviewDecision}
                              />
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )})}
                </div>
              )}

              {/* ═══ «Ждут назначения времени» (п.1 задачи 04.07) ═══
                  Только в embedded (таб вакансии) и только в виде «Список». Юрий 09.07:
                  ниже назначенных интервью — сначала то, что уже запланировано. */}
              {view === "list" && vacancyId && waitingCandidates.length > 0 && (
                <Card className="mt-5 border-amber-300/60 dark:border-amber-800/60 bg-amber-50/40 dark:bg-amber-950/10">
                  <CardContent className="p-4 space-y-2.5">
                    <div className="flex items-center gap-2">
                      <CalendarClock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                      <span className="text-sm font-semibold text-foreground">Ждут назначения времени</span>
                      <Badge variant="outline" className="text-[10px] px-1.5 h-4 border-amber-300 text-amber-700 dark:text-amber-400">{waitingCandidates.length}</Badge>
                    </div>
                    <div className="space-y-1.5">
                      {waitingCandidatesSorted.marked.map(c => (
                        <div key={c.id} className="flex items-center gap-2 flex-wrap rounded-lg border bg-card px-3 py-2">
                          <span className="font-medium text-sm truncate flex-1 min-w-[120px] cursor-pointer hover:text-primary" onClick={() => openCandidate(c.id)}>{c.name}</span>
                          {c.stage && <Badge variant="secondary" className="text-[10px] font-normal">{getStageLabel(c.stage)}</Badge>}
                          {needsLastDemoBadge(c) && (
                            <Badge variant="outline" className="text-[10px] font-normal border-amber-300 text-amber-700 dark:text-amber-400" title="Кандидат ещё не прошёл последнее демо — можно записать, но стоит напомнить пройти его">
                              ⚠ не прошёл демо
                            </Badge>
                          )}
                          {c.phone && <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"><Phone className="w-3 h-3" />{c.phone}</a>}
                          <div className="flex items-center gap-1.5 ml-auto">
                            {c.token && (
                              <Button
                                variant="outline" size="sm" className="h-7 text-xs gap-1"
                                onClick={() => {
                                  const url = `${window.location.origin}/schedule/${c.token}`
                                  navigator.clipboard.writeText(url).then(
                                    () => toast.success("Ссылка самозаписи скопирована"),
                                    () => toast.error("Не удалось скопировать ссылку"),
                                  )
                                }}
                              >
                                <Link2 className="w-3 h-3" /> Скопировать ссылку
                              </Button>
                            )}
                            <Button size="sm" className="h-7 text-xs gap-1" onClick={() => openCreate({ candidateId: c.id, name: c.name })}>
                              <Plus className="w-3 h-3" /> Запланировать
                            </Button>
                          </div>
                        </div>
                      ))}
                      {/* Разделитель разовой forensic-пометки 14.07 (MANUAL_FORENSIC_MARK_20260714) —
                          удалить вместе с константой, когда пометка перестанет быть нужна. */}
                      {waitingCandidatesSorted.marked.length > 0 && waitingCandidatesSorted.rest.length > 0 && (
                        <div className="my-3 border-t-2 border-dashed border-amber-400 relative">
                          <span className="absolute -top-2.5 left-2 bg-amber-50/40 dark:bg-amber-950/10 px-2 text-[10px] text-muted-foreground">остальные</span>
                        </div>
                      )}
                      {waitingCandidatesSorted.rest.map(c => (
                        <div key={c.id} className="flex items-center gap-2 flex-wrap rounded-lg border bg-card px-3 py-2">
                          <span className="font-medium text-sm truncate flex-1 min-w-[120px] cursor-pointer hover:text-primary" onClick={() => openCandidate(c.id)}>{c.name}</span>
                          {c.stage && <Badge variant="secondary" className="text-[10px] font-normal">{getStageLabel(c.stage)}</Badge>}
                          {needsLastDemoBadge(c) && (
                            <Badge variant="outline" className="text-[10px] font-normal border-amber-300 text-amber-700 dark:text-amber-400" title="Кандидат ещё не прошёл последнее демо — можно записать, но стоит напомнить пройти его">
                              ⚠ не прошёл демо
                            </Badge>
                          )}
                          {c.phone && <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"><Phone className="w-3 h-3" />{c.phone}</a>}
                          <div className="flex items-center gap-1.5 ml-auto">
                            {c.token && (
                              <Button
                                variant="outline" size="sm" className="h-7 text-xs gap-1"
                                onClick={() => {
                                  const url = `${window.location.origin}/schedule/${c.token}`
                                  navigator.clipboard.writeText(url).then(
                                    () => toast.success("Ссылка самозаписи скопирована"),
                                    () => toast.error("Не удалось скопировать ссылку"),
                                  )
                                }}
                              >
                                <Link2 className="w-3 h-3" /> Скопировать ссылку
                              </Button>
                            )}
                            <Button size="sm" className="h-7 text-xs gap-1" onClick={() => openCreate({ candidateId: c.id, name: c.name })}>
                              <Plus className="w-3 h-3" /> Запланировать
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* ═══ CALENDAR ════════════════════════════════════ */}
              {view === "calendar" && (
                <Card><CardContent className="p-4">
                  <div className="flex items-center justify-between mb-4">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { if (calMonth === 0) { setCalMonth(11); setCalYear(calYear - 1) } else setCalMonth(calMonth - 1) }}><ChevronLeft className="w-4 h-4" /></Button>
                    <span className="text-sm font-semibold capitalize">{monthName}</span>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { if (calMonth === 11) { setCalMonth(0); setCalYear(calYear + 1) } else setCalMonth(calMonth + 1) }}><ChevronRight className="w-4 h-4" /></Button>
                  </div>
                  <div className="overflow-x-auto -mx-4 sm:mx-0">
                  <div className="min-w-[560px] px-4 sm:px-0">
                  <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden border-b">
                    {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map(wd => (
                      <div key={wd} className="bg-muted/50 text-center text-[10px] font-semibold text-muted-foreground py-2">{wd}</div>
                    ))}
                    {calDays.map((day, i) => {
                      if (!day) return <div key={i} className="bg-card min-h-[150px]" />
                      const dayIvs = visibleInterviews.filter(iv => isSameDay(iv.date, day))
                      const isT = isToday(day)
                      const dayKey = day.toISOString().slice(0, 10)
                      const isDropTarget = dropTargetDay === dayKey && dragIvId !== null
                      return (
                        <div
                          key={i}
                          className={cn("bg-card min-h-[150px] p-1 border-t transition-all", isT && "bg-primary/5", isDropTarget && "ring-2 ring-primary ring-inset bg-primary/5")}
                          onDragOver={e => { e.preventDefault(); setDropTargetDay(dayKey) }}
                          onDragLeave={() => { if (dropTargetDay === dayKey) setDropTargetDay(null) }}
                          onDrop={e => { e.preventDefault(); calDropOnDay(day) }}
                        >
                          <span className={cn("text-xs font-medium", isT ? "text-primary font-bold" : "text-muted-foreground")}>{day.getDate()}</span>
                          {/* Все события дня влезают: без max-h/скролла. Строка недели
                              в grid тянется по самому загруженному дню (авто-высота),
                              min-h ячейки задаёт нижнюю границу пустого дня. */}
                          <div className="space-y-0.5 mt-0.5 pr-0.5">
                            {dayIvs.map(iv => (
                              <div
                                key={iv.id}
                                draggable
                                onDragStart={() => ivDragStart(iv.id)}
                                onDragEnd={ivDragEnd}
                                onClick={() => iv.candidateId ? openCandidate(iv.candidateId) : toast.info("Кандидат не привязан к записи")}
                                className={cn("cursor-pointer", dragIvId === iv.id && "opacity-40 scale-95")}
                              >
                                <MiniCard iv={iv} compact />
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  </div>
                  </div>
                  <StatusLegend className="mt-4 px-1" />
                </CardContent></Card>
              )}

              {/* ═══ DAY ═════════════════════════════════════════ */}
              {view === "day" && (
                <Card><CardContent className="p-4">
                  <div className="flex items-center justify-between mb-4">
                    <Button variant="ghost" size="sm" className="gap-1" onClick={() => setDayOffset(dayOffset - 1)}><ChevronLeft className="w-4 h-4" /> Вчера</Button>
                    <div className="text-center"><span className="text-sm font-semibold capitalize">{formatDayFull(viewDay)}</span>{dayOffset !== 0 && <Button variant="ghost" size="sm" className="ml-2 h-6 text-xs" onClick={() => setDayOffset(0)}>Сегодня</Button>}</div>
                    <Button variant="ghost" size="sm" className="gap-1" onClick={() => setDayOffset(dayOffset + 1)}>Завтра <ChevronRight className="w-4 h-4" /></Button>
                  </div>
                  <div className="space-y-0 border-b">
                    {dayHours.map(h => {
                      const hourIvs = dayInterviews.filter(iv => parseInt(iv.time) === h)
                      const isDropHere = dropTargetHour === h && dragIvId !== null
                      return (
                        <div
                          key={h}
                          className={cn("flex border-t min-h-[56px] transition-colors", isDropHere && "bg-primary/5")}
                          onDragOver={e => { e.preventDefault(); setDropTargetHour(h) }}
                          onDragLeave={() => { if (dropTargetHour === h) setDropTargetHour(null) }}
                          onDrop={e => { e.preventDefault(); dayDropOnHour(h) }}
                        >
                          <div className="w-16 shrink-0 py-2 pr-3 text-right text-xs text-muted-foreground font-medium">{String(h).padStart(2, "0")}:00</div>
                          <div className="flex-1 py-1 pl-2 space-y-1 relative">
                            {isDropHere && <div className="absolute top-0 left-2 right-0 h-0.5 bg-primary rounded" />}
                            {hourIvs.length === 0 && !isDropHere && <div className="h-10 rounded bg-muted/20" />}
                            {hourIvs.map(iv => (
                              <div
                                key={iv.id}
                                draggable
                                onDragStart={() => ivDragStart(iv.id)}
                                onDragEnd={ivDragEnd}
                                className={cn("rounded-lg border p-2.5 flex items-center justify-between cursor-grab active:cursor-grabbing transition-opacity", STATUS_STYLES[iv.status], dragIvId === iv.id && "opacity-40 scale-95")}
                              >
                                <div><div className="flex items-center gap-2"><span className="text-sm font-semibold">{iv.candidate}</span><Badge variant="outline" className="text-[10px]">{iv.type}</Badge></div><p className="text-xs text-muted-foreground">{iv.vacancy} · {iv.time}–{iv.endTime} · {iv.format}</p></div>
                                <Button variant="outline" size="sm" className="h-7 text-xs shrink-0" onClick={() => iv.candidateId ? openCandidate(iv.candidateId) : toast.info("Кандидат не привязан к записи")}>Открыть</Button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <StatusLegend className="mt-4 px-1" />
                </CardContent></Card>
              )}

              {/* ═══ WEEK ═════════════════════════════════════════ */}
              {view === "week" && (
                <Card><CardContent className="p-2 sm:p-4">
                  <div className="flex items-center justify-between mb-4">
                    <Button variant="ghost" size="sm" className="gap-1" onClick={() => setWeekOffset(weekOffset - 1)}><ChevronLeft className="w-4 h-4" /><span className="hidden sm:inline">Прошлая</span></Button>
                    <div className="text-center">
                      <span className="text-sm font-semibold">{weekLabel}</span>
                      {weekOffset !== 0 && <Button variant="ghost" size="sm" className="ml-2 h-6 text-xs" onClick={() => setWeekOffset(0)}>Сегодня</Button>}
                    </div>
                    <Button variant="ghost" size="sm" className="gap-1" onClick={() => setWeekOffset(weekOffset + 1)}><span className="hidden sm:inline">Следующая</span> <ChevronRight className="w-4 h-4" /></Button>
                  </div>
                  <div className="overflow-x-auto">
                    <div className="min-w-[700px]">
                      <div className="grid grid-cols-[56px_repeat(7,1fr)] border-b">
                        <div />
                        {weekDays.map((wd, i) => {
                          const isT = isToday(wd)
                          return (
                            <div key={i} className={cn("text-center py-2 text-xs font-semibold border-l", isT && "bg-primary/5")}>
                              <span className={cn(isT ? "text-primary" : "text-muted-foreground")}>{weekDayNames[i]}</span>
                              <span className={cn("ml-1", isT ? "text-primary font-bold" : "text-foreground")}>{wd.getDate()}</span>
                            </div>
                          )
                        })}
                      </div>
                      {dayHours.map(h => (
                        <div key={h} className="grid grid-cols-[56px_repeat(7,1fr)] border-b min-h-[64px]">
                          <div className="text-right pr-2 py-1 text-[10px] text-muted-foreground font-medium">{String(h).padStart(2, "0")}:00</div>
                          {weekDays.map((wd, di) => {
                            const cellIvs = visibleInterviews.filter(iv => isSameDay(iv.date, wd) && parseInt(iv.time) === h)
                            const cellKey = `${wd.toISOString().slice(0, 10)}-${h}`
                            const isDropCell = dropTargetDay === cellKey && dragIvId !== null
                            return (
                              // Задача 2 (13.07): grid-item по умолчанию не может сжаться уже
                              // min-content своего содержимого (авто-минимум колонки в CSS Grid —
                              // тот же механизм, что и у flex-item). Truncate-текст внутри
                              // interview-карточки (вложенный flex flex-col) без min-w-0 на этом
                              // уровне НЕ обрезался — длинное ФИО раздувало колонку шире 1fr, и
                              // карточка визуально залезала в столбец соседнего дня. min-w-0 +
                              // overflow-hidden жёстко клипуют колонку по границе — карточки
                              // больше никогда не выходят за пределы своего дня.
                              <div
                                key={di}
                                className={cn("border-l p-0.5 min-w-0 overflow-hidden transition-colors relative", isToday(wd) && "bg-primary/[0.02]", isDropCell && "bg-primary/10 ring-1 ring-inset ring-primary")}
                                onDragOver={e => { e.preventDefault(); setDropTargetDay(cellKey) }}
                                onDragLeave={() => { if (dropTargetDay === cellKey) setDropTargetDay(null) }}
                                onDrop={e => { e.preventDefault(); weekDropOnSlot(wd, h) }}
                              >
                                {isDropCell && <div className="absolute top-0 left-0 right-0 h-0.5 bg-primary rounded" />}
                                {cellIvs.map(iv => {
                                  const durHours = iv.endTime && iv.time
                                    ? Math.max(0.25, (timeToMinutes(iv.endTime) - timeToMinutes(iv.time)) / 60)
                                    : 1
                                  return (
                                    <div
                                      key={iv.id}
                                      draggable
                                      onDragStart={() => ivDragStart(iv.id)}
                                      onDragEnd={ivDragEnd}
                                      className={cn("rounded-md border px-2 py-1.5 text-[10px] leading-tight cursor-pointer active:cursor-grabbing mb-0.5 transition-opacity flex flex-col justify-center gap-0.5", STATUS_STYLES[iv.status], dragIvId === iv.id && "opacity-40 scale-95")}
                                      style={{ minHeight: `${durHours * 56}px` }}
                                      title={`${iv.candidate} · ${iv.type} · ${iv.format} · ${iv.time}–${iv.endTime}`}
                                      onClick={() => iv.candidateId ? openCandidate(iv.candidateId) : toast.info("Кандидат не привязан к записи")}
                                    >
                                      <span className="font-semibold flex items-center gap-1 truncate"><span className={cn("w-1.5 h-1.5 rounded-full shrink-0", STATUS_DOT[iv.status])} />{iv.time} {iv.candidate}</span>
                                      <span className="opacity-70 block truncate pl-2.5">{iv.type} · {iv.format}</span>
                                    </div>
                                  )
                                })}
                              </div>
                            )
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                  <StatusLegend className="mt-4 px-1" />
                </CardContent></Card>
              )}

              {/* ═══ KANBAN ══════════════════════════════════════ */}
              {view === "kanban" && (
                <div className="overflow-x-auto pb-4 -mx-4 px-4 sm:mx-0 sm:px-0 snap-x snap-mandatory md:snap-none">
                  <div className="flex gap-3 min-w-min">
                    {kanbanStatuses.map(status => {
                      const colIvs = filtered.filter(iv => iv.status === status)
                      const isDropCol = dropTargetStatus === status && dragIvId !== null
                      return (
                        <div
                          key={status}
                          className="w-[85vw] sm:w-72 shrink-0 snap-start"
                          onDragOver={e => { e.preventDefault(); setDropTargetStatus(status) }}
                          onDragLeave={() => { if (dropTargetStatus === status) setDropTargetStatus(null) }}
                          onDrop={e => { e.preventDefault(); kanbanDropOnStatus(status) }}
                        >
                          <div className={cn("rounded-xl px-3.5 py-2.5 mb-3 flex items-center justify-between transition-all", STATUS_STYLES[status], isDropCol && "ring-2 ring-primary")}><span className="text-sm font-semibold">{status}</span><span className="text-xs font-bold opacity-70">{colIvs.length}</span></div>
                          <div className={cn("space-y-1.5 min-h-[100px] rounded-lg p-1 transition-colors", isDropCol && "bg-primary/5")}>
                            {colIvs.map(iv => (
                              <Card
                                key={iv.id}
                                draggable
                                onDragStart={() => ivDragStart(iv.id)}
                                onDragEnd={ivDragEnd}
                                onClick={() => iv.candidateId ? openCandidate(iv.candidateId) : toast.info("Кандидат не привязан к записи")}
                                // Задача 3 (13.07, редизайн канбана): базовый <Card> задаёт py-6
                                // (24px) на внешнем div — сложенное с padding CardContent давало
                                // ~38px воздуха сверху/снизу на короткий текст. p-0 здесь снимает
                                // именно этот внешний py-6, вся плотность теперь только в
                                // CardContent ниже (полная ширина колонки не трогалась — Card уже
                                // блочный div на 100% родителя, w-full добавлен для явности).
                                className={cn("w-full p-0 transition-all cursor-pointer hover:border-primary/40 active:cursor-grabbing", dragIvId === iv.id && "opacity-40 scale-95")}
                              >
                                <CardContent className="p-3 space-y-2">
                                  <div className="flex items-start justify-between gap-2">
                                    <span className="text-[15px] font-semibold text-foreground leading-snug">{iv.candidate}</span>
                                    <div className="flex items-center gap-0.5 shrink-0">
                                      <span className="text-[11px] text-muted-foreground mt-0.5">{formatDateShort(iv.date)}</span>
                                      {/* Не для виртуальных "по стадии" карточек — см. комментарий в списочном виде. */}
                                      {!iv.byStageOnly && (
                                        <InterviewTagMenu
                                          iv={iv} manualStages={manualStages} hasOutcomeStage={hasOutcomeStage}
                                          manualAssignments={manualAssignments}
                                          onToggleStage={toggleManualStage} onSetDecision={setInterviewDecision}
                                        />
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-sm font-semibold text-primary">{iv.time}</span>
                                    {iv.stage && <Badge variant="secondary" className="text-[10px] font-normal h-5">{iv.stage}</Badge>}
                                    <Badge variant="outline" className="text-[10px] h-5">{iv.type}</Badge>
                                    <Badge variant="outline" className="text-[10px] h-5 gap-0.5">{iv.format === "Онлайн" ? <Video className="w-3 h-3" /> : iv.format === "Звонок" ? <Phone className="w-3 h-3" /> : <Building2 className="w-3 h-3" />}{iv.format}</Badge>
                                  </div>
                                  {iv.phone && <a href={`tel:${iv.phone}`} onClick={e => e.stopPropagation()} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary"><Phone className="w-3 h-3" />{iv.phone}</a>}
                                  <div className="grid grid-cols-3 gap-1 pt-2 border-t">
                                    <div className="flex flex-col items-center gap-0.5">
                                      <span className="text-[9px] uppercase tracking-wide text-muted-foreground inline-flex items-center gap-0.5"><Sparkles className="w-2.5 h-2.5" />Резюме</span>
                                      <span className={cn("text-sm font-bold leading-none", scoreColor(iv.aiScore))}>{iv.aiScore != null ? iv.aiScore : "—"}</span>
                                    </div>
                                    <div className="flex flex-col items-center gap-0.5">
                                      <span className="text-[9px] uppercase tracking-wide text-muted-foreground inline-flex items-center gap-0.5"><FileText className="w-2.5 h-2.5" />Анкета</span>
                                      {iv.anketaFilled ? <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> : <Minus className="w-4 h-4 text-muted-foreground/40" />}
                                    </div>
                                    <div className="flex flex-col items-center gap-0.5">
                                      <span className="text-[9px] uppercase tracking-wide text-muted-foreground inline-flex items-center gap-0.5"><ClipboardCheck className="w-2.5 h-2.5" />Тест</span>
                                      {iv.tested ? (iv.testScore != null ? <span className={cn("text-sm font-bold leading-none", scoreColor(iv.testScore))}>{iv.testScore}</span> : <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />) : <Minus className="w-4 h-4 text-muted-foreground/40" />}
                                    </div>
                                  </div>
                                  {/* B (14.07): «Отметить исход» на прошедших карточках канбана. */}
                                  {!iv.byStageOnly && iv.candidateId && iv.endAt < new Date() && iv.status !== "Отменено" && (
                                    <div className="pt-1">
                                      <InterviewOutcomeMenu
                                        iv={iv} onOffer={outcomeOffer} onMoveStage={outcomeMoveStage}
                                        onOutcome={outcomeMark} onReject={outcomeReject}
                                      />
                                    </div>
                                  )}
                                </CardContent>
                              </Card>
                            ))}
                            {colIvs.length === 0 && <div className="flex items-center justify-center h-20 rounded-lg border-2 border-dashed border-border/50 text-muted-foreground/40"><span className="text-xs">{isDropCol ? "Отпустите здесь" : "Пусто"}</span></div>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
          )} {/* topTab === interviews */}

        </main>

      {/* ═══ Настройка стадий — Sheet ═════════════════════════ */}
      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader><SheetTitle className="flex items-center gap-2"><Settings className="w-5 h-5" /> Настроить стадии</SheetTitle></SheetHeader>

          {/* Паддинг как у шапки (px-4) — чтобы контент выравнивался, а не «выбивался» */}
          <div className="px-4 pb-6 space-y-4">
            <div className="space-y-1.5">
              {stages.map((stage, idx) => (
                <div
                  key={stage.id}
                  draggable
                  onDragStart={() => handleDragStart(idx)}
                  onDragOver={e => handleDragOver(e, idx)}
                  onDragEnd={handleDragEnd}
                  className={cn("flex items-center gap-2 p-2.5 rounded-lg border bg-card transition-all cursor-grab active:cursor-grabbing", dragIdx === idx && "opacity-40 scale-95", editingId === stage.id && "ring-2 ring-primary")}
                >
                  <GripVertical className="w-4 h-4 text-muted-foreground/40 shrink-0" />
                  <span className="text-base shrink-0">{stage.emoji}</span>
                  <span className="text-sm font-medium text-foreground flex-1 truncate">{stage.name}</span>
                  <Badge variant="outline" className="text-[9px] shrink-0">{stageCounts[stage.id] || 0}</Badge>
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => startEdit(stage)}><Pencil className="w-3 h-3" /></Button>
                  {!stage.isDefault && (
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-destructive hover:text-destructive" onClick={() => deleteStage(stage.id)}><Trash2 className="w-3 h-3" /></Button>
                  )}
                </div>
              ))}
            </div>

            <Button variant="outline" className="w-full gap-1.5 border-dashed" onClick={startAdd}><Plus className="w-4 h-4" /> Добавить стадию</Button>

            {(editingId || addMode) && (
              <Card className="border-primary/20">
                <CardContent className="p-4 space-y-3">
                  <p className="text-sm font-semibold text-foreground">{addMode ? "Новая стадия" : "Редактирование"}</p>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Название</Label>
                    <Input value={editName} onChange={e => setEditName(e.target.value)} placeholder="Название стадии" className="h-9" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Иконка</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {EMOJI_OPTIONS.map(em => (
                        <button key={em} className={cn("w-8 h-8 rounded-lg border text-base flex items-center justify-center transition-all", editEmoji === em ? "border-primary bg-primary/10 ring-1 ring-primary" : "border-border hover:border-primary/30")} onClick={() => setEditEmoji(em)}>{em}</button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Цвет бейджа</Label>
                    <div className="flex items-center gap-2">
                      <input type="color" value={editColor} onChange={e => setEditColor(e.target.value)} className="w-9 h-9 rounded-lg border cursor-pointer" />
                      <Input value={editColor} onChange={e => setEditColor(e.target.value)} className="h-9 w-24 font-mono text-xs" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Условие попадания</Label>
                    <Select value={editCondition} onValueChange={v => setEditCondition(v as StageCondition)}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(Object.entries(CONDITION_LABELS) as [StageCondition, string][]).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" className="flex-1 gap-1" onClick={saveEdit}><Save className="w-3.5 h-3.5" /> Сохранить</Button>
                    <Button size="sm" variant="ghost" className="gap-1" onClick={() => { setEditingId(null); setAddMode(false) }}><X className="w-3.5 h-3.5" /> Отмена</Button>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="text-xs text-muted-foreground p-2">
              Дефолтные стадии нельзя удалить, только переименовать. Перетаскивайте для изменения порядка.
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* ═══ Создание интервью ════════════════════════════════ */}
      <Dialog open={createOpen} onOpenChange={o => { if (!creating) setCreateOpen(o) }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Запланировать интервью</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-1">
            <div className="space-y-1">
              <Label htmlFor="c-vacancy">Вакансия</Label>
              <Select value={cVacancyId || "none"} onValueChange={v => { setCVacancyId(v === "none" ? "" : v); setCandSearch([]); setCCandidateId(null) }}>
                <SelectTrigger id="c-vacancy"><SelectValue placeholder="Не указана" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Не указана</SelectItem>
                  {vacOptions.map(v => <SelectItem key={v.id} value={v.id}>{v.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="c-name">Кандидат *</Label>
              <Input
                id="c-name"
                value={cName}
                onChange={e => { setCName(e.target.value); setCCandidateId(null); searchCandidates(e.target.value, cVacancyId) }}
                placeholder={cVacancyId ? "Начните вводить ФИО…" : "Сначала выберите вакансию"}
                autoComplete="off"
              />
              {/* Подсказки по кандидатам выбранной вакансии */}
              {candSearch.length > 0 && !cCandidateId && (
                <div className="rounded-md border bg-popover shadow-sm divide-y max-h-52 overflow-y-auto">
                  {candSearch.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      className="w-full text-left px-3 py-1.5 text-sm hover:bg-muted/60 flex items-center justify-between gap-2"
                      onClick={() => { setCName(c.name); setCCandidateId(c.id); setCandSearch([]) }}
                    >
                      <span className="truncate">{c.name}</span>
                      {c.stage && <span className="text-[10px] text-muted-foreground shrink-0">{getStageLabel(c.stage)}</span>}
                    </button>
                  ))}
                </div>
              )}
              {candSearchLoading && <p className="text-[11px] text-muted-foreground">Ищу…</p>}
              {cCandidateId && <p className="text-[11px] text-emerald-600">Кандидат привязан — интервью появится в его карточке.</p>}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1 col-span-1">
                <Label htmlFor="c-date">Дата *</Label>
                <Input id="c-date" type="date" value={cDate} onChange={e => setCDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="c-time">Время *</Label>
                <Input id="c-time" type="time" value={cTime} onChange={e => setCTime(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="c-dur">Длит., мин</Label>
                <Input id="c-dur" type="number" min={15} step={15} value={cDuration} onChange={e => setCDuration(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="c-interviewer">Интервьюер</Label>
              <Input id="c-interviewer" value={cInterviewer} onChange={e => setCInterviewer(e.target.value)} placeholder="Кто проводит" />
              {currentUser && <p className="text-[11px] text-muted-foreground">По умолчанию — вы. Можно изменить.</p>}
            </div>
            {/* #3: доп. интервьюеры из команды (руководитель/директор и т.п.) */}
            {teamMembers.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-sm">Доп. интервьюеры</Label>
                <div className="flex flex-wrap gap-1.5">
                  {teamMembers.map(m => {
                    const sel = cInterviewerIds.includes(m.id)
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setCInterviewerIds(prev => sel ? prev.filter(x => x !== m.id) : [...prev, m.id])}
                        className={cn(
                          "rounded-full px-2.5 py-0.5 text-xs border transition-colors",
                          sel ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border hover:border-muted-foreground/60",
                        )}
                      >{m.name}</button>
                    )
                  })}
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="c-type">Тип</Label>
                <Select value={cType} onValueChange={setCType}>
                  <SelectTrigger id="c-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["Техническое", "HR", "Финальное"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="c-format">Формат</Label>
                <Select value={cFormat} onValueChange={(f) => {
                  setCFormat(f)
                  // Длительность по виду — из настроек компании (если заданы).
                  const d = methodDurations[f]
                  if (d) setCDuration(String(d))
                }}>
                  <SelectTrigger id="c-format"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["Звонок", "Онлайн", "Офис"].map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <Button className="flex-1" onClick={createInterview} disabled={creating || !cName.trim()}>
                {creating ? "Создаю…" : "Запланировать"}
              </Button>
              <Button variant="ghost" onClick={() => setCreateOpen(false)} disabled={creating}>Отмена</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ═══ Диалог отмены интервью менеджером (Юрий 10.07) ═══════════════
          Вкладка «Отменить» — приглашение перезаписаться (слот освобождается,
          кандидат остаётся в воронке). Вкладка «Отказать» — реальный отказ
          (та же механика, что и обычный отказ на карточке кандидата).
          Обе — с предпросмотром/редактированием текста + сохранением правки
          как нового шаблона вакансии. */}
      <Dialog open={!!cancelDialogIv} onOpenChange={o => { if (!o) setCancelDialogIv(null) }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-x-hidden overflow-y-auto">
          <DialogHeader className="min-w-0">
            <DialogTitle className="truncate">Интервью с {(cancelDialogIv?.candidate ?? "").replace(/^Интервью\s*—\s*/, "") || "кандидатом"}</DialogTitle>
          </DialogHeader>
          <Tabs value={cancelTab} onValueChange={v => setCancelTab(v as "reschedule" | "reject")}>
            <TabsList className="w-full">
              <TabsTrigger value="reschedule" className="flex-1">Отменить (перезаписаться)</TabsTrigger>
              <TabsTrigger value="reject" className="flex-1">Отказать</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="space-y-4 pt-2 min-w-0">
            <p className="text-sm text-muted-foreground">
              {cancelTab === "reschedule"
                ? "Запись отменяется, кандидат сможет сам выбрать новое время по своей ссылке."
                : "Кандидат переводится на стадию «Отказ»."}
            </p>
            {cancelTab === "reject" && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Причина отказа (для отчёта)</Label>
                <Select value={cancelRejectReason || "none"} onValueChange={v => setCancelRejectReason(v === "none" ? "" : v)}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Не указана" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Не указана</SelectItem>
                    {REJECTION_REASONS.map(r => (
                      <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <StageMessageControl
              stage={cancelTab === "reschedule" ? "interview_cancelled" : "rejected"}
              vacancyId={cancelDialogIv?.vacancyId ?? null}
              sendMessage={cancelSendMessage}
              onSendMessageChange={setCancelSendMessage}
              messageText={cancelMessageText}
              onMessageTextChange={setCancelMessageText}
              onPreviewState={setCancelPreview}
            />
            {!cancelDialogIv?.vacancyId && (
              <p className="text-xs text-muted-foreground">
                У интервью нет привязанной вакансии — сообщение кандидату не отправляется.
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 min-w-0">
            {cancelSendMessage && cancelMessageText.trim() && (
              <Button variant="ghost" size="sm" className="text-xs gap-1.5" onClick={saveMessageTemplate} disabled={cancelSavingTemplate}>
                {cancelSavingTemplate ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Сохранить как шаблон вакансии
              </Button>
            )}
            <div className="flex flex-wrap gap-2 ml-auto">
              <Button variant="outline" size="sm" onClick={() => setCancelDialogIv(null)} disabled={cancelSubmitting}>Отмена</Button>
              <Button
                size="sm"
                className={cn("gap-1.5", cancelTab === "reject" && "bg-destructive hover:bg-destructive/90")}
                onClick={submitCancelDialog}
                disabled={cancelSubmitting || cancelPreview.loading}
              >
                {cancelSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                {cancelTab === "reschedule" ? "Отменить интервью" : "Отказать"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ═══ Диалог «Уведомить кандидата о переносе?» (11.07) ═══════════════
          Открывается после drag-переноса времени/дня. Перенос уже применён
          (updateInterview); здесь — только сообщение кандидату: предпросмотр/
          редактирование шаблона interview_rescheduled, реальная отправка
          через reschedule-and-notify, тост по факту messageSent. */}
      <Dialog open={!!reschedDialog} onOpenChange={o => { if (!o) setReschedDialog(null) }}>
        {/* min-w-0 на детях грида DialogContent + flex-wrap на ряду кнопок —
            иначе (баг вёрстки 14.07) textarea/тумблер/кнопки вылезали за
            правую и нижнюю границы модалки (grid-item min-width:auto). */}
        <DialogContent className="max-w-lg max-h-[90vh] overflow-x-hidden overflow-y-auto">
          <DialogHeader className="min-w-0">
            <DialogTitle className="truncate">Интервью перенесено на {reschedDialog?.label}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2 min-w-0">
            <p className="text-sm text-muted-foreground">
              Можно отправить кандидату
              {(() => { const n = (reschedDialog?.iv.candidate ?? "").replace(/^Интервью\s*—\s*/, "").trim(); return n ? ` (${n})` : "" })()}
              {" "}сообщение с новым временем и ссылкой для перезаписи.
            </p>
            <StageMessageControl
              stage="interview_rescheduled"
              vacancyId={reschedDialog?.iv.vacancyId ?? null}
              sendMessage={reschedSendMessage}
              onSendMessageChange={setReschedSendMessage}
              messageText={reschedMessageText}
              onMessageTextChange={setReschedMessageText}
              onPreviewState={setReschedPreview}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 min-w-0">
            {reschedSendMessage && reschedMessageText.trim() && (
              <Button variant="ghost" size="sm" className="text-xs gap-1.5" onClick={saveRescheduleTemplate} disabled={reschedSavingTemplate}>
                {reschedSavingTemplate ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Сохранить как шаблон вакансии
              </Button>
            )}
            <div className="flex flex-wrap gap-2 ml-auto">
              <Button variant="outline" size="sm" onClick={() => setReschedDialog(null)} disabled={reschedSubmitting}>
                Не уведомлять
              </Button>
              <Button
                size="sm"
                className="gap-1.5"
                onClick={submitRescheduleNotify}
                disabled={reschedSubmitting || reschedPreview.loading || !reschedSendMessage || !reschedPreview.hasMessage || !reschedMessageText.trim()}
              >
                {reschedSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                Отправить сообщение
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      </>
  )

  if (embedded) return <div className="bg-background">{inner}</div>
  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        {inner}
      </SidebarInset>
    </SidebarProvider>
  )
}

export default function InterviewsPage() {
  return (
    <Suspense fallback={null}>
      <InterviewsView />
    </Suspense>
  )
}
