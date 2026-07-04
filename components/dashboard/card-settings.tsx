"use client"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { SlidersHorizontal } from "lucide-react"

export interface CardDisplaySettings {
  showSalary: boolean
  showSalaryFull: boolean
  showScore: boolean          // колонка «AI-оцен.» (оценка анкеты)
  showResumeScore?: boolean   // колонка «AI резюме» (скоринг резюме); undefined = показывать
  showPortraitScore?: boolean // колонка «AI портрет» (оценка по Портрету, ai_score_v2); undefined = показывать
  showAnswersScore?: boolean  // колонка «AI анкета» (AI-оценка ответов анкеты демо, demo_answers_score); undefined = показывать
  showTestScore?: boolean     // колонка «Тест» (балл/статус теста); undefined = показывать
  showNextInterview?: boolean // колонка «Интервью» (ближайшее); undefined = показывать
  showAge: boolean
  showSource: boolean
  showCity: boolean
  showExperience: boolean
  showSkills: boolean
  showActions: boolean
  showProgress?: boolean
  showResponseDate?: boolean
  showNameWarning?: boolean   // бэйдж ⚠ «имя под вопросом» у имени; undefined = показывать
}

// ЕДИНЫЙ реестр тумблеров колонок СПИСКА кандидатов — источник правды для панели
// «Вид» (view-settings.tsx). Порядок ДОЛЖЕН совпадать с порядком колонок в
// list-view.tsx (слева→направо). Системные колонки (★ Избранное, Кандидат/ФИО,
// Статус) сюда НЕ входят — они всегда видны. Добавил колонку с новым ключом в
// list-view — добавь сюда строку, и тумблер появится автоматически (и наоборот).
// Порядок строго совпадает с порядком колонок в list-view.tsx (слева→направо):
// AI резюме → Демо → AI анкета → AI портрет → AI-оцен. → Тест → Интервью → Зарплата → …
export const CANDIDATE_COLUMN_TOGGLES: Array<{ key: keyof CardDisplaySettings; label: string }> = [
  { key: "showResumeScore",   label: "AI резюме" },
  { key: "showProgress",      label: "Прогресс демо" },
  { key: "showAnswersScore",  label: "AI анкета (балл ответов демо)" },
  { key: "showPortraitScore", label: "AI портрет" },
  { key: "showScore",         label: "AI оценка" },
  { key: "showTestScore",     label: "Тест" },
  { key: "showNextInterview", label: "Интервью" },
  { key: "showSalaryFull",    label: "Зарплата" },
  { key: "showCity",          label: "Город" },
  { key: "showResponseDate",  label: "Дата отклика" },
  { key: "showSource",        label: "Источник" },
  { key: "showActions",       label: "Кнопки действий" },
]

// Колонки, всегда актуальные для ЛЮБОЙ вакансии (универсальные) — тумблер
// показываем безусловно, вне зависимости от конфигурации воронки.
const UNIVERSAL_COLUMN_KEYS: ReadonlyArray<keyof CardDisplaySettings> = [
  "showSalaryFull",
  "showCity",
  "showResponseDate",
  "showSource",
  "showActions",
]

/**
 * Определяет, какие тумблеры колонок актуальны для КОНКРЕТНОЙ вакансии — по её
 * конфигурации воронки (funnel_config_json блоки) + legacy-флагам скоринга.
 * Универсальные колонки (Зарплата/Город/Дата/Источник/Кнопки) — всегда.
 *
 * ВАЖНО про безопасный дефолт: если у вакансии нет положительного сигнала о том,
 * какие этапы/скоринги используются (пустой funnel_config и выключены legacy-флаги),
 * возвращаем `null` — вызывающая сторона трактует это как «показать ВСЕ тумблеры»
 * (прежнее поведение). Так мы не прячем колонки на старых вакансиях без воронки.
 *
 * @returns Set актуальных ключей, либо null если нет сигнала (→ показать всё).
 */
export function relevantColumnKeys(v: {
  funnelConfigJson?: { blocks?: Array<{ type?: string; enabled?: boolean }> } | null
  descriptionJson?: unknown
  portraitScoring?: boolean
  aiScoringEnabled?: boolean
  aiChatbotEnabled?: boolean
} | null | undefined): Set<keyof CardDisplaySettings> | null {
  if (!v) return null

  // Активные блоки воронки (funnel builder). Блок считается активным, если
  // enabled !== false (undefined трактуем как включённый — как в остальном коде).
  const blocks = Array.isArray(v.funnelConfigJson?.blocks) ? v.funnelConfigJson!.blocks! : []
  const activeBlocks = new Set(
    blocks.filter((b) => b && b.enabled !== false && typeof b.type === "string").map((b) => b.type as string),
  )

  // Стадии funnel-v2 (descriptionJson.funnelV2.stages) — доп. сигнал по этапам.
  const dj = v.descriptionJson
  const v2StageTypes = new Set<string>()
  if (dj && typeof dj === "object") {
    const raw = (dj as { funnelV2?: unknown }).funnelV2
    const stages = raw && typeof raw === "object" ? (raw as { stages?: unknown }).stages : undefined
    if (Array.isArray(stages)) {
      for (const s of stages as Array<Record<string, unknown>>) {
        // У стадии v2 бывает тип/ключ — собираем и id, и type для матчинга по подстроке.
        for (const k of ["type", "kind", "id", "slug"]) {
          if (typeof s?.[k] === "string") v2StageTypes.add((s[k] as string).toLowerCase())
        }
      }
    }
  }
  const v2Has = (needle: string) => Array.from(v2StageTypes).some((t) => t.includes(needle))

  const hasFunnelSignal = activeBlocks.size > 0 || v2StageTypes.size > 0
  const hasLegacySignal = !!v.portraitScoring || !!v.aiScoringEnabled || !!v.aiChatbotEnabled
  // Нет ни одного сигнала → отдаём null (показать все тумблеры, прежнее поведение).
  if (!hasFunnelSignal && !hasLegacySignal) return null

  const keys = new Set<keyof CardDisplaySettings>(UNIVERSAL_COLUMN_KEYS)

  // AI резюме — скоринг резюме (двигает воронку). Актуально при блоке ai_resume_score
  // или legacy aiScoringEnabled/portraitScoring (Портрет тоже скорит резюме).
  if (activeBlocks.has("ai_resume_score") || v.aiScoringEnabled || v.portraitScoring) keys.add("showResumeScore")

  // Прогресс демо — актуально при этапе демо/анкеты.
  if (activeBlocks.has("demo") || activeBlocks.has("anketa") || v2Has("demo") || v2Has("anketa")) keys.add("showProgress")

  // AI-ан (балл ответов демо) — актуально при скоринге анкеты.
  if (activeBlocks.has("ai_anketa_score") || activeBlocks.has("anketa") || v2Has("anketa")) keys.add("showAnswersScore")

  // AI-Портрет — только при включённом контуре Портрета.
  if (v.portraitScoring) keys.add("showPortraitScore")

  // AI оценка (оценка анкеты) — при legacy AI-скоринге или этапе анкеты.
  if (v.aiScoringEnabled || activeBlocks.has("ai_anketa_score") || activeBlocks.has("anketa") || v2Has("anketa")) keys.add("showScore")

  // Тест — при этапе тестового задания.
  if (activeBlocks.has("test_task") || activeBlocks.has("auto_reply_test_task") || v2Has("test")) keys.add("showTestScore")

  // Интервью — при этапе собеседования.
  if (activeBlocks.has("interview") || v2Has("interview")) keys.add("showNextInterview")

  return keys
}

interface CardSettingsProps {
  settings: CardDisplaySettings
  onSettingsChange: (settings: CardDisplaySettings) => void
}

const settingsLabels: { key: keyof CardDisplaySettings; label: string }[] = [
  { key: "showScore", label: "AI скоринг" },
  { key: "showSalaryFull", label: "Зарплата" },
  { key: "showCity", label: "Город" },

  { key: "showSource", label: "Источник" },
  { key: "showActions", label: "Кнопки действий" },
]

export function CardSettings({ settings, onSettingsChange }: CardSettingsProps) {
  const handleToggle = (key: keyof CardDisplaySettings) => {
    const newSettings = { ...settings, [key]: !settings[key] }
    
    // Logic: if full salary is enabled, disable short salary
    if (key === "showSalaryFull" && newSettings.showSalaryFull) {
      newSettings.showSalary = false
    }
    if (key === "showSalary" && newSettings.showSalary) {
      newSettings.showSalaryFull = false
    }
    
    onSettingsChange(newSettings)
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-9">
          <SlidersHorizontal className="size-4 mr-2" />
          Вид карточки
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64" align="end">
        <div className="space-y-4">
          <div className="space-y-1">
            <h4 className="font-medium text-sm">Настройки карточки</h4>
            <p className="text-xs text-muted-foreground">
              Выберите что отображать
            </p>
          </div>
          <div className="space-y-3">
            {settingsLabels.map(({ key, label }) => (
              <div key={key} className="flex items-center justify-between">
                <Label htmlFor={key} className="text-sm font-normal cursor-pointer">
                  {label}
                </Label>
                <Switch
                  id={key}
                  checked={settings[key]}
                  onCheckedChange={() => handleToggle(key)}
                />
              </div>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
