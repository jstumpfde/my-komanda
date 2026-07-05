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
  showResumeScore?: boolean   // колонка «Портрет» (оценка резюме по Портрету, resume_score); undefined = показывать
  // showPortraitScore — колонка «AI портрет» (осевой скоринг v2, ai_score_v2) убрана из
  // списка 05.07 (консолидация Юрия: пользовательская сущность оценки одна — «Портрет»,
  // см. showResumeScore выше). Поле НЕ удалено из интерфейса и тумблер из реестра ниже
  // убран, а не помечен disabled — чтобы не оставлять недействующий переключатель
  // (инвариант «никакого мёртвого UI»); сохранённые настройки старых пользователей не ломаем.
  showPortraitScore?: boolean
  showAnswersScore?: boolean  // колонка «Анкета» (AI-оценка ответов анкеты демо, demo_answers_score); undefined = показывать
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

// ЕДИНЫЙ реестр тумблеров колонок — источник правды для панели «Вид»
// (view-settings.tsx), ОБЩИЙ для ВСЕХ режимов отображения (Список/Канбан/
// Плитки/Воронка), не только list-view.tsx. Порядок совпадает с порядком
// колонок в list-view.tsx (слева→направо) — это канон, т.к. Список самый
// частый режим. Системные колонки списка (★ Избранное, Кандидат/ФИО, Статус)
// сюда НЕ входят — они всегда видны там. Добавил колонку с новым ключом в
// list-view — добавь сюда строку, и тумблер появится автоматически (и наоборот).
//
// showScore («AI оценка») 05.07: в list-view.tsx НЕТ колонки под этот ключ
// (переменная showScore там читается, но не рендерит колонку — see комментарий
// у showResumeScore/showPortraitScore про консолидацию «Портрет»). Тумблер
// НЕ мёртвый в целом — им управляется реальный бейдж «AI скор» в Канбане
// (candidate-card.tsx), Плитках (tiles-view.tsx) и Воронке (funnel-view.tsx).
// Удалять тумблер нельзя без ломки этих 3 режимов; если нужно скрыть его
// именно в Списке — требуется per-viewMode фильтрация тумблеров в
// view-settings.tsx (сейчас список тумблеров общий для всех режимов) —
// отдельная задача, не сделана здесь.
//
// Лейблы переименованы 05.07 в соответствие названиям колонок list-view.tsx
// после консолидации оценок («Портрет» — единая пользовательская сущность):
// «Прогресс демо» → «Демо», «Анкета (балл ответов демо)» → «Анкета». Ключи
// (showProgress/showAnswersScore) НЕ переименованы — сохранённые настройки
// пользователей в settings-json ссылаются на них по ключу, не по лейблу.
export const CANDIDATE_COLUMN_TOGGLES: Array<{ key: keyof CardDisplaySettings; label: string }> = [
  { key: "showResumeScore",   label: "Портрет" },
  { key: "showProgress",      label: "Демо" },
  { key: "showAnswersScore",  label: "Анкета" },
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

  // Портрет — скоринг резюме (двигает воронку). Актуально при блоке ai_resume_score
  // или legacy aiScoringEnabled/portraitScoring (контур Портрета тоже скорит резюме).
  if (activeBlocks.has("ai_resume_score") || v.aiScoringEnabled || v.portraitScoring) keys.add("showResumeScore")

  // Прогресс демо — актуально при этапе демо/анкеты.
  if (activeBlocks.has("demo") || activeBlocks.has("anketa") || v2Has("demo") || v2Has("anketa")) keys.add("showProgress")

  // Анкета (балл ответов демо) — актуально при скоринге анкеты.
  if (activeBlocks.has("ai_anketa_score") || activeBlocks.has("anketa") || v2Has("anketa")) keys.add("showAnswersScore")

  // showPortraitScore — колонка убрана из CANDIDATE_COLUMN_TOGGLES 05.07, этот
  // Set больше ни на что не влияет для неё; строка оставлена как есть (не
  // мёртвая логика, а неиспользуемое значение — безопасно для saved-settings).
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
