"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import { Separator } from "@/components/ui/separator"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PlaceholderBadges } from "@/components/ui/placeholder-badges"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  MessageSquare, Zap, Phone, Brain, Send, Check,
  ClipboardList, Loader2, Plus, X,
} from "lucide-react"
import { useVacancySectionRegister, type VacancyTabKey } from "./vacancy-settings-context"

// ─── Типы ────────────────────────────────────────────────────

type ResponseReaction = "slot-and-demo" | "slot-only" | "insist-demo"

// ScenarioType / StepType / SCENARIO_PRESETS («Последовательность взаимодействия») и
// PIPELINE_PRESETS («Этапы воронки») удалены в Ф1 рефакторинга 2026-05-10.
// Замена: lib/stages.ts (Ф2) + components/vacancies/funnel-tab.tsx (Ф3) + scenario-tab.tsx (Ф7).

// ─── Данные по-умолчанию ─────────────────────────────────────

const DEFAULT_FIRST_MESSAGE = `{{name}}, привет! Видели ваш отклик на {{vacancy}} — выглядит интересно 👋
Чтобы не тратить ваше время на формальное интервью, сделали короткий обзор должности на 15 мин — там реальные цифры дохода и как устроена работа.
Если после просмотра захотите пообщаться — сразу договоримся на звонок 🙂
{{demo_link}}`

const DEFAULT_CALL_INTENT_KEYWORDS = ["созвон", "позвоните", "номер", "телефон", "голос"]
const DEFAULT_INSIST_DEMO_MESSAGES: [string, string, string] = [
  "{{name}}, понял что хотите созвониться. Чтобы не тратить ваше и моё время, предлагаю сначала пройти короткую демонстрацию должности — там ответы на 90% типовых вопросов: {{demo_link}}",
  "{{name}}, так как мы сейчас в работе, всё-таки предлагаю сначала ознакомиться с демонстрацией должности и ответить на вопросы. Ваши ответы попадут к нам, и после этого назначим время для звонка: {{demo_link}}",
  "{{name}}, наша система сбора устроена так, что созваниваемся с кандидатом только после прохождения демонстрации должности и ответов на вопросы. Спасибо за понимание! Демонстрация: {{demo_link}}",
]

// FAQ — справочник готовых ответов для ручного копирования в hh-чат.
// Заменил старые messageTemplates (Сессия 7).
interface FaqItem { topic: string; text: string }
const DEFAULT_FAQ: FaqItem[] = [
  { topic: "Зарплата",       text: "Здравствуйте, {{name}}! Зарплата на позиции {{vacancy}} составляет {{salary_from}} — {{salary_to}} ₽. Подробнее об условиях — в презентации должности: {{demo_link}}" },
  { topic: "Формат работы",  text: "Здравствуйте, {{name}}! По «{{vacancy}}» формат работы — офис. Подробнее в демонстрации: {{demo_link}}" },
  { topic: "График",         text: "Здравствуйте, {{name}}! График — Пн–Пт, 09:00–18:00. Подробнее о режиме работы в презентации: {{demo_link}}" },
  { topic: "Локация",        text: "Здравствуйте, {{name}}! Офис находится в Москве. Точный адрес и условия — в демонстрации должности: {{demo_link}}" },
  { topic: "Оформление",     text: "Здравствуйте, {{name}}! Оформление по ТК РФ с первого дня. Подробнее о социальном пакете — в презентации: {{demo_link}}" },
  { topic: "Опыт",           text: "Здравствуйте, {{name}}! Требования к опыту по «{{vacancy}}» подробно описаны в демонстрации: {{demo_link}}. После просмотра сможем оценить вашу кандидатуру точнее." },
]
const MAX_FAQ_ITEMS = 15

// anketaConfirmation — автоматическое сообщение-подтверждение в hh
// через N минут после отправки финальной анкеты (Сессия 7 п.8).
const DEFAULT_ANKETA_CONFIRMATION_TEXT =
  "{{name}}, спасибо! Мы получили ваши данные и ответы. В ближайшие дни рассмотрим кандидатуру и свяжемся. Хорошего дня!"

// ─── Компонент ──────────────────────────────────────────────

/**
 * Идентификаторы карточек внутри AutomationSettings.
 * Используются страницей вакансии для разноса секций по верхним табам
 * («Сообщения» / «Демо и воронка» / «AI сценарии») при сохранении единого
 * стейта, save-логики и сетевых вызовов внутри одного компонента.
 */
export type AutomationSectionId =
  | "firstMessage"
  | "callIntent"
  | "followup"
  | "autoActions"
  | "enrichment"
  | "templates"
  | "dialer"

interface AutomationSettingsProps {
  vacancyId: string
  descriptionJson?: unknown
  aiProcessSettings?: { inviteMessage?: string; reInviteMessage?: string } | null
  /**
   * #60: текущая серия первых сообщений из vacancies.first_messages_chain.
   * Если chain[0].enabled=true и текст не пустой — старый блок «Минимальная
   * задержка перед первым сообщением» (legacy automation.delaySeconds)
   * скрывается, потому что cron берёт задержку из chain[0].delaySeconds.
   */
  firstMessagesChain?: Array<{ enabled: boolean; delaySeconds: number; text: string }>
  vacancyTitle?: string
  salaryFrom?: number | null
  salaryTo?: number | null
  /** Если задано — рендерятся только эти карточки. Иначе все. */
  sections?: AutomationSectionId[]
  /**
   * Показать глобальную кнопку «Сохранить настройки» внизу.
   * P0-50: при подключении к sticky-bar (tabKey задан) кнопка автоматически скрывается.
   */
  showGlobalSave?: boolean
  /**
   * P0-50: какой таб настроек вакансии сейчас рендерит этот инстанс. Если
   * задан — компонент регистрирует свои секции в VacancySettingsProvider,
   * сохраняется через единую sticky-кнопку, локальные «Сохранить» скрываются.
   * Если не задан — старое поведение (локальные кнопки).
   */
  tabKey?: VacancyTabKey
}

export function AutomationSettings({ vacancyId, descriptionJson, aiProcessSettings, firstMessagesChain, sections, showGlobalSave = true, tabKey }: AutomationSettingsProps) {
  const showSection = (id: AutomationSectionId): boolean => !sections || sections.includes(id)
  // P0-50: при подключённом sticky-bar глобальную кнопку прячем.
  const showLocalGlobalSave = showGlobalSave && !tabKey
  // #60: серия активна, если есть хотя бы шаг 0, он включён, и текст не
  // пустой. Тогда старый блок «Минимальная задержка» дублирует chain[0]
  // и должен скрываться, чтобы HR не путался.
  const chainActive = Boolean(
    firstMessagesChain
      && firstMessagesChain.length > 0
      && firstMessagesChain[0]?.enabled
      && (firstMessagesChain[0]?.text ?? "").trim().length > 0
  )

  // Parse automation settings from descriptionJson
  const initialAutomation = (() => {
    if (descriptionJson && typeof descriptionJson === "object" && descriptionJson !== null) {
      const dj = descriptionJson as Record<string, unknown>
      return (dj.automation as Record<string, unknown>) || {}
    }
    return {}
  })()

  // 1. Первое сообщение.
  // #20: delaySeconds — новое поле в секундах. Раньше было delayMinutes
  // (целое число минут, минимум 2 мин), теперь поддерживаем 15/30 сек
  // для "живого" общения. Читаем сначала delaySeconds, если нет —
  // fallback на delayMinutes * 60.
  const initialDelaySeconds = (() => {
    if (typeof initialAutomation.delaySeconds === "number") return initialAutomation.delaySeconds
    if (typeof initialAutomation.delayMinutes === "number") return initialAutomation.delayMinutes * 60
    return 180
  })()
  const [firstMessageDelay, setFirstMessageDelay] = useState(String(initialDelaySeconds))
  // Шаблон сообщения хранится в vacancies.ai_process_settings.inviteMessage —
  // его читает hh process-queue при отправке приглашения на демо.
  const initialInviteMessage = aiProcessSettings?.inviteMessage || DEFAULT_FIRST_MESSAGE
  const [firstMessageText, setFirstMessageText] = useState(initialInviteMessage)
  const [savedInviteMessage, setSavedInviteMessage] = useState(initialInviteMessage)
  const [savingInvite, setSavingInvite] = useState(false)
  const inviteDirty = firstMessageText !== savedInviteMessage

  // Текст для повторной отправки (после исправления битой ссылки).
  // Используется в hh process-queue, если по отклику уже было исходящее сообщение от работодателя.
  const initialReInviteMessage = aiProcessSettings?.reInviteMessage || ""
  const [reInviteText, setReInviteText] = useState(initialReInviteMessage)
  const [savedReInviteMessage, setSavedReInviteMessage] = useState(initialReInviteMessage)
  const [savingReInvite, setSavingReInvite] = useState(false)
  const reInviteDirty = reInviteText !== savedReInviteMessage

  useEffect(() => {
    const next = aiProcessSettings?.inviteMessage
    if (typeof next === "string" && next.length > 0 && next !== savedInviteMessage) {
      setSavedInviteMessage(next)
      setFirstMessageText(next)
    }
  }, [aiProcessSettings, savedInviteMessage])

  useEffect(() => {
    const next = aiProcessSettings?.reInviteMessage
    if (typeof next === "string" && next !== savedReInviteMessage) {
      setSavedReInviteMessage(next)
      setReInviteText(next)
    }
  }, [aiProcessSettings, savedReInviteMessage])

  const saveInviteMessage = useCallback(async () => {
    setSavingInvite(true)
    try {
      const res = await fetch(`/api/modules/hr/vacancies/${vacancyId}/ai-settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inviteMessage: firstMessageText }),
      })
      if (!res.ok) {
        // P0-43 fix: парсим тело ответа, чтобы показать конкретный текст
        // (валидация demo_link и пр.). Бросаем дальше — это сигнал для
        // sticky-bar register'а НЕ сбрасывать baseline и НЕ вызывать
        // следующий saveSettings (а то «Сохранено» затрёт ошибку).
        const body = await res.json().catch(() => null) as { error?: string } | null
        const msg = body?.error || "Не удалось сохранить"
        toast.error(msg)
        throw new Error(msg)
      }
      setSavedInviteMessage(firstMessageText)
      toast.success("Сохранено")
    } finally {
      setSavingInvite(false)
    }
  }, [vacancyId, firstMessageText])

  const saveReInviteMessage = useCallback(async () => {
    setSavingReInvite(true)
    try {
      const res = await fetch(`/api/modules/hr/vacancies/${vacancyId}/ai-settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reInviteMessage: reInviteText }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: string } | null
        const msg = body?.error || "Не удалось сохранить"
        toast.error(msg)
        throw new Error(msg)
      }
      setSavedReInviteMessage(reInviteText)
      toast.success("Сохранено")
    } finally {
      setSavingReInvite(false)
    }
  }, [vacancyId, reInviteText])

  // 1b. Рабочие часы — переехали в отдельный компонент VacancyScheduleSettings.
  // Здесь старые поля больше не редактируются, но описание_json мы при сохранении
  // не трогаем (старое значение остаётся в automation.workingHours для архива
  // и обратной совместимости, но cron'ы уже его не читают).

  // 2. Обработка ответа — блок «Если кандидат хочет созвониться».
  //
  // Storage: descriptionJson.automation.callIntent = {
  //   enabled, mode, keywords, insistDemoMessages: [s1, s2, s3]
  // }
  //
  // Дефолт mode="insist-demo" (Сессия 5). enabled=false по умолчанию.
  // Два других mode (slot-and-demo, slot-only) — UI present, но действий
  // в backend нет (бэклог). Активны только при mode=insist-demo +
  // enabled=true: scan-incoming подхватывает keywords и шлёт эскалацию.
  const initialCallIntent =
    (initialAutomation.callIntent as {
      enabled?: boolean
      mode?: ResponseReaction
      keywords?: string[]
      insistDemoMessages?: string[]
    }) || {}
  const [callIntentEnabled, setCallIntentEnabled]   = useState<boolean>(initialCallIntent.enabled ?? false)
  const [callIntentMode,    setCallIntentMode]      = useState<ResponseReaction>(initialCallIntent.mode ?? "insist-demo")
  const [callIntentKeywords, setCallIntentKeywords] = useState<string[]>(
    Array.isArray(initialCallIntent.keywords) && initialCallIntent.keywords.length > 0
      ? initialCallIntent.keywords
      : DEFAULT_CALL_INTENT_KEYWORDS,
  )
  const [keywordInput, setKeywordInput] = useState("")
  const [insistMessages, setInsistMessages] = useState<[string, string, string]>(() => {
    const src = initialCallIntent.insistDemoMessages
    if (Array.isArray(src)) {
      return [
        src[0] ?? DEFAULT_INSIST_DEMO_MESSAGES[0],
        src[1] ?? DEFAULT_INSIST_DEMO_MESSAGES[1],
        src[2] ?? DEFAULT_INSIST_DEMO_MESSAGES[2],
      ]
    }
    return [...DEFAULT_INSIST_DEMO_MESSAGES]
  })

  // Legacy responseReaction — оставлен в state ради обратной совместимости
  // descriptionJson.automation.responseReaction, в UI больше не используется
  // (заменён на callIntent.mode выше).
  const responseReaction = (initialAutomation.responseReaction as ResponseReaction) || "slot-and-demo"

  const addKeyword = () => {
    const k = keywordInput.trim().toLowerCase()
    if (!k) return
    if (callIntentKeywords.includes(k)) {
      toast.error("Это слово уже есть")
      return
    }
    setCallIntentKeywords([...callIntentKeywords, k])
    setKeywordInput("")
  }
  const removeKeyword = (idx: number) => {
    setCallIntentKeywords(callIntentKeywords.filter((_, i) => i !== idx))
  }
  const updateInsistMessage = (idx: 0 | 1 | 2, text: string) => {
    const next: [string, string, string] = [...insistMessages] as [string, string, string]
    next[idx] = text
    setInsistMessages(next)
  }
  // #57: refs на 3 текстарии insistMessages для PlaceholderBadges.
  const insistRefs = useRef<Array<HTMLTextAreaElement | null>>([null, null, null])

  // 3. Цепочка дожима — переехала в отдельный компонент VacancyFollowupSettings
  // (API: /api/modules/hr/vacancies/[id]/followup-settings, таблица
  // vacancy_followup_campaigns). Устаревшие ключи в descriptionJson.automation
  // (followUpEnabled, followUpPreset, stopOnNo, stopOnClose) больше не читаются
  // и не пишутся; orphan-данные могут сохраняться в БД до миграции.

  // 4. Сценарий — переехал в новый таб «Сценарий» (Ф7), components/vacancies/scenario-tab.tsx.
  // 5. Воронка найма — переехала в новый таб «Воронка» (Ф3), components/vacancies/funnel-tab.tsx.
  const [saving, setSaving] = useState(false)

  // 6. Авто-действия
  // Дефолты: autoInvite/autoReject включены, notifyManager выключен (см. ТЗ).
  // Поля rejectTemplate / inviteTemplate удалены из UI — их роль выполняют
  // messageTemplates.soft_reject и messageTemplates.demo_invite соответственно
  // (редактируются в табе «Сообщения» → «Шаблоны сообщений»).
  // Старые поля в descriptionJson.automation остаются как orphan-данные у вакансий,
  // которые не успели мигрировать через scripts/migrate-templates.ts.
  const [autoInvite, setAutoInvite] = useState<boolean>(
    typeof initialAutomation.autoInvite === "boolean" ? (initialAutomation.autoInvite as boolean) : true
  )
  const [autoReject, setAutoReject] = useState<boolean>(
    typeof initialAutomation.autoReject === "boolean" ? (initialAutomation.autoReject as boolean) : true
  )
  const [notifyManager, setNotifyManager] = useState<boolean>(
    typeof initialAutomation.notifyManager === "boolean" ? (initialAutomation.notifyManager as boolean) : false
  )

  // Дебаунсированное сохранение блока «Автоматические действия» через PATCH.
  // Полная сборка автоматизации всё ещё доступна через нижнюю кнопку «Сохранить настройки» (PUT) —
  // оба пути сходятся в descriptionJson.automation благодаря merge'у на сервере.
  const automationDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const automationMountRef = useRef(true)
  const [automationSaving, setAutomationSaving] = useState(false)
  useEffect(() => {
    if (automationMountRef.current) {
      automationMountRef.current = false
      return
    }
    if (automationDebounceRef.current) clearTimeout(automationDebounceRef.current)
    automationDebounceRef.current = setTimeout(async () => {
      try {
        setAutomationSaving(true)
        const res = await fetch(`/api/modules/hr/vacancies/${vacancyId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            automation: {
              autoInvite,
              autoReject,
              notifyManager,
            },
          }),
        })
        if (!res.ok) throw new Error("save failed")
        toast.success("Настройки авто-действий сохранены", { duration: 1500 })
      } catch {
        toast.error("Не удалось сохранить авто-действия")
      } finally {
        setAutomationSaving(false)
      }
    }, 700)
    return () => {
      if (automationDebounceRef.current) clearTimeout(automationDebounceRef.current)
    }
  }, [vacancyId, autoInvite, autoReject, notifyManager])

  // 9. Дозапрос данных
  const initialCompleteness = (initialAutomation.completenessCheck as { enabled?: boolean; threshold?: number; channel?: string; delay?: string }) || {}
  const [completenessEnabled, setCompletenessEnabled] = useState(initialCompleteness.enabled ?? false)
  const [completenessThreshold, setCompletenessThreshold] = useState(String(initialCompleteness.threshold ?? 70))
  const [completenessChannel, setCompletenessChannel] = useState(initialCompleteness.channel || "email")
  const [completenessDelay, setCompletenessDelay] = useState(initialCompleteness.delay || "1hour")

  // 8. AI-агент (#24: переименован с «Бот-звонарь»)
  const initialDialer = (initialAutomation.dialer as { enabled?: boolean; scriptId?: string; trigger?: string }) || {}
  const [dialerEnabled, setDialerEnabled] = useState(initialDialer.enabled ?? false)
  const [dialerScriptId, setDialerScriptId] = useState(initialDialer.scriptId || "")
  const [dialerTrigger, setDialerTrigger] = useState(initialDialer.trigger || "after_screening")

  // 7. FAQ — справочник готовых ответов для ручного копирования (Сессия 7).
  // Storage: descriptionJson.faq (массив { topic, text }).
  // Дефолтный набор 6 тем заполняется миграцией 0110 для существующих
  // вакансий; для новых — fallback на DEFAULT_FAQ при пустом массиве.
  const initialFaq = (() => {
    if (descriptionJson && typeof descriptionJson === "object" && descriptionJson !== null) {
      const dj = descriptionJson as Record<string, unknown>
      const raw = dj.faq
      if (Array.isArray(raw) && raw.length > 0) {
        return raw.map(r => ({
          topic: typeof (r as { topic?: unknown })?.topic === "string" ? (r as { topic: string }).topic : "",
          text:  typeof (r as { text?: unknown })?.text  === "string" ? (r as { text:  string }).text  : "",
        }))
      }
    }
    return DEFAULT_FAQ
  })()
  const [faq, setFaq] = useState<FaqItem[]>(initialFaq)

  // anketaConfirmation — устаревший блок (#19). UI удалён 22.05.2026, поле
  // descriptionJson.automation.anketaConfirmation остаётся в БД для совместимости
  // с уже запланированными follow_up_messages, но новые записи не пишем.
  // Источник истины для авто-сообщения после анкеты — anketaAutoReply в
  // demos.post_demo_settings (рендерится в табе «Воронка»).

  // Save all automation settings to API
  const saveSettings = useCallback(async () => {
    setSaving(true)
    try {
      const currentJson = (descriptionJson && typeof descriptionJson === "object" && descriptionJson !== null)
        ? descriptionJson as Record<string, unknown>
        : {}

      // workingHours переехали в schedule_* колонки и редактируются через
      // /api/modules/hr/vacancies/[id]/schedule-settings; здесь не сохраняем.
      const previousWorkingHours = (currentJson.automation as Record<string, unknown> | undefined)?.workingHours
      // #20: пишем оба поля для backward compatibility.
      //   delaySeconds — новое (15..3600);
      //   delayMinutes — старое (в минутах, дробное при <60s). cron/process-queue
      //   при чтении будет предпочитать delaySeconds, если оба заполнены.
      const delaySecondsNum = Number(firstMessageDelay)
      const automationData = {
        delaySeconds: Number.isFinite(delaySecondsNum) ? delaySecondsNum : 180,
        delayMinutes: Number.isFinite(delaySecondsNum) ? Math.max(1, Math.round(delaySecondsNum / 60)) : 3,
        ...(previousWorkingHours ? { workingHours: previousWorkingHours } : {}),
        responseReaction,
        autoInvite,
        autoReject,
        notifyManager,
        callIntent: {
          enabled:            callIntentEnabled,
          mode:               callIntentMode,
          keywords:           callIntentKeywords,
          insistDemoMessages: insistMessages,
        },
        // #19: anketaConfirmation не пишем — UI блок удалён. Если в БД уже
        // лежит старая запись — она будет затёрта ниже через PUT всего
        // descriptionJson; чтобы не терять её для уже запланированных
        // follow_up_messages, сохраним существующее значение из БД как есть.
        ...((currentJson.automation as Record<string, unknown> | undefined)?.anketaConfirmation
          ? { anketaConfirmation: (currentJson.automation as Record<string, unknown>).anketaConfirmation }
          : {}),
        dialer: { enabled: dialerEnabled, scriptId: dialerScriptId, trigger: dialerTrigger },
        completenessCheck: { enabled: completenessEnabled, threshold: Number(completenessThreshold), channel: completenessChannel, delay: completenessDelay },
      }

      // scenario и pipeline теперь сохраняются через отдельные API:
      // PUT /api/modules/hr/vacancies/[id]/scenario (Ф7)
      // PUT /api/modules/hr/vacancies/[id]/pipeline (Ф3)
      const res = await fetch(`/api/modules/hr/vacancies/${vacancyId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description_json: {
            ...currentJson,
            automation: automationData,
            // FAQ хранится на корне descriptionJson, а не внутри automation
            // (по плану Сессии 7 п.10).
            faq: faq.filter(f => f.topic.trim() || f.text.trim()).slice(0, MAX_FAQ_ITEMS),
          },
        }),
      })

      if (!res.ok) throw new Error("Ошибка сохранения")
      toast.success("Настройки автоматизации сохранены")
    } catch {
      toast.error("Не удалось сохранить настройки")
    } finally {
      setSaving(false)
    }
  }, [vacancyId, descriptionJson, firstMessageDelay, responseReaction, autoInvite, autoReject, notifyManager, faq, callIntentEnabled, callIntentMode, callIntentKeywords, insistMessages, dialerEnabled, dialerScriptId, dialerTrigger, completenessEnabled, completenessThreshold, completenessChannel, completenessDelay])

  // ─── P0-50: регистрация секций в sticky-bar ───────────────────────
  // Грузимся-готовы, когда descriptionJson распарсен (родитель передаёт
  // его сразу при mount; undefined → ещё не подтянули).
  const loadedReady = tabKey !== undefined && descriptionJson !== undefined
  // tabKey ?? "messages" — useVacancySectionRegister всегда требует ключ;
  // если tabKey не задан, loadedReady=false → секция фактически не
  // регистрируется (loaded остаётся false).
  const effectiveTab: VacancyTabKey = tabKey ?? "messages"

  // 1. «Первое сообщение» — invite шаблон + задержка.
  //    invite шлётся в ai-settings, остальное — в descriptionJson через saveSettings.
  //    #19: anketaConfirmation удалён — отслеживать его в watchedValues
  //    больше не нужно (поле остаётся в БД as-is).
  useVacancySectionRegister({
    sectionKey: `automation-${vacancyId}-${effectiveTab}-invite`,
    tabKey: effectiveTab,
    loaded: loadedReady && (sections?.includes("firstMessage") ?? true),
    watchedValues: {
      firstMessageText, firstMessageDelay,
    },
    save: async () => {
      // P0-43 fix: invite сначала. Если валидация упала (400) — throw
      // прокидывается в sticky-bar, секция остаётся dirty, saveSettings
      // НЕ вызывается (иначе success-toast «Настройки сохранены» затрёт
      // ошибку и пользователь решит, что всё ОК).
      await saveInviteMessage()
      await saveSettings()
    },
  })

  // 2. reInvite — текст для повторной отправки.
  useVacancySectionRegister({
    sectionKey: `automation-${vacancyId}-${effectiveTab}-reinvite`,
    tabKey: effectiveTab,
    loaded: loadedReady && (sections?.includes("firstMessage") ?? true),
    watchedValues: { reInviteText },
    save: saveReInviteMessage,
  })

  // 3. callIntent + templates (FAQ) — обе секции таба «Сообщения» через saveSettings.
  useVacancySectionRegister({
    sectionKey: `automation-${vacancyId}-${effectiveTab}-callintent`,
    tabKey: effectiveTab,
    loaded: loadedReady && (
      (sections?.includes("callIntent") ?? true) || (sections?.includes("templates") ?? true)
    ),
    watchedValues: {
      callIntentEnabled, callIntentMode, callIntentKeywords, insistMessages, faq,
    },
    save: saveSettings,
  })

  // 4. dialer (бот-звонарь) — таб «Интеграции».
  useVacancySectionRegister({
    sectionKey: `automation-${vacancyId}-${effectiveTab}-bot`,
    tabKey: effectiveTab,
    loaded: loadedReady && (sections?.includes("dialer") ?? true),
    watchedValues: { dialerEnabled, dialerScriptId, dialerTrigger },
    save: saveSettings,
  })

  return (
    <div className="space-y-6">
      {/* ═══ 1. Первое сообщение ═══════════════════════════════ */}
      {showSection("firstMessage") && (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Send className="w-4 h-4" />
            Первое сообщение
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Минимальная задержка перед первым сообщением.
              Реальная задержка может быть больше: всё зависит от очереди cron'а
              разбора hh-откликов (см. lib/hh/process-queue.ts).
              #60: когда серия первых сообщений включена — этот блок дублирует
              chain[0].delaySeconds. Показываем плашку-подсказку, сам Select
              скрываем, чтобы HR не редактировал «мёртвое» поле. */}
          {chainActive ? (
            <div className="rounded-lg border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">
              Минимальная задержка перед первым сообщением управляется в блоке
              «Серия первых сообщений» выше — задержка берётся из Сообщения 1.
              Этот старый параметр больше не используется.
            </div>
          ) : (
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-0.5 flex-1">
                <Label className="text-sm font-medium">Минимальная задержка перед первым сообщением</Label>
                <p className="text-xs text-muted-foreground">
                  Чтобы первое сообщение не выглядело как автоматика. Реальная задержка может быть больше из-за обработки очереди.
                </p>
              </div>
              <Select value={firstMessageDelay} onValueChange={setFirstMessageDelay}>
                <SelectTrigger className="w-[140px] h-9 shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="15">15 секунд</SelectItem>
                  <SelectItem value="30">30 секунд</SelectItem>
                  <SelectItem value="60">1 минута</SelectItem>
                  <SelectItem value="180">3 минуты</SelectItem>
                  <SelectItem value="900">15 минут</SelectItem>
                  <SelectItem value="1800">30 минут</SelectItem>
                  <SelectItem value="3600">1 час</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Рабочие часы и нерабочие дни редактируются в отдельной секции
              «Расписание» под цепочкой дожима — см. VacancyScheduleSettings. */}

          {/* #21: блок «Шаблон сообщения» переехал в FirstMessagesChainEditor.
              Один textarea заменён на серию из 3 шагов с тумблерами и
              задержками. См. components/vacancies/first-messages-chain-editor.tsx.
              Эта Card теперь содержит только глобальную задержку (используется
              как fallback для chain[0] если массив пустой) и блок reInvite ниже.
          */}

          {/* #19: блок «Подтверждение после анкеты» УДАЛЁН отсюда. Его
              функция дублирует «Автоответ после заполнения анкеты» в табе
              «Воронка» (PostDemoSettings → anketaAutoReply). Старое поле
              automation.anketaConfirmation в descriptionJson сохраняется
              в БД как есть для уже запланированных follow_up_messages с
              branch='anketa_confirmation' (cron их корректно достреливает),
              но новые анкеты планируют только anketaAutoReply. */}

          {/* #46: блок «Текст для повторной отправки» удалён из этой
              карточки. Переехал в отдельный компонент RecoveryMessageSettings
              под спойлером в табе «Сообщения» — opt-in, по умолчанию ВЫКЛ,
              чтобы автоматика не дёргала кандидатов дубликатами. */}
        </CardContent>
      </Card>
      )}

      {/* ═══ 2. Если кандидат хочет созвониться ═════════════════ */}
      {showSection("callIntent") && (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Brain className="w-4 h-4" />
                Если кандидат хочет созвониться
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Парсер ключевых слов в ответе кандидата → отправляет один из трёх эскалационных шаблонов и продолжает дожимать на демо.
              </p>
            </div>
            <Switch checked={callIntentEnabled} onCheckedChange={setCallIntentEnabled} />
          </div>
        </CardHeader>
        <CardContent className={cn("space-y-4", !callIntentEnabled && "opacity-60")}>
          {/* Ключевые слова — редактируемые чипсы. */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Ключевые слова</Label>
            <p className="text-[11px] text-muted-foreground">
              Если в ответе кандидата встречается одно из этих слов — система определяет это как «хочет созвониться».
            </p>
            <div className="flex flex-wrap gap-1.5">
              {callIntentKeywords.map((w, idx) => (
                <span
                  key={`${w}-${idx}`}
                  className="inline-flex items-center gap-1 rounded-full bg-secondary/80 px-2.5 py-1 text-xs font-mono"
                >
                  {w}
                  <button
                    type="button"
                    onClick={() => removeKeyword(idx)}
                    disabled={!callIntentEnabled}
                    className="hover:text-destructive disabled:opacity-50 disabled:cursor-not-allowed"
                    aria-label={`Удалить ${w}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={keywordInput}
                onChange={e => setKeywordInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addKeyword() } }}
                placeholder="Добавить слово…"
                disabled={!callIntentEnabled}
                className="h-9 text-sm"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addKeyword}
                disabled={!callIntentEnabled || !keywordInput.trim()}
                className="gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                Добавить
              </Button>
            </div>
          </div>

          {/* Реакция системы — выбор режима. */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Реакция системы</Label>
            <div className="space-y-2">
              {([
                { value: "slot-and-demo" as const, label: "Предложить слот + мягко предложить демо параллельно", desc: "Максимальная конверсия", soon: true },
                { value: "slot-only"     as const, label: "Сразу дать слот без демо",                              desc: "Быстрый процесс",         soon: true },
                { value: "insist-demo"   as const, label: "Настоять на демо перед звонком",                        desc: "Фильтрация немотивированных", soon: false },
              ]).map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  disabled={!callIntentEnabled || opt.soon}
                  className={cn(
                    "w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-all",
                    callIntentMode === opt.value && !opt.soon
                      ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                      : "border-border hover:border-primary/30",
                    (opt.soon || !callIntentEnabled) && "opacity-60 cursor-not-allowed",
                  )}
                  onClick={() => !opt.soon && setCallIntentMode(opt.value)}
                >
                  <div className={cn(
                    "w-4 h-4 rounded-full border-2 mt-0.5 shrink-0 flex items-center justify-center",
                    callIntentMode === opt.value && !opt.soon ? "border-primary" : "border-muted-foreground/40",
                  )}>
                    {callIntentMode === opt.value && !opt.soon && <div className="w-2 h-2 rounded-full bg-primary" />}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-foreground flex items-center gap-2">
                      {opt.label}
                      {opt.soon && <Badge variant="outline" className="text-[10px] h-4 px-1.5">Скоро</Badge>}
                    </p>
                    <p className="text-xs text-muted-foreground">{opt.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Эскалационные шаблоны — только для insist-demo. */}
          {callIntentMode === "insist-demo" && (
            <div className="space-y-3 border-t pt-3">
              <div className="flex items-center gap-2">
                <Label className="text-sm font-medium">Эскалационные шаблоны</Label>
                <Badge variant="secondary" className="text-[10px] h-4 px-1.5">3 текста</Badge>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Каждый раз когда кандидат повторно пишет о звонке — отправляется следующий шаблон. После №3 — больше не реагируем на ключевые слова в рамках этой вакансии.
              </p>
              {insistMessages.map((text, idx) => (
                <div key={idx} className="space-y-1.5">
                  <Label className="text-xs font-medium">
                    Шаблон №{idx + 1}{idx === 2 && " — финальный"}
                  </Label>
                  <textarea
                    ref={(el) => { insistRefs.current[idx] = el }}
                    value={text}
                    onChange={e => updateInsistMessage(idx as 0 | 1 | 2, e.target.value)}
                    rows={3}
                    disabled={!callIntentEnabled}
                    className="border-input flex w-full rounded-md border bg-[var(--input-bg)] px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring resize-y"
                  />
                  {/* #57: кликабельные плейсхолдеры */}
                  <PlaceholderBadges
                    getTextarea={() => insistRefs.current[idx]}
                    placeholders={["name", "vacancy", "demo_link"]}
                    value={text}
                    onValueChange={(v) => updateInsistMessage(idx as 0 | 1 | 2, v)}
                  />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      )}

      {/* ═══ 3. Цепочка дожима — удалена. ═══════════════════════
          Источник истины — VacancyFollowupSettings (vacancy_followup_campaigns).
          showSection("followup") сохранён в типе AutomationSectionId,
          но больше не рендерит UI — для обратной совместимости с
          вызывающими компонентами, которые могут ещё передавать "followup"
          в массиве sections. */}

      {/* ═══ 5. Воронка найма ═══ удалена в Ф1.
          Источник истины — таб «Воронка» (Ф3, components/vacancies/funnel-tab.tsx),
          сохраняется через PUT /api/modules/hr/vacancies/[id]/pipeline. */}

      {/* ═══ 6. Автоматические действия ═══ удалено в Сессии 6.
          Источник истины — блок «AI-фильтр откликов» в табе «Дожим»
          (components/vacancies/vacancy-ai-process-settings.tsx).
          AutomationSectionId.autoActions оставлен в типе ради
          обратной совместимости sections={[...]}, но UI не рендерим. */}

      {/* ═══ 9. Дозапрос данных ═══════════════════════════════ */}
      {showSection("enrichment") && (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardList className="w-4 h-4" />
            Дозапрос данных у кандидата
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium flex items-center gap-2">
                Автоматически запрашивать недостающие данные
                <Badge variant="outline" className="text-[10px] h-4 px-1.5">Скоро</Badge>
              </p>
              <p className="text-xs text-muted-foreground">После прохождения демонстрации AI проверяет профиль и просит дополнить</p>
            </div>
            <Switch checked={completenessEnabled} onCheckedChange={setCompletenessEnabled} disabled />
          </div>
          {completenessEnabled && (
            <div className="space-y-3 pl-4 border-l-2 border-primary/20">
              <div className="space-y-1.5">
                <Label className="text-xs">Порог заполненности (%)</Label>
                <div className="flex items-center gap-3">
                  <input type="range" min="30" max="100" step="10" value={completenessThreshold}
                    onChange={e => setCompletenessThreshold(e.target.value)}
                    className="flex-1 h-2 accent-primary" />
                  <span className="text-sm font-medium w-10 text-right">{completenessThreshold}%</span>
                </div>
                <p className="text-[11px] text-muted-foreground">Запрашивать если заполнено менее {completenessThreshold}%</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Канал</Label>
                <Select value={completenessChannel} onValueChange={setCompletenessChannel}>
                  <SelectTrigger className="h-9 text-sm w-[200px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="telegram">Telegram</SelectItem>
                    <SelectItem value="both">Оба канала</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Когда отправлять</Label>
                <Select value={completenessDelay} onValueChange={setCompletenessDelay}>
                  <SelectTrigger className="h-9 text-sm w-[200px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="immediately">Сразу после демо</SelectItem>
                    <SelectItem value="1hour">Через 1 час</SelectItem>
                    <SelectItem value="24hours">Через 24 часа</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      )}

      {/* ═══ 7. Частые вопросы (FAQ) — Сессия 7 ═══════════════ */}
      {showSection("templates") && (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="w-4 h-4" />
            Частые вопросы кандидатов
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Готовые ответы на типовые вопросы кандидатов. Для ручного копирования в чат hh.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {faq.map((item, idx) => (
            <div key={idx} className="space-y-1.5 rounded-md border bg-muted/20 p-3">
              <div className="flex items-center justify-between gap-2">
                <Input
                  value={item.topic}
                  onChange={e => setFaq(prev => prev.map((f, i) => i === idx ? { ...f, topic: e.target.value } : f))}
                  placeholder="Название темы"
                  className="h-7 text-xs font-medium flex-1 max-w-[240px]"
                />
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[10px] gap-1 px-2"
                    onClick={async () => {
                      await navigator.clipboard.writeText(item.text)
                      toast.success("Скопировано")
                    }}
                  >
                    Копировать
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-[10px] gap-1 px-2 text-destructive hover:text-destructive"
                    onClick={() => setFaq(prev => prev.filter((_, i) => i !== idx))}
                    aria-label={`Удалить «${item.topic || "вопрос"}»`}
                  >
                    ✕ Удалить
                  </Button>
                </div>
              </div>
              <Textarea
                value={item.text}
                onChange={e => setFaq(prev => prev.map((f, i) => i === idx ? { ...f, text: e.target.value } : f))}
                rows={2}
                className="text-xs resize-y bg-[var(--input-bg)] border border-input"
                placeholder="Текст ответа…"
              />
            </div>
          ))}
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-muted-foreground">
              Переменные: {"{{name}}"}, {"{{vacancy}}"}, {"{{salary_from}}"}, {"{{salary_to}}"}, {"{{demo_link}}"}, {"{{interview_at}}"}
            </p>
            {faq.length < MAX_FAQ_ITEMS && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1.5"
                onClick={() => setFaq(prev => [...prev, { topic: "", text: "" }])}
              >
                <Plus className="w-3.5 h-3.5" />
                Добавить вопрос
              </Button>
            )}
          </div>
          {faq.length === 0 && (
            <p className="text-[11px] text-muted-foreground italic text-center py-2">
              Нет тем. Нажмите «Добавить вопрос», чтобы создать первую.
            </p>
          )}
        </CardContent>
      </Card>
      )}

      {/* ═══ 8. AI-агент (звонки кандидатам). #24: переименован с
             «Бот-звонарь». Сама фича всё ещё «Скоро». ════════════ */}
      {showSection("dialer") && (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Phone className="w-4 h-4" />
            Звонки кандидатам
            <Badge variant="outline" className="text-[10px] h-4 px-1.5">Скоро</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Подключить AI агента</p>
              <p className="text-xs text-muted-foreground">Агент автоматически будет звонить кандидатам по выбранному сценарию</p>
            </div>
            <Switch checked={dialerEnabled} onCheckedChange={setDialerEnabled} disabled />
          </div>
          {dialerEnabled && (
            <div className="space-y-3 pl-4 border-l-2 border-primary/20">
              <div className="space-y-1.5">
                <Label className="text-xs">Когда звонить</Label>
                <Select value={dialerTrigger} onValueChange={setDialerTrigger}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="after_response">После отклика</SelectItem>
                    <SelectItem value="after_screening">После AI-скрининга</SelectItem>
                    <SelectItem value="manual">Вручную</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">ID скрипта звонка</Label>
                <Input value={dialerScriptId} onChange={e => setDialerScriptId(e.target.value)}
                  placeholder="Выберите скрипт в модуле AI-агент" className="h-9 text-sm bg-[var(--input-bg)] border border-input" />
              </div>
              <a href="/dialer" className="text-xs text-primary hover:underline">Настроить скрипты в модуле AI-агент →</a>
            </div>
          )}
        </CardContent>
      </Card>
      )}

      {/* ═══ 4. Последовательность взаимодействия ═══ удалена в Ф1.
          5 пресетов (демо→звонок и т.д.) переосмыслены в табе «Сценарий» (Ф7,
          components/vacancies/scenario-tab.tsx, lib/scenarios.ts). */}

      {/* Кнопка сохранения */}
      {showLocalGlobalSave && (
        <div className="flex justify-end mt-3">
          <Button size="sm" className="gap-1.5 h-8 text-xs" onClick={saveSettings} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Сохранить настройки
          </Button>
        </div>
      )}
    </div>
  )
}
