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
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  MessageSquare, Zap, Phone, Brain, Send, Check,
  ClipboardList, Loader2, Plus, X,
} from "lucide-react"

// ─── Типы ────────────────────────────────────────────────────

type ResponseReaction = "slot-and-demo" | "slot-only" | "insist-demo"

// ScenarioType / StepType / SCENARIO_PRESETS («Последовательность взаимодействия») и
// PIPELINE_PRESETS («Этапы воронки») удалены в Ф1 рефакторинга 2026-05-10.
// Замена: lib/stages.ts (Ф2) + components/vacancies/funnel-tab.tsx (Ф3) + scenario-tab.tsx (Ф7).

// ─── Данные по-умолчанию ─────────────────────────────────────

const DEFAULT_FIRST_MESSAGE = `[Имя], привет! Видели ваш отклик на [должность] — выглядит интересно 👋
Чтобы не тратить ваше время на формальное интервью, сделали короткий обзор должности на 15 мин — там реальные цифры дохода и как устроена работа.
Если после просмотра захотите пообщаться — сразу договоримся на звонок 🙂
[ссылка]`

const DEFAULT_CALL_INTENT_KEYWORDS = ["созвон", "позвоните", "номер", "телефон", "голос"]
const DEFAULT_INSIST_DEMO_MESSAGES: [string, string, string] = [
  "{Имя}, понял что хотите созвониться. Чтобы не тратить ваше и моё время, предлагаю сначала пройти короткую демонстрацию должности — там ответы на 90% типовых вопросов: {ссылка}",
  "{Имя}, так как мы сейчас в работе, всё-таки предлагаю сначала ознакомиться с демонстрацией должности и ответить на вопросы. Ваши ответы попадут к нам, и после этого назначим время для звонка: {ссылка}",
  "{Имя}, наша система сбора устроена так, что созваниваемся с кандидатом только после прохождения демонстрации должности и ответов на вопросы. Спасибо за понимание! Демонстрация: {ссылка}",
]
const TEMPLATE_KEYS = ["salary", "demo_invite", "soft_reject", "info_request", "interview_invite"] as const
type TemplateKey = typeof TEMPLATE_KEYS[number]

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
  /** Если задано — рендерятся только эти карточки. Иначе все. */
  sections?: AutomationSectionId[]
  /** Показать глобальную кнопку «Сохранить настройки» внизу. По умолчанию true. */
  showGlobalSave?: boolean
}

export function AutomationSettings({ vacancyId, descriptionJson, aiProcessSettings, sections, showGlobalSave = true }: AutomationSettingsProps) {
  const showSection = (id: AutomationSectionId): boolean => !sections || sections.includes(id)

  // Parse automation settings from descriptionJson
  const initialAutomation = (() => {
    if (descriptionJson && typeof descriptionJson === "object" && descriptionJson !== null) {
      const dj = descriptionJson as Record<string, unknown>
      return (dj.automation as Record<string, unknown>) || {}
    }
    return {}
  })()

  // 1. Первое сообщение
  const [firstMessageDelay, setFirstMessageDelay] = useState(String(initialAutomation.delayMinutes ?? "3"))
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
      if (!res.ok) throw new Error("Ошибка сохранения")
      setSavedInviteMessage(firstMessageText)
      toast.success("Сохранено")
    } catch {
      toast.error("Не удалось сохранить")
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
      if (!res.ok) throw new Error("Ошибка сохранения")
      setSavedReInviteMessage(reInviteText)
      toast.success("Сохранено")
    } catch {
      toast.error("Не удалось сохранить")
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

  // 8. Бот-звонарь
  const initialDialer = (initialAutomation.dialer as { enabled?: boolean; scriptId?: string; trigger?: string }) || {}
  const [dialerEnabled, setDialerEnabled] = useState(initialDialer.enabled ?? false)
  const [dialerScriptId, setDialerScriptId] = useState(initialDialer.scriptId || "")
  const [dialerTrigger, setDialerTrigger] = useState(initialDialer.trigger || "after_screening")

  // 7. Шаблоны сообщений (inherit from global)
  const hardcodedDefaults: Record<string, string> = {
    salary: "Здравствуйте, {имя}! Зарплата на позиции {должность} составляет {зп_от} — {зп_до} ₽. Подробнее об условиях — в презентации должности: {ссылка_на_демонстрацию}",
    demo_invite: "Здравствуйте, {имя}! Благодарим за интерес к позиции {должность}. Пожалуйста, ознакомьтесь с презентацией должности: {ссылка_на_демонстрацию}. После просмотра мы свяжемся с вами.",
    soft_reject: "Здравствуйте, {имя}! Благодарим за интерес к позиции {должность}. К сожалению, на данный момент мы остановились на других кандидатах. Желаем успехов!",
    info_request: "Здравствуйте, {имя}! Нам интересна ваша кандидатура на позицию {должность}. Не могли бы вы дополнительно рассказать о вашем опыте?",
    interview_invite: "Здравствуйте, {имя}! Мы хотели бы пригласить вас на собеседование на позицию {должность}. Удобное время: {дата_время}. Формат: онлайн.",
  }
  const globalTemplates = (() => {
    try {
      const saved = typeof window !== "undefined" ? localStorage.getItem("mk_hr_message_templates") : null
      return saved ? { ...hardcodedDefaults, ...JSON.parse(saved) } : hardcodedDefaults
    } catch { return hardcodedDefaults }
  })()
  const templateLabels: Record<string, string> = {
    salary: "Вопрос о зарплате",
    demo_invite: "Приглашение на демонстрацию",
    soft_reject: "Мягкий отказ",
    info_request: "Запрос доп. информации",
    interview_invite: "Приглашение на собеседование",
  }
  const [messageTemplates, setMessageTemplates] = useState<Record<string, string>>(() => {
    const saved = (initialAutomation.messageTemplates as Record<string, string>) || {}
    return { ...globalTemplates, ...saved }
  })

  // Master-тумблер и per-template чекбоксы для блока «Шаблоны сообщений».
  // Storage: descriptionJson.automation.templatesMeta = {
  //   masterEnabled: boolean,
  //   enabled: { salary: bool, demo_invite: bool, soft_reject: bool, ... }
  // }
  // Дефолт: master OFF, все per-template ON.
  const initialTemplatesMeta = (initialAutomation.templatesMeta as {
    masterEnabled?: boolean
    enabled?: Record<string, boolean>
  } | undefined) || {}
  const [templatesMasterEnabled, setTemplatesMasterEnabled] = useState<boolean>(initialTemplatesMeta.masterEnabled ?? false)
  const [templatesEnabled, setTemplatesEnabled] = useState<Record<TemplateKey, boolean>>(() => {
    const src = initialTemplatesMeta.enabled ?? {}
    return TEMPLATE_KEYS.reduce((acc, k) => {
      acc[k] = typeof src[k] === "boolean" ? src[k] : true
      return acc
    }, {} as Record<TemplateKey, boolean>)
  })

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
      const automationData = {
        delayMinutes: Number(firstMessageDelay),
        ...(previousWorkingHours ? { workingHours: previousWorkingHours } : {}),
        responseReaction,
        autoInvite,
        autoReject,
        notifyManager,
        messageTemplates,
        templatesMeta: {
          masterEnabled: templatesMasterEnabled,
          enabled:       templatesEnabled,
        },
        callIntent: {
          enabled:            callIntentEnabled,
          mode:               callIntentMode,
          keywords:           callIntentKeywords,
          insistDemoMessages: insistMessages,
        },
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
  }, [vacancyId, descriptionJson, firstMessageDelay, responseReaction, autoInvite, autoReject, notifyManager, messageTemplates, templatesMasterEnabled, templatesEnabled, callIntentEnabled, callIntentMode, callIntentKeywords, insistMessages, dialerEnabled, dialerScriptId, dialerTrigger, completenessEnabled, completenessThreshold, completenessChannel, completenessDelay])

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
              разбора hh-откликов (см. lib/hh/process-queue.ts). */}
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
                <SelectItem value="2">2 минуты</SelectItem>
                <SelectItem value="3">3 минуты</SelectItem>
                <SelectItem value="5">5 минут</SelectItem>
                <SelectItem value="10">10 минут</SelectItem>
                <SelectItem value="15">15 минут</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Рабочие часы и нерабочие дни редактируются в отдельной секции
              «Расписание» под цепочкой дожима — см. VacancyScheduleSettings. */}

          {/* Шаблон */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Шаблон сообщения</Label>
            <textarea
              className="w-full border rounded-lg p-3 text-sm resize-none h-36 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none leading-relaxed"
              value={firstMessageText}
              onChange={(e) => setFirstMessageText(e.target.value)}
              placeholder="Текст первого сообщения..."
            />
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex flex-wrap gap-1.5">
                {["[Имя]", "[должность]", "[компания]", "[ссылка]"].map(v => (
                  <Badge key={v} variant="outline" className="text-xs cursor-default">{v}</Badge>
                ))}
              </div>
              <Button
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={saveInviteMessage}
                disabled={!inviteDirty || savingInvite}
              >
                {savingInvite ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                Сохранить
              </Button>
            </div>
          </div>

          {/* Шаблон для повторной отправки */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Текст для повторной отправки (если ссылка была сломана)</Label>
            <textarea
              className="w-full border rounded-lg p-3 text-sm resize-none h-36 bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none leading-relaxed"
              value={reInviteText}
              onChange={(e) => setReInviteText(e.target.value)}
              placeholder="Здравствуйте, [Имя]! Извините — в прошлом сообщении была неактуальная ссылка. Вот рабочая: [ссылка]"
            />
            <p className="text-[11px] text-muted-foreground">
              Используется для кандидатов, которым уже отправлялось сообщение ранее (например, после исправления битых ссылок).
            </p>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex flex-wrap gap-1.5">
                {["[Имя]", "[должность]", "[компания]", "[ссылка]"].map(v => (
                  <Badge key={v} variant="outline" className="text-xs cursor-default">{v}</Badge>
                ))}
              </div>
              <Button
                size="sm"
                className="h-8 text-xs gap-1.5"
                onClick={saveReInviteMessage}
                disabled={!reInviteDirty || savingReInvite}
              >
                {savingReInvite ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                Сохранить
              </Button>
            </div>
          </div>
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
                  <Textarea
                    value={text}
                    onChange={e => updateInsistMessage(idx as 0 | 1 | 2, e.target.value)}
                    rows={3}
                    disabled={!callIntentEnabled}
                    className="text-sm resize-y"
                  />
                </div>
              ))}
              <p className="text-[11px] text-muted-foreground">
                Плейсхолдеры:{" "}
                <code className="text-[10px] bg-muted px-1 py-0.5 rounded">{"{Имя}"}</code>,{" "}
                <code className="text-[10px] bg-muted px-1 py-0.5 rounded">{"{должность}"}</code>,{" "}
                <code className="text-[10px] bg-muted px-1 py-0.5 rounded">{"{ссылка}"}</code>.
              </p>
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

      {/* ═══ 7. Шаблоны сообщений ════════════════════════════ */}
      {showSection("templates") && (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <MessageSquare className="w-4 h-4" />
                Шаблоны сообщений
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Master выключен — автоматика по шаблонам не работает. Кнопки «Копировать» доступны всегда (для ручного использования HR).
              </p>
            </div>
            <Switch checked={templatesMasterEnabled} onCheckedChange={setTemplatesMasterEnabled} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {TEMPLATE_KEYS.map(key => {
            const label = templateLabels[key]
            return (
              <div key={key} className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={templatesEnabled[key]}
                      onCheckedChange={(v) =>
                        setTemplatesEnabled(prev => ({ ...prev, [key]: v === true }))
                      }
                      disabled={!templatesMasterEnabled}
                    />
                    <Label className="text-xs font-medium cursor-pointer">{label}</Label>
                  </label>
                  <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1 px-2" onClick={async () => {
                    await navigator.clipboard.writeText(messageTemplates[key] || "")
                    toast.success("Скопировано")
                  }}>
                    Копировать
                  </Button>
                </div>
                <Textarea
                  value={messageTemplates[key] || ""}
                  onChange={e => setMessageTemplates(prev => ({ ...prev, [key]: e.target.value }))}
                  rows={2}
                  className="text-xs resize-none bg-[var(--input-bg)] border border-input"
                />
              </div>
            )
          })}
          <div className="flex items-center justify-between">
            <p className="text-[11px] text-muted-foreground">
              Переменные: {"{имя}"}, {"{должность}"}, {"{зп_от}"}, {"{зп_до}"}, {"{ссылка_на_демонстрацию}"}, {"{дата_время}"}
            </p>
            <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => { setMessageTemplates({ ...globalTemplates }); toast.success("Сброшено к шаблонам компании") }}>
              Сбросить к шаблонам компании
            </Button>
          </div>
        </CardContent>
      </Card>
      )}

      {/* ═══ 8. Бот-звонарь ══════════════════════════════════ */}
      {showSection("dialer") && (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Phone className="w-4 h-4" />
            Звонки кандидатам
            <Badge variant="outline" className="text-[10px] ml-1">Бот-звонарь</Badge>
            <Badge variant="outline" className="text-[10px] h-4 px-1.5">Скоро</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Подключить бот-звонарь</p>
              <p className="text-xs text-muted-foreground">Бот автоматически позвонит кандидатам по выбранному сценарию</p>
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
                  placeholder="Выберите скрипт в модуле Бот-звонарь" className="h-9 text-sm bg-[var(--input-bg)] border border-input" />
              </div>
              <a href="/dialer" className="text-xs text-primary hover:underline">Настроить скрипты в модуле Бот-звонарь →</a>
            </div>
          )}
        </CardContent>
      </Card>
      )}

      {/* ═══ 4. Последовательность взаимодействия ═══ удалена в Ф1.
          5 пресетов (демо→звонок и т.д.) переосмыслены в табе «Сценарий» (Ф7,
          components/vacancies/scenario-tab.tsx, lib/scenarios.ts). */}

      {/* Кнопка сохранения */}
      {showGlobalSave && (
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
