import { addDays } from "date-fns"
import { FOLLOWUP_PRESETS, FOLLOWUP_MESSAGE_SLOTS, type FollowUpPreset } from "./presets"
import { adjustToWorkingWindow, type VacancySchedule } from "@/lib/schedule/can-send-now"

export type FollowUpBranch = "not_opened" | "opened_not_finished" | "test_not_opened" | "test_opened_not_submitted"
export type ChainD0Source  = "hh_response" | "manual_review" | "branch_switch" | "test_invite" | "test_branch_switch"

export interface ScheduledTouch {
  campaignId:     string
  candidateId:    string
  scheduledAt:    Date
  touchNumber:    number
  channel:        "hh"
  messageText:    string
  status:         "pending"
  branch:         FollowUpBranch
  chainD0:        Date
  chainD0Source:  ChainD0Source
}

// Готовит массив длиной FOLLOWUP_MESSAGE_SLOTS, в котором пустые слоты
// подменены дефолтами. Нужен потому что preset.messageIndexes может
// ссылаться на любой слот 0..8, а кастомные значения из БД могут быть
// короче (старые значения soft из БД были массивом 5/7/10 строк).
export function mergeMessagesWithDefaults(
  custom:   readonly string[] | null | undefined,
  defaults: readonly string[],
): string[] {
  const out: string[] = []
  for (let i = 0; i < FOLLOWUP_MESSAGE_SLOTS; i++) {
    const v = custom?.[i]
    if (typeof v === "string" && v.length > 0) {
      out.push(v)
    } else {
      out.push(defaults[i] ?? defaults[defaults.length - 1] ?? "")
    }
  }
  return out
}

export interface GenerateTouchScheduleParams {
  campaignId:    string
  candidateId:   string
  preset:        FollowUpPreset
  /**
   * Д0 — точка отсчёта расписания касаний. Обычно дата отклика кандидата
   * на hh (negotiation.created_at); fallback — момент ручного прогона.
   */
  d0Date:        Date
  /** Откуда узнали Д0 — для аналитики причин fallback'а. */
  d0Source:      ChainD0Source
  messages:      string[]
  branch?:       FollowUpBranch
  /** Расписание вакансии — нужно для adjustToWorkingWindow. */
  vacancy:       VacancySchedule
  /** Группа 35: кастомные дни касаний, перекрывают preset.days. Если
   *  заданы — messageIndexes берутся по порядку (i-й день → i-й слот). */
  customDays?:   number[] | null
}

// Генерация ±15 минут jitter в миллисекундах. Используем простой
// Math.random — для дожима достаточно «выглядеть нероботом», криптостойкость
// не нужна.
function jitterMs(): number {
  return Math.round((Math.random() * 2 - 1) * 15 * 60_000)
}

// Прибавляет N дней к дате, сохраняя ВРЕМЯ суток (час+минуту) исходной даты.
// addDays из date-fns делает то же самое — на чисто Date-арифметике hh:mm
// автоматически сохраняется. Оставлено как явный хелпер для читаемости.
function addDaysKeepingTime(date: Date, days: number): Date {
  return addDays(date, days)
}

export function generateTouchSchedule(params: GenerateTouchScheduleParams): ScheduledTouch[] {
  const { campaignId, candidateId, preset, d0Date, d0Source, messages, vacancy, customDays } = params
  const branch = params.branch ?? "not_opened"

  if (preset === "off") return []
  const schedule = FOLLOWUP_PRESETS[preset]
  if (!schedule) return []
  if (messages.length === 0) return []

  // Группа 35: кастомное расписание перекрывает preset.days. messageIndexes
  // берём по порядку 0..N-1 (i-й день — i-й слот). Дедупликация и сортировка
  // выполнены на стороне UI/load.
  const useCustom = Array.isArray(customDays) && customDays.length > 0
  const days = useCustom
    ? [...customDays].filter(d => Number.isFinite(d) && d >= 1 && d <= 365).sort((a, b) => a - b)
    : schedule.days
  if (days.length === 0) return []

  return days.map((dayOffset, idx) => {
    const slot = useCustom ? idx : (schedule.messageIndexes[idx] ?? idx)
    const text = messages[slot] ?? messages[messages.length - 1] ?? ""

    // 1. От Д0 прибавляем dayOffset, сохраняя час/минуту Д0.
    const base = addDaysKeepingTime(d0Date, dayOffset)
    // 2. Случайный ±15-минутный сдвиг — снижает «роботность» рассылки.
    const jittered = new Date(base.getTime() + jitterMs())
    // 3. Переносим на ближайший слот в окне работы вакансии.
    //    Если scheduleEnabled=false — применяется дефолт 09:00–20:00 МСК.
    const { adjusted } = adjustToWorkingWindow(jittered, vacancy)

    return {
      campaignId,
      candidateId,
      scheduledAt:   adjusted,
      touchNumber:   idx + 1,
      channel:       "hh" as const,
      messageText:   text,
      status:        "pending" as const,
      branch,
      chainD0:       d0Date,
      chainD0Source: d0Source,
    }
  })
}
