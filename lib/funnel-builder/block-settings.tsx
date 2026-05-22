// Реестр компонентов настроек блоков конструктора воронки (#78).
// Вынесен из blocks.ts, чтобы API route (server) не тянул React-компоненты.
// funnel-builder.tsx импортирует отсюда и рендерит выбранный компонент в Sheet.

"use client"

import { useEffect, useState, type ComponentType } from "react"
import { Loader2 } from "lucide-react"

import { AiChatbotSettings } from "@/components/vacancies/ai-chatbot-settings"
import { FinalScreensSettings, type FinalScreensConfig } from "@/components/vacancies/final-screens-settings"
import { FirstMessagesChainEditor } from "@/components/vacancies/first-messages-chain-editor"
import { OfferSettings } from "@/components/vacancies/offer-settings"
import { PostDemoSettings } from "@/components/vacancies/post-demo-settings"
import { ReferenceCheckSettings } from "@/components/vacancies/reference-check-settings"
import { TestTaskSettings } from "@/components/vacancies/test-task-settings"
import { VacancyAiProcessSettings } from "@/components/vacancies/vacancy-ai-process-settings"
import { VacancyFollowupSettings } from "@/components/vacancies/vacancy-followup-settings"
import { VacancyPrequalificationSettings } from "@/components/vacancies/vacancy-prequalification-settings"
import { VacancyScheduleSettings } from "@/components/vacancies/vacancy-schedule-settings"
import { VacancyStopFactorsSettings } from "@/components/vacancies/vacancy-stop-factors-settings"
import { VacancyStopWordsSettings } from "@/components/vacancies/vacancy-stop-words-settings"
import type { VacancyAiProcessSettings as VacancyAiProcessSettingsData, VacancyStopFactors } from "@/lib/db/schema"

import type { FunnelBlockType } from "./blocks"

export interface BlockSettingsProps {
  vacancyId: string
  onSaved?:  () => void
}

export interface BlockSettingsEntry {
  title:        string
  description?: string
  component:    ComponentType<BlockSettingsProps> | null
}

// ─── Лоадер данных вакансии ────────────────────────────────────────────────
// Часть существующих компонентов настроек принимает initial-данные пропом и
// рассчитывает loaded на основе того, что initial !== undefined. В табах
// вакансии данные приходят из родителя; в Sheet конструктора родителя нет,
// поэтому делаем точечный fetch и прокидываем initial.

interface VacancyShape {
  aiProcessSettings:    VacancyAiProcessSettingsData | null
  aiScoringEnabled:     boolean
  stopFactorsJson:      VacancyStopFactors | null
  stopWordsJson:        string[] | null
  descriptionJson:      { finalScreens?: FinalScreensConfig } | null
}

function useVacancyData(vacancyId: string): { data: VacancyShape | null; loaded: boolean } {
  const [data, setData] = useState<VacancyShape | null>(null)
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    if (!vacancyId) return
    let cancelled = false
    fetch(`/api/modules/hr/vacancies/${vacancyId}`)
      .then(r => r.ok ? r.json() : null)
      .then((v: VacancyShape | null) => {
        if (cancelled) return
        setData(v ?? null)
        setLoaded(true)
      })
      .catch(() => { if (!cancelled) setLoaded(true) })
    return () => { cancelled = true }
  }, [vacancyId])
  return { data, loaded }
}

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
    </div>
  )
}

// ─── Wrapper-компоненты ───────────────────────────────────────────────────
// Тонкая обёртка: грузит вакансию, прокидывает initial в существующий
// компонент. Каждый wrapper — отдельный ComponentType<BlockSettingsProps>.

function AiResumeScoreSettingsWrapped({ vacancyId, onSaved }: BlockSettingsProps) {
  const { data, loaded } = useVacancyData(vacancyId)
  if (!loaded) return <LoadingSpinner />
  return (
    <VacancyAiProcessSettings
      vacancyId={vacancyId}
      initial={data?.aiProcessSettings ?? null}
      initialAiScoringEnabled={data?.aiScoringEnabled ?? true}
      onSaved={onSaved}
    />
  )
}

function PrequalificationSettingsWrapped({ vacancyId, onSaved }: BlockSettingsProps) {
  const { data, loaded } = useVacancyData(vacancyId)
  if (!loaded) return <LoadingSpinner />
  return (
    <VacancyPrequalificationSettings
      vacancyId={vacancyId}
      initial={data?.aiProcessSettings ?? null}
      onSaved={onSaved}
    />
  )
}

function StopFactorsSettingsWrapped({ vacancyId, onSaved }: BlockSettingsProps) {
  const { data, loaded } = useVacancyData(vacancyId)
  if (!loaded) return <LoadingSpinner />
  return (
    <VacancyStopFactorsSettings
      vacancyId={vacancyId}
      initial={data?.stopFactorsJson ?? null}
      onSaved={onSaved}
    />
  )
}

function StopWordsSettingsWrapped({ vacancyId, onSaved }: BlockSettingsProps) {
  const { data, loaded } = useVacancyData(vacancyId)
  if (!loaded) return <LoadingSpinner />
  return (
    <VacancyStopWordsSettings
      vacancyId={vacancyId}
      initial={data?.stopWordsJson ?? null}
      onSaved={onSaved}
    />
  )
}

function ThankYouScreenSettingsWrapped({ vacancyId, onSaved }: BlockSettingsProps) {
  const { data, loaded } = useVacancyData(vacancyId)
  if (!loaded) return <LoadingSpinner />
  return (
    <FinalScreensSettings
      vacancyId={vacancyId}
      initial={data?.descriptionJson?.finalScreens ?? null}
      onSaved={onSaved}
    />
  )
}

// PostDemoSettings показывает 4 секции — мы расщепляем её на 3 блока
// (demo / ai_anketa_score / auto_reply_test_task) с разным `sections`.
function DemoPreviewSettingsWrapped({ vacancyId }: BlockSettingsProps) {
  return <PostDemoSettings vacancyId={vacancyId} sections={["preview"]} />
}
function AnketaFormFieldsSettingsWrapped({ vacancyId }: BlockSettingsProps) {
  return <PostDemoSettings vacancyId={vacancyId} sections={["formFields"]} />
}
function AiAnketaScoreSettingsWrapped({ vacancyId }: BlockSettingsProps) {
  return <PostDemoSettings vacancyId={vacancyId} sections={["thresholds"]} />
}
function AutoReplyTestTaskSettingsWrapped({ vacancyId }: BlockSettingsProps) {
  return <PostDemoSettings vacancyId={vacancyId} sections={["anketaAutoReply"]} />
}

// VacancyScheduleSettings и AiChatbotSettings — без initial-пропа, отдаём как есть.

// ─── Реестр ────────────────────────────────────────────────────────────────

export const BLOCK_SETTINGS_REGISTRY: Partial<Record<FunnelBlockType, BlockSettingsEntry>> = {
  ai_resume_score: {
    component:   AiResumeScoreSettingsWrapped,
    title:       "AI-скоринг резюме",
    description: "AI оценивает резюме при импорте 0–100",
  },
  stop_factors_resume: {
    component:   StopFactorsSettingsWrapped,
    title:       "Стоп-факторы по резюме",
    description: "Город / опыт / возраст → автоотказ",
  },
  first_message: {
    component:   FirstMessagesChainEditor,
    title:       "Первое сообщение",
    description: "Серия из 1–3 приветственных сообщений с demo-ссылкой",
  },
  prequalification: {
    component:   PrequalificationSettingsWrapped,
    title:       "Предквалификация",
    description: "AI-опрос перед демо для отсева",
  },
  demo: {
    component:   DemoPreviewSettingsWrapped,
    title:       "Демонстрация",
    description: "Превью демо-страницы и режим (auto/manual)",
  },
  anketa: {
    component:   AnketaFormFieldsSettingsWrapped,
    title:       "Анкета",
    description: "Какие поля кандидат заполняет в финальной анкете",
    // TODO: AnketaTab (редактор вопросов) сильно завязан на родительский
    // контекст. Пока в Sheet — только конфиг полей через PostDemoSettings.
    // Редактор вопросов остаётся в табе «Анкета» вакансии.
  },
  ai_anketa_score: {
    component:   AiAnketaScoreSettingsWrapped,
    title:       "AI-скрининг анкеты",
    description: "Пороги score: пропустить / отказать / на разбор HR",
  },
  auto_reply_test_task: {
    component:   AutoReplyTestTaskSettingsWrapped,
    title:       "Автоответ с тестовым заданием",
    description: "Сообщение через N минут после отправки анкеты",
  },
  stop_words_chat: {
    component:   StopWordsSettingsWrapped,
    title:       "Стоп-слова в чате",
    description: "Триггер автоотказа по словам кандидата",
  },
  dozhim: {
    component:   VacancyFollowupSettings,
    title:       "Дожим",
    description: "Цепочка касаний для не-открывших и не-завершивших",
  },
  ai_chatbot: {
    component:   AiChatbotSettings,
    title:       "AI чат-бот",
    description: "AI-агент общается с кандидатами вместо обычных сообщений",
  },
  interview: {
    component:   VacancyScheduleSettings,
    title:       "Интервью",
    description: "Расписание встреч и нерабочие дни",
  },
  thank_you_screen: {
    component:   ThankYouScreenSettingsWrapped,
    title:       "Финальный экран",
    description: "Тексты экранов после видео и после анкеты",
  },
  // video_intro: компонента видео-визитки со сжатием пока нет — TODO Группы 19+.
  test_task: {
    component:   TestTaskSettings,
    title:       "Тестовое задание",
    description: "Отдельная ступень: задание → ответ → AI-проверка",
  },
  reference_check: {
    component:   ReferenceCheckSettings,
    title:       "Реф-чек",
    description: "Вопросы прошлым работодателям кандидата",
  },
  offer: {
    component:   OfferSettings,
    title:       "Оффер",
    description: "Шаблон документа об оффере + электронная подпись",
  },
}
