"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Save, GitBranch, Zap, Bell, Layers } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import type { CompanyHiringDefaults } from "@/lib/db/schema"
import {
  ALL_STAGE_SLUGS,
  PLATFORM_STAGES,
  FUNNEL_PRESETS,
  STAGE_COLOR_CLASSES,
  type StageSlug,
  type StageColor,
} from "@/lib/stages"

// ─── Словарь сценариев воронки ──────────────────────────────────────────────
// Скопировано из hiring-settings/page.tsx для автономной работы компонента.
// 5 пресетов UI-описания (не путать с FUNNEL_PRESETS из lib/stages.ts —
// те описывают slug-стадии; здесь — читаемые названия этапов для HR).
const FUNNEL_SCENARIOS: Record<string, { label: string; description: string; stages: string[] }> = {
  standard: {
    label: "Стандартный",
    description: "Специалисты и менеджеры — 7 этапов, 7–14 дней.",
    stages: [
      "Новый отклик",
      "Скрининг",
      "Демонстрация",
      "Интервью с HR",
      "Интервью с руководителем",
      "Оффер",
      "Выход на работу",
    ],
  },
  fast: {
    label: "Быстрый",
    description: "Массовый найм, линейный персонал — 5 этапов, 3–5 дней.",
    stages: ["Новый отклик", "Демонстрация", "Интервью", "Оффер", "Выход на работу"],
  },
  test_task: {
    label: "С тестовым заданием",
    description: "Технические роли — обязательно тестовое, 7 этапов, 10–21 день.",
    stages: [
      "Новый отклик",
      "Скрининг",
      "Тестовое задание",
      "Интервью с HR",
      "Интервью с руководителем",
      "Оффер",
      "Выход на работу",
    ],
  },
  two_stage: {
    label: "Двухэтапный",
    description: "Когда нужно только демо + финал — минимальная воронка.",
    stages: ["Новый отклик", "Демонстрация", "Финальное интервью", "Оффер", "Выход на работу"],
  },
  mass: {
    label: "Массовый",
    description: "Работники линии, курьеры, ритейл — групповой формат.",
    stages: [
      "Новый отклик",
      "Демонстрация",
      "Групповое интервью",
      "Оффер",
      "Выход на работу",
    ],
  },
}

// ─── Палитра цветов (для редактора стадий) ───────────────────────────────────
const COLOR_ORDER: StageColor[] = [
  "blue", "indigo", "violet", "purple", "emerald",
  "green", "amber", "orange", "rose", "red", "slate",
]
const STAGE_DOT_CLASSES: Record<StageColor, string> = {
  slate: "bg-slate-500",   blue: "bg-blue-500",    indigo: "bg-indigo-500",
  violet: "bg-violet-500", purple: "bg-purple-500", amber: "bg-amber-500",
  orange: "bg-orange-500", yellow: "bg-yellow-500", lime: "bg-lime-500",
  green: "bg-green-500",   emerald: "bg-emerald-500", rose: "bg-rose-500",
  red: "bg-destructive",
}

// Стадии, показываемые в единой таблице: все из ALL_STAGE_SLUGS
const TABLE_STAGES = ALL_STAGE_SLUGS

// ─── Компонент ───────────────────────────────────────────────────────────────

export function FunnelAutomationSection({
  defaults,
  onPatch,
}: {
  defaults: CompanyHiringDefaults
  onPatch: (patch: Partial<CompanyHiringDefaults>) => Promise<void>
}) {
  // ── Сценарий воронки ──
  const [selectedScenario, setSelectedScenario] = useState(
    defaults.funnelScenario ?? "standard",
  )

  // ── Единая таблица стадий ──
  const [stageHhActions, setStageHhActions] = useState<
    Record<string, "invitation" | "discard" | "assessment" | null>
  >(
    (defaults.stageHhActions as Record<string, "invitation" | "discard" | "assessment" | null>) ?? {},
  )
  const [stageLabels, setStageLabels] = useState<Record<string, string>>(
    (defaults.stageLabels as Record<string, string> | undefined) ?? {},
  )
  const [stageColors, setStageColors] = useState<Record<string, string>>(
    (defaults.stageColors as Record<string, string> | undefined) ?? {},
  )
  const [stageAvitoActions, setStageAvitoActions] = useState<Record<string, string>>(
    (defaults.stageAvitoActions as Record<string, string> | undefined) ?? {},
  )
  const [stageSjActions, setStageSjActions] = useState<Record<string, string>>(
    (defaults.stageSjActions as Record<string, string> | undefined) ?? {},
  )
  const [savingStages, setSavingStages] = useState(false)

  // ── Автоматизация воронки ──
  const [autoDemo, setAutoDemo] = useState(defaults.automation?.autoDemo ?? true)
  const [autoInvite, setAutoInvite] = useState(defaults.automation?.autoInvite ?? false)
  const [minScore, setMinScore] = useState(
    defaults.automation?.minScore != null ? String(defaults.automation.minScore) : "70",
  )
  const [autoReject, setAutoReject] = useState(defaults.automation?.autoReject ?? false)
  const [savingFunnel, setSavingFunnel] = useState(false)

  // ── Опросы обратной связи 30/60/90 ──
  const [feedbackEnabled, setFeedbackEnabled] = useState(
    defaults.feedbackSurveys?.enabled ?? false,
  )
  const [feedback30, setFeedback30] = useState(defaults.feedbackSurveys?.d30 ?? true)
  const [feedback60, setFeedback60] = useState(defaults.feedbackSurveys?.d60 ?? true)
  const [feedback90, setFeedback90] = useState(defaults.feedbackSurveys?.d90 ?? true)
  const [savingFeedback, setSavingFeedback] = useState(false)

  // ── Сохранение: Воронка + Автоматизация ──
  const handleSaveFunnel = async () => {
    setSavingFunnel(true)
    try {
      await onPatch({
        funnelScenario: selectedScenario,
        automation: {
          autoDemo,
          autoInvite,
          minScore: Number(minScore) || undefined,
          autoReject,
        },
      })
      toast.success("Настройки воронки сохранены")
    } catch {
      toast.error("Ошибка сохранения")
    } finally {
      setSavingFunnel(false)
    }
  }

  // ── Сохранение: единая таблица стадий ──
  const handleSaveStages = async () => {
    setSavingStages(true)
    try {
      await onPatch({
        stageHhActions,
        stageLabels,
        stageColors,
        stageAvitoActions,
        stageSjActions,
      })
      toast.success("Настройки стадий сохранены")
    } catch {
      toast.error("Не удалось сохранить")
    } finally {
      setSavingStages(false)
    }
  }

  // ── Сохранение: Опросы обратной связи ──
  const handleSaveFeedback = async () => {
    setSavingFeedback(true)
    try {
      await onPatch({
        feedbackSurveys: {
          enabled: feedbackEnabled,
          d30: feedback30,
          d60: feedback60,
          d90: feedback90,
        },
      })
      toast.success("Настройки обратной связи сохранены")
    } catch {
      toast.error("Не удалось сохранить")
    } finally {
      setSavingFeedback(false)
    }
  }

  return (
    <div className="space-y-5">
      {/* ── Блок 1: Дефолтный сценарий воронки ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <GitBranch className="w-4 h-4" />
            Дефолтный сценарий воронки
          </CardTitle>
          <CardDescription>
            Новые вакансии будут использовать этот сценарий по умолчанию.
            Выбирайте под тип роли: для линейного персонала — «Быстрый»,
            для руководителей — «Стандартный» или «Двухэтапный».
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Select value={selectedScenario} onValueChange={setSelectedScenario}>
            <SelectTrigger className="h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(FUNNEL_SCENARIOS).map(([key, s]) => (
                <SelectItem key={key} value={key}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Описание выбранного сценария */}
          <p className="text-xs text-muted-foreground">
            {FUNNEL_SCENARIOS[selectedScenario]?.description}
          </p>

          {/* Список этапов */}
          <div className="space-y-0 rounded-lg border divide-y">
            {FUNNEL_SCENARIOS[selectedScenario]?.stages.map((stage, idx) => (
              <div key={idx} className="flex items-center gap-3 px-3 py-2">
                <div className="flex items-center justify-center size-6 rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0">
                  {idx + 1}
                </div>
                <span className="text-sm">{stage}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Блок 2: Автоматизация ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Zap className="w-4 h-4" />
            Автоматизация
          </CardTitle>
          <CardDescription>
            Автоматические действия при движении кандидата по воронке.
            Эти настройки применяются к новым вакансиям — в каждой вакансии
            можно изменить отдельно.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-medium">
                Автоматически отправлять демонстрацию после отклика
              </p>
              <p className="text-xs text-muted-foreground">
                Сразу после получения отклика кандидату уходит ссылка на демо-курс
              </p>
            </div>
            <Switch checked={autoDemo} onCheckedChange={setAutoDemo} />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between py-2">
              <div className="flex-1">
                <p className="text-sm font-medium">
                  Автоматически приглашать на интервью (скор &gt; N)
                </p>
                <p className="text-xs text-muted-foreground">
                  После прохождения демо — если AI-балл выше порога, кандидат
                  автоматически двигается на этап интервью
                </p>
              </div>
              <Switch checked={autoInvite} onCheckedChange={setAutoInvite} />
            </div>
            {autoInvite && (
              <div className="flex items-center gap-2 ml-9">
                <Label className="text-xs text-muted-foreground whitespace-nowrap">
                  Мин. балл
                </Label>
                <Input
                  value={minScore}
                  onChange={(e) => setMinScore(e.target.value.replace(/\D/g, ""))}
                  className="w-20 h-8 text-sm"
                />
                <span className="text-xs text-muted-foreground">из 100</span>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-medium">
                Автоматически отклонять при срабатывании стоп-фактора
              </p>
              <p className="text-xs text-muted-foreground">
                Кандидату уходит вежливый отказ, стадия меняется на «Отказ»
              </p>
            </div>
            <Switch checked={autoReject} onCheckedChange={setAutoReject} />
          </div>
        </CardContent>
      </Card>

      {/* Кнопка сохранения для блоков 1+2 */}
      <div className="flex justify-end">
        <Button className="gap-2" onClick={handleSaveFunnel} disabled={savingFunnel}>
          <Save className="size-4" />
          {savingFunnel ? "Сохранение…" : "Сохранить воронку"}
        </Button>
      </div>

      {/* ── Блок 3: Единая таблица стадий ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Layers className="w-4 h-4" />
            Стадии воронки
          </CardTitle>
          <CardDescription>
            Цвет, название и действия на джоб-бордах для каждой стадии.
            Это дефолт компании — применяется ко всем вакансиям, если не переопределено отдельно.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Таблица с горизонтальным скроллом на мобиле */}
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="px-3 py-2 text-left text-sm font-medium text-muted-foreground w-[120px]">
                    Стадия
                  </th>
                  <th className="px-3 py-2 text-left text-sm font-medium text-muted-foreground w-[120px]">
                    Цвет
                  </th>
                  <th className="px-3 py-2 text-left text-sm font-medium text-muted-foreground">
                    Название
                  </th>
                  <th className="px-3 py-2 text-left text-sm font-medium text-muted-foreground w-[170px]">
                    hh.ru
                  </th>
                  <th className="px-3 py-2 text-left text-sm font-medium text-muted-foreground w-[155px]">
                    <span>Авито</span>{" "}
                    <Badge variant="secondary" className="text-[10px] px-1 py-0 align-middle">скоро</Badge>
                  </th>
                  <th className="px-3 py-2 text-left text-sm font-medium text-muted-foreground w-[155px]">
                    <span>SuperJob</span>{" "}
                    <Badge variant="secondary" className="text-[10px] px-1 py-0 align-middle">скоро</Badge>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {TABLE_STAGES.map((slug: StageSlug) => {
                  const def = PLATFORM_STAGES[slug]
                  const color = (stageColors[slug] as StageColor | undefined) ?? def.defaultColor
                  const label = stageLabels[slug] ?? ""
                  const hhVal =
                    slug in stageHhActions
                      ? stageHhActions[slug]
                      : def.defaultHhAction
                  const avitoVal = stageAvitoActions[slug] ?? "none"
                  const sjVal = stageSjActions[slug] ?? "none"

                  return (
                    <tr key={slug} className="hover:bg-muted/20 transition-colors">
                      {/* Стадия */}
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-muted-foreground truncate max-w-[100px]">
                            {def.defaultLabel}
                          </span>
                          {def.isSystem && (
                            <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0">
                              системная
                            </Badge>
                          )}
                        </div>
                      </td>

                      {/* Цвет */}
                      <td className="px-3 py-2">
                        <div className="flex gap-0.5 flex-wrap">
                          {COLOR_ORDER.map((c) => (
                            <button
                              key={c}
                              type="button"
                              onClick={() => setStageColors(prev => ({ ...prev, [slug]: c }))}
                              className={cn(
                                "w-3 h-3 rounded-full transition-all",
                                STAGE_DOT_CLASSES[c],
                                color === c
                                  ? "ring-1 ring-offset-1 ring-foreground"
                                  : "opacity-40 hover:opacity-80",
                              )}
                              aria-label={c}
                            />
                          ))}
                        </div>
                      </td>

                      {/* Название */}
                      <td className="px-3 py-2">
                        <Input
                          value={label}
                          onChange={(e) =>
                            setStageLabels(prev => ({ ...prev, [slug]: e.target.value }))
                          }
                          placeholder={def.defaultLabel}
                          className="h-7 text-xs"
                        />
                      </td>

                      {/* hh.ru */}
                      <td className="px-3 py-2">
                        <Select
                          value={hhVal ?? "none"}
                          onValueChange={(v) =>
                            setStageHhActions((prev) => ({
                              ...prev,
                              [slug]:
                                v === "invitation" || v === "discard" || v === "assessment"
                                  ? v
                                  : null,
                            }))
                          }
                        >
                          <SelectTrigger className="h-7 text-xs w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Ничего</SelectItem>
                            <SelectItem value="invitation">Пригласить</SelectItem>
                            <SelectItem value="assessment">Тестовое задание</SelectItem>
                            <SelectItem value="discard">Отказать</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>

                      {/* Авито */}
                      <td className="px-3 py-2">
                        <Select
                          value={avitoVal}
                          onValueChange={(v) =>
                            setStageAvitoActions((prev) => ({ ...prev, [slug]: v }))
                          }
                        >
                          <SelectTrigger className="h-7 text-xs w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Ничего</SelectItem>
                            <SelectItem value="invitation">Пригласить</SelectItem>
                            <SelectItem value="discard">Отказать</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>

                      {/* SuperJob */}
                      <td className="px-3 py-2">
                        <Select
                          value={sjVal}
                          onValueChange={(v) =>
                            setStageSjActions((prev) => ({ ...prev, [slug]: v }))
                          }
                        >
                          <SelectTrigger className="h-7 text-xs w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Ничего</SelectItem>
                            <SelectItem value="invitation">Пригласить</SelectItem>
                            <SelectItem value="discard">Отказать</SelectItem>
                          </SelectContent>
                        </Select>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Подсказки */}
          <div className="space-y-1">
            <p className="text-[11px] text-muted-foreground">
              Пустое название — используется платформенное. Системные стадии («новый», «отказ») нельзя выключить, но можно переименовать и перекрасить.
            </p>
            <p className="text-[11px] text-muted-foreground">
              Авито и SuperJob — интеграции в разработке; действия сохранятся и применятся после подключения. Сейчас работает hh.ru.
            </p>
          </div>

          <div className="flex justify-end">
            <Button
              size="sm"
              className="h-8 text-xs gap-1.5"
              onClick={handleSaveStages}
              disabled={savingStages}
            >
              <Save className="size-3.5" />
              {savingStages ? "Сохранение…" : "Сохранить стадии"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Блок 4: Опросы обратной связи 30/60/90 ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Bell className="w-4 h-4" />
            Автоматический сбор обратной связи
          </CardTitle>
          <CardDescription>
            Опросы новых сотрудников на контрольных точках адаптации. Дефолт
            компании — отправляются модулем «Адаптация» после найма.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm">Включить автоматические опросы</p>
            <Switch
              checked={feedbackEnabled}
              onCheckedChange={setFeedbackEnabled}
            />
          </div>
          <div
            className={cn(
              "space-y-2 pl-4 border-l-2 border-primary/20",
              !feedbackEnabled && "opacity-50 pointer-events-none",
            )}
          >
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={feedback30}
                onCheckedChange={(v) => setFeedback30(!!v)}
              />
              30 дней — «Как проходит адаптация?»
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={feedback60}
                onCheckedChange={(v) => setFeedback60(!!v)}
              />
              60 дней — «Чувствуете ли уверенность?»
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={feedback90}
                onCheckedChange={(v) => setFeedback90(!!v)}
              />
              90 дней — «Оправдались ли ожидания?»
            </label>
          </div>
          <div className="flex justify-end pt-1">
            <Button
              size="sm"
              className="h-8 text-xs gap-1.5"
              onClick={handleSaveFeedback}
              disabled={savingFeedback}
            >
              <Save className="size-3.5" />
              {savingFeedback ? "Сохранение…" : "Сохранить"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
