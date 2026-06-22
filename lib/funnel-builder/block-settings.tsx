// Реестр компонентов настроек блоков конструктора воронки (#78).
// Вынесен из blocks.ts, чтобы API route (server) не тянул React-компоненты.
// funnel-builder.tsx импортирует отсюда и рендерит выбранный компонент в Sheet.

"use client"

import { useCallback, useEffect, useState, type ComponentType } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"

import { AiChatbotSettings } from "@/components/vacancies/ai-chatbot-settings"
import { ContentStepSettings } from "@/components/vacancies/content-step-settings"
import { QuestionEditor } from "@/components/vacancies/anketa-tab"
import { AutomationSettings } from "@/components/vacancies/automation-settings"
import { FunnelTab } from "@/components/vacancies/funnel-tab"
import { VacancyTestFollowupSettings } from "@/components/vacancies/vacancy-test-followup-settings"
import { AnketaTemplateControls } from "@/components/vacancies/anketa-template-controls"
import { FinalScreensSettings, type FinalScreensConfig } from "@/components/vacancies/final-screens-settings"
import { FirstMessagesChainEditor } from "@/components/vacancies/first-messages-chain-editor"
import { OfferSettings } from "@/components/vacancies/offer-settings"
import { PostDemoSettings } from "@/components/vacancies/post-demo-settings"
import { RecoveryMessageSettings } from "@/components/vacancies/recovery-message-settings"
import { ReferenceCheckSettings } from "@/components/vacancies/reference-check-settings"
import { TestTaskSettings } from "@/components/vacancies/test-task-settings"
import { VideoIntroSettings } from "@/components/vacancies/video-intro-settings"
import { useVacancySectionRegister } from "@/components/vacancies/vacancy-settings-context"
import { VacancyAiProcessSettings } from "@/components/vacancies/vacancy-ai-process-settings"
import { VacancyFollowupSettings } from "@/components/vacancies/vacancy-followup-settings"
import { VacancyPrequalificationSettings } from "@/components/vacancies/vacancy-prequalification-settings"
import { VacancyRequirementsSettings } from "@/components/vacancies/vacancy-requirements-settings"
import { VacancyScheduleSettings } from "@/components/vacancies/vacancy-schedule-settings"
import { VacancyStopFactorsSettings } from "@/components/vacancies/vacancy-stop-factors-settings"
import { VacancyStopWordsSettings } from "@/components/vacancies/vacancy-stop-words-settings"
import type { Question } from "@/lib/course-types"
import type {
  VacancyAiProcessSettings as VacancyAiProcessSettingsData,
  VacancyRequirements,
  VacancyStopFactors,
} from "@/lib/db/schema"

import { parsePipeline, type VacancyPipelineV2 } from "@/lib/stages"
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

interface AnketaShape {
  questions?: Question[]
  [k: string]: unknown
}

interface VacancyShape {
  aiProcessSettings:    VacancyAiProcessSettingsData | null
  aiScoringEnabled:     boolean
  stopFactorsJson:      VacancyStopFactors | null
  stopWordsJson:        string[] | null
  requirementsJson:     VacancyRequirements | null
  descriptionJson:      { finalScreens?: FinalScreensConfig; anketa?: AnketaShape; pipeline?: unknown } | null
  recoveryMessageEnabled: boolean
  recoveryMessageText:    string
  /** vacancies.portrait_scoring — на контуре «Портрет» критерии/стоп-факторы/пороги
   *  берутся из vacancy_specs, а эти legacy-блоки движок не читает → прячем дубль. */
  portraitScoring?:     boolean
}

/** Заглушка-указатель: для Портрет-вакансий вместо дубля-редактора ведём в «Портрет». */
function PortraitRedirectNotice({ what }: { what: string }) {
  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 px-3.5 py-3 text-xs space-y-1">
      <div className="font-medium text-sm text-foreground">Настраивается в табе «Портрет»</div>
      <p className="text-muted-foreground">
        {what} для этой вакансии берутся из «Портрета» (единый профиль кандидата) — открой
        вкладку «Портрет» вверху страницы вакансии. Здесь дубль убран, чтобы не путать:
        правки в этом блоке движок оценки на контуре «Портрет» не читает.
      </p>
    </div>
  )
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

// B4: на «тяжёлых» блоках (напр. «Анкета» — двойной фетч: вакансия + PostDemoSettings)
// холодная загрузка занимает ~0.5-2с. Голый спиннер-иконка без текста читается как
// «пустое тело Sheet» (см. B4). Подписанный лоадер явно сообщает «идёт загрузка».
function LoadingSpinner() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-muted-foreground">
      <Loader2 className="w-5 h-5 animate-spin" />
      <span className="text-sm">Загрузка настроек…</span>
    </div>
  )
}

// ─── Wrapper-компоненты ───────────────────────────────────────────────────
// Тонкая обёртка: грузит вакансию, прокидывает initial в существующий
// компонент. Каждый wrapper — отдельный ComponentType<BlockSettingsProps>.

function AiResumeScoreSettingsWrapped({ vacancyId, onSaved }: BlockSettingsProps) {
  const { data, loaded } = useVacancyData(vacancyId)
  if (!loaded) return <LoadingSpinner />
  if (data?.portraitScoring) return <PortraitRedirectNotice what="Критерии оценки и пороги резюме" />
  return (
    <div className="space-y-6">
      {/* Группа 25: новые структурированные требования для v2-скоринга. */}
      <VacancyRequirementsSettings
        vacancyId={vacancyId}
        initial={data?.requirementsJson ?? null}
        onSaved={onSaved}
      />
      {/* Legacy v1 thresholds (minScoreLower/Upper, midRangeAction). */}
      <VacancyAiProcessSettings
        vacancyId={vacancyId}
        initial={data?.aiProcessSettings ?? null}
        initialAiScoringEnabled={data?.aiScoringEnabled ?? true}
        onSaved={onSaved}
      />
    </div>
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
  if (data?.portraitScoring) return <PortraitRedirectNotice what="Стоп-факторы по резюме" />
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

// T4: «Аварийное сообщение» (recovery). Сам компонент сохраняется своим
// endpoint'ом (/recovery-message), поэтому общий saver контекста не нужен.
// defaultOpen — карточка раскрыта сразу (HR уже кликнул по блоку в Sheet).
function RecoveryMessageSettingsWrapped({ vacancyId, onSaved }: BlockSettingsProps) {
  const { data, loaded } = useVacancyData(vacancyId)
  if (!loaded) return <LoadingSpinner />
  return (
    <RecoveryMessageSettings
      vacancyId={vacancyId}
      initialEnabled={data?.recoveryMessageEnabled ?? false}
      initialText={data?.recoveryMessageText ?? ""}
      defaultOpen
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
// Полноценный редактор анкеты в Sheet: PostDemoSettings(formFields) сверху,
// а ниже — QuestionEditor (тот же, что в табе «Анкета»). Каждая часть
// регистрирует свой saver в VacancySettingsProvider, поэтому общая кнопка
// «Сохранить» в подвале Sheet сохраняет обе.
function AnketaFullSettingsWrapped({ vacancyId, onSaved }: BlockSettingsProps) {
  const { data, loaded } = useVacancyData(vacancyId)
  const initialQuestions = (data?.descriptionJson?.anketa?.questions ?? []) as Question[]
  const [questions, setQuestions] = useState<Question[]>(initialQuestions)
  const [hydrated, setHydrated] = useState(false)
  useEffect(() => {
    if (loaded && !hydrated) {
      setQuestions(initialQuestions)
      setHydrated(true)
    }
  }, [loaded, hydrated, initialQuestions])

  const saveQuestions = useCallback(async () => {
    const current = data?.descriptionJson?.anketa ?? {}
    const nextAnketa = { ...current, questions }
    const res = await fetch(`/api/modules/hr/vacancies/${vacancyId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description_json: { anketa: nextAnketa } }),
    })
    if (!res.ok) {
      toast.error("Не удалось сохранить вопросы анкеты")
      throw new Error("save questions failed")
    }
    toast.success("Вопросы анкеты сохранены")
    onSaved?.()
  }, [data?.descriptionJson?.anketa, questions, vacancyId, onSaved])

  useVacancySectionRegister({
    sectionKey:    `funnel-builder-anketa-questions:${vacancyId}`,
    tabKey:        "funnel-builder",
    loaded:        hydrated,
    watchedValues: questions,
    save:          saveQuestions,
  })

  if (!loaded) return <LoadingSpinner />
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Поля анкеты</h3>
        <PostDemoSettings vacancyId={vacancyId} sections={["formFields"]} />
      </section>
      <section className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold">Вопросы анкеты</h3>
            <p className="text-xs text-muted-foreground">
              Эти вопросы кандидат увидит после загрузки видео-визитки.
            </p>
          </div>
          <AnketaTemplateControls questions={questions} onChange={setQuestions} />
        </div>
        <QuestionEditor questions={questions} onChange={setQuestions} />
      </section>
    </div>
  )
}
function AiAnketaScoreSettingsWrapped({ vacancyId }: BlockSettingsProps) {
  return <PostDemoSettings vacancyId={vacancyId} sections={["thresholds"]} />
}

// Группа 35: Sheet-обёртка для VacancyFollowupSettings. Передаёт
// tabKey="funnel-builder", чтобы pending-индикатор попадал на этот таб
// (а не на standalone followup-таб, где компонента нет в Sheet).
function DozhimSettingsWrapped({ vacancyId, onSaved }: BlockSettingsProps) {
  return <VacancyFollowupSettings vacancyId={vacancyId} tabKey="funnel-builder" onSaved={onSaved} />
}

function AutoReplyTestTaskSettingsWrapped({ vacancyId }: BlockSettingsProps) {
  return <PostDemoSettings vacancyId={vacancyId} sections={["anketaAutoReply"]} />
}

// T3: «Хочет созвониться» (callIntent). Переиспользуем секцию callIntent из
// AutomationSettings. tabKey="funnel-builder" — эскалац. шаблоны сохраняются
// общей кнопкой Sheet (как у Дожима); тумблер/ключевые слова авто-сохраняются
// внутри компонента (persistCallIntent, сервер мёржит только automation.callIntent).
function CallIntentSettingsWrapped({ vacancyId }: BlockSettingsProps) {
  const { data, loaded } = useVacancyData(vacancyId)
  if (!loaded) return <LoadingSpinner />
  return (
    <AutomationSettings
      vacancyId={vacancyId}
      descriptionJson={data?.descriptionJson}
      sections={["callIntent"]}
      tabKey="funnel-builder"
    />
  )
}

// VacancyScheduleSettings и AiChatbotSettings — без initial-пропа, отдаём как есть.

// Стадии воронки (funnel_stages): грузим descriptionJson.pipeline, парсим
// через parsePipeline и передаём в FunnelTab. Не затрагиваем логику FunnelTab —
// только оборачиваем для Sheet.
function FunnelStagesSettingsWrapped({ vacancyId, onSaved }: BlockSettingsProps) {
  const { data, loaded } = useVacancyData(vacancyId)
  const [pipeline, setPipeline] = useState<VacancyPipelineV2 | null>(null)
  useEffect(() => {
    if (loaded && pipeline === null) {
      setPipeline(parsePipeline(data?.descriptionJson?.pipeline ?? null))
    }
  }, [loaded, data, pipeline])
  if (!loaded || pipeline === null) return <LoadingSpinner />
  return (
    <FunnelTab
      vacancyId={vacancyId}
      initialPipeline={pipeline}
      onSaved={() => { onSaved?.() }}
    />
  )
}

// Дожим по тесту (test_followup): VacancyTestFollowupSettings — self-contained,
// грузит данные сам через свой fetch по vacancyId.
function TestFollowupSettingsWrapped({ vacancyId }: BlockSettingsProps) {
  return <VacancyTestFollowupSettings vacancyId={vacancyId} />
}

// FAQ-шаблоны (faq_templates): секция "templates" из AutomationSettings,
// по образцу CallIntentSettingsWrapped.
function FaqTemplatesSettingsWrapped({ vacancyId }: BlockSettingsProps) {
  const { data, loaded } = useVacancyData(vacancyId)
  if (!loaded) return <LoadingSpinner />
  return (
    <AutomationSettings
      vacancyId={vacancyId}
      descriptionJson={data?.descriptionJson}
      sections={["templates"]}
      tabKey="funnel-builder"
    />
  )
}

// Контент-шаг (прототип): компонент грузит данные сам, обёртка минимальная.
function ContentStepSettingsWrapped({ vacancyId, onSaved }: BlockSettingsProps) {
  return <ContentStepSettings vacancyId={vacancyId} onSaved={onSaved} />
}

// ─── Реестр ────────────────────────────────────────────────────────────────

export const BLOCK_SETTINGS_REGISTRY: Partial<Record<FunnelBlockType, BlockSettingsEntry>> = {
  ai_resume_score: {
    component:   AiResumeScoreSettingsWrapped,
    title:       "AI-скоринг резюме",
    description: "Структурированные требования (v2) + пороги score",
  },
  stop_factors_resume: {
    component:   StopFactorsSettingsWrapped,
    title:       "Стоп-факторы по резюме",
    description: "Город / опыт / возраст → автоотказ",
  },
  funnel_stages: {
    component:   FunnelStagesSettingsWrapped,
    title:       "Стадии воронки",
    description: "Канбан-стадии и действие в hh.ru на каждой стадии",
  },
  first_message: {
    component:   FirstMessagesChainEditor,
    title:       "Первое сообщение",
    description: "Серия из 1–3 приветственных сообщений с demo-ссылкой",
  },
  recovery: {
    component:   RecoveryMessageSettingsWrapped,
    title:       "Аварийное сообщение",
    description: "Повторная отправка, если ссылка в первом сообщении битая",
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
    component:   AnketaFullSettingsWrapped,
    title:       "Анкета",
    description: "Поля анкеты + вопросы, которые HR задаёт кандидату",
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
  call_intent: {
    component:   CallIntentSettingsWrapped,
    title:       "Хочет созвониться",
    description: "Ключевые слова в чате → эскалация на демо",
  },
  dozhim: {
    component:   DozhimSettingsWrapped,
    title:       "Дожим",
    description: "Цепочка касаний для не-открывших и не-завершивших",
  },
  test_followup: {
    component:   TestFollowupSettingsWrapped,
    title:       "Дожим по тесту",
    description: "Касания для не открывших / не сдавших тест",
  },
  faq_templates: {
    component:   FaqTemplatesSettingsWrapped,
    title:       "FAQ-шаблоны ответов",
    description: "Готовые ответы для ручного копирования в hh-чат",
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
  video_intro: {
    component:   VideoIntroSettings,
    title:       "Видео-визитка",
    description: "Инструкция, длительность и обязательность шага",
  },
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
  content_step: {
    component:   ContentStepSettingsWrapped,
    title:       "Контент-шаг (прототип)",
    description: "Презентация / Демо / Тест / Тестовое задание — один блок (концепт)",
  },
}
