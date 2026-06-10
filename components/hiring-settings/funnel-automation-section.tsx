"use client"

import { useState, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Save,
  Bell,
  Layers,
  ChevronUp,
  ChevronDown,
  Lock,
  BookmarkPlus,
  Trash2,
  Check,
} from "lucide-react"
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

// ─── Палитра цветов ───────────────────────────────────────────────────────────
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

// ─── Тип пресета компании ─────────────────────────────────────────────────────
type CompanyPreset = NonNullable<CompanyHiringDefaults["companyFunnelPresets"]>[number]

// ─── Хелперы для порядка стадий ──────────────────────────────────────────────
/**
 * Возвращает рабочий порядок (slug[]) с учётом сохранённого stageOrder.
 * Новые стадии (добавленные в платформу позже) вставляются в конец.
 */
function resolveOrder(savedOrder: string[] | undefined): StageSlug[] {
  const all = [...ALL_STAGE_SLUGS]
  if (!savedOrder || savedOrder.length === 0) return all

  const result: StageSlug[] = []
  for (const slug of savedOrder) {
    if (all.includes(slug as StageSlug)) result.push(slug as StageSlug)
  }
  // Стадии, которых нет в сохранённом порядке (новые платформенные) — в конец
  for (const slug of all) {
    if (!result.includes(slug)) result.push(slug)
  }
  return result
}

/**
 * Строит enabledStages из сохранённого объекта: системные — всегда true.
 */
function resolveEnabled(
  saved: Record<string, boolean> | undefined,
): Record<StageSlug, boolean> {
  const result = {} as Record<StageSlug, boolean>
  for (const slug of ALL_STAGE_SLUGS) {
    const def = PLATFORM_STAGES[slug]
    if (def.isSystem) {
      result[slug] = true
    } else {
      result[slug] = saved ? (saved[slug] ?? true) : true
    }
  }
  return result
}

// ─── Компонент ───────────────────────────────────────────────────────────────

export function FunnelAutomationSection({
  defaults,
  onPatch,
}: {
  defaults: CompanyHiringDefaults
  onPatch: (patch: Partial<CompanyHiringDefaults>) => Promise<void>
}) {
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

  // ── Новые поля: порядок и вкл/выкл ──
  const [stageOrder, setStageOrder] = useState<StageSlug[]>(() =>
    resolveOrder(defaults.stageOrder),
  )
  const [enabledStages, setEnabledStages] = useState<Record<StageSlug, boolean>>(() =>
    resolveEnabled(defaults.enabledStages as Record<string, boolean> | undefined),
  )

  // ── Пресеты компании ──
  const [companyPresets, setCompanyPresets] = useState<CompanyPreset[]>(
    (defaults.companyFunnelPresets ?? []) as CompanyPreset[],
  )

  // ── Диалог сохранения пресета ──
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [presetName, setPresetName] = useState("")
  const [savingPreset, setSavingPreset] = useState(false)

  // ── Диалог удаления пресета ──
  const [deletePresetId, setDeletePresetId] = useState<string | null>(null)

  const [savingStages, setSavingStages] = useState(false)

  // ── Опросы обратной связи 30/60/90 ──
  const [feedbackEnabled, setFeedbackEnabled] = useState(
    defaults.feedbackSurveys?.enabled ?? false,
  )
  const [feedback30, setFeedback30] = useState(defaults.feedbackSurveys?.d30 ?? true)
  const [feedback60, setFeedback60] = useState(defaults.feedbackSurveys?.d60 ?? true)
  const [feedback90, setFeedback90] = useState(defaults.feedbackSurveys?.d90 ?? true)
  const [savingFeedback, setSavingFeedback] = useState(false)

  // ── Перемещение стадий (↑/↓) ──
  const moveStage = useCallback((slug: StageSlug, direction: "up" | "down") => {
    setStageOrder(prev => {
      const idx = prev.indexOf(slug)
      if (idx === -1) return prev
      const next = [...prev]
      if (direction === "up" && idx > 0) {
        ;[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]
      } else if (direction === "down" && idx < next.length - 1) {
        ;[next[idx + 1], next[idx]] = [next[idx], next[idx + 1]]
      }
      return next
    })
  }, [])

  // ── Переключение стадии ──
  const toggleStage = useCallback((slug: StageSlug, value: boolean) => {
    setEnabledStages(prev => ({ ...prev, [slug]: value }))
  }, [])

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
        enabledStages: enabledStages as Record<string, boolean>,
        stageOrder,
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

  // ── Применить пресет к таблице ──
  const applyBuiltinPreset = (presetKey: "fast" | "standard" | "deep") => {
    const preset = FUNNEL_PRESETS[presetKey]
    const enabled = resolveEnabled(
      Object.fromEntries(
        ALL_STAGE_SLUGS.map(s => [s, preset.enabledStages.includes(s)])
      )
    )
    setEnabledStages(enabled)
    setStageOrder(ALL_STAGE_SLUGS) // встроенные пресеты — платформенный порядок
    toast.success(`Пресет «${preset.label}» применён — сохраните чтобы зафиксировать`)
  }

  const applyCompanyPreset = (preset: CompanyPreset) => {
    // Восстанавливаем enabledStages (системные всегда включены)
    const enabled = resolveEnabled(preset.enabledStages as Record<string, boolean>)
    setEnabledStages(enabled)
    setStageOrder(resolveOrder(preset.stageOrder))
    setStageLabels(preset.stageLabels ?? {})
    setStageColors(preset.stageColors ?? {})
    setStageHhActions(
      (preset.stageHhActions ?? {}) as Record<string, "invitation" | "discard" | "assessment" | null>
    )
    setStageAvitoActions(preset.stageAvitoActions ?? {})
    setStageSjActions(preset.stageSjActions ?? {})
    toast.success(`Шаблон «${preset.name}» применён — сохраните чтобы зафиксировать`)
  }

  // ── Сохранить текущую конфигурацию как пресет ──
  const handleSavePreset = async () => {
    const name = presetName.trim()
    if (!name) return
    setSavingPreset(true)
    try {
      const newPreset: CompanyPreset = {
        id: crypto.randomUUID(),
        name,
        createdAt: new Date().toISOString(),
        enabledStages: enabledStages as Record<string, boolean>,
        stageOrder,
        stageLabels,
        stageColors,
        stageHhActions: stageHhActions as Record<string, string | null>,
        stageAvitoActions,
        stageSjActions,
      }
      const updated = [...companyPresets, newPreset]
      await onPatch({ companyFunnelPresets: updated })
      setCompanyPresets(updated)
      setPresetName("")
      setSaveDialogOpen(false)
      toast.success(`Шаблон «${name}» сохранён`)
    } catch {
      toast.error("Не удалось сохранить шаблон")
    } finally {
      setSavingPreset(false)
    }
  }

  // ── Удалить пресет ──
  const handleDeletePreset = async (id: string) => {
    const updated = companyPresets.filter(p => p.id !== id)
    try {
      await onPatch({ companyFunnelPresets: updated })
      setCompanyPresets(updated)
      toast.success("Шаблон удалён")
    } catch {
      toast.error("Не удалось удалить шаблон")
    } finally {
      setDeletePresetId(null)
    }
  }

  return (
    <div className="space-y-5">
      {/* ── Блок 3: Единая таблица стадий ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Layers className="w-4 h-4" />
            Стадии воронки
          </CardTitle>
          <CardDescription>
            Включите нужные стадии, задайте порядок кнопками ↑↓, настройте
            цвет, название и действия на джоб-бордах. Системные стадии выключить
            нельзя. Это дефолт компании — применяется ко всем вакансиям.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">

          {/* Пресеты: встроенные + компании */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Быстрое применение пресета
            </p>
            <div className="flex flex-wrap gap-2">
              {(Object.entries(FUNNEL_PRESETS) as [string, typeof FUNNEL_PRESETS[keyof typeof FUNNEL_PRESETS]][]).map(
                ([key, preset]) => (
                  <Button
                    key={key}
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={() => applyBuiltinPreset(key as "fast" | "standard" | "deep")}
                  >
                    <span>{preset.emoji}</span>
                    {preset.label}
                  </Button>
                )
              )}
              {companyPresets.map(preset => (
                <Button
                  key={preset.id}
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1 border-primary/40 text-primary hover:bg-primary/5"
                  onClick={() => applyCompanyPreset(preset)}
                >
                  <Check className="size-3" />
                  {preset.name}
                </Button>
              ))}
            </div>
          </div>

          {/* Таблица с горизонтальным скроллом на мобиле */}
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground w-[38px]">
                    Вкл
                  </th>
                  <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground w-[52px]">
                    Порядок
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground w-[110px]">
                    Стадия
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground w-[110px]">
                    Цвет
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                    Название
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground w-[160px]">
                    hh.ru
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground w-[140px]">
                    <span>Авито</span>{" "}
                    <Badge variant="secondary" className="text-[10px] px-1 py-0 align-middle">скоро</Badge>
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground w-[140px]">
                    <span>SuperJob</span>{" "}
                    <Badge variant="secondary" className="text-[10px] px-1 py-0 align-middle">скоро</Badge>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {stageOrder.map((slug, idx) => {
                  const def = PLATFORM_STAGES[slug]
                  const isEnabled = enabledStages[slug] ?? true
                  const isSystem = def.isSystem
                  const color = (stageColors[slug] as StageColor | undefined) ?? def.defaultColor
                  const label = stageLabels[slug] ?? ""
                  const hhVal =
                    slug in stageHhActions
                      ? stageHhActions[slug]
                      : def.defaultHhAction
                  const avitoVal = stageAvitoActions[slug] ?? "none"
                  const sjVal = stageSjActions[slug] ?? "none"

                  return (
                    <tr
                      key={slug}
                      className={cn(
                        "transition-colors",
                        isEnabled ? "hover:bg-muted/20" : "bg-muted/10 opacity-60",
                      )}
                    >
                      {/* Вкл/выкл */}
                      <td className="px-2 py-2 text-center">
                        {isSystem ? (
                          <Lock className="size-3 text-muted-foreground mx-auto" />
                        ) : (
                          <Switch
                            checked={isEnabled}
                            onCheckedChange={(v) => toggleStage(slug, v)}
                            className="scale-75 origin-center"
                          />
                        )}
                      </td>

                      {/* Порядок (↑↓) */}
                      <td className="px-2 py-2">
                        <div className="flex flex-col gap-0.5">
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => moveStage(slug, "up")}
                            className="p-0.5 rounded hover:bg-muted disabled:opacity-20 disabled:cursor-not-allowed"
                            aria-label="Переместить вверх"
                          >
                            <ChevronUp className="size-3.5 text-muted-foreground" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === stageOrder.length - 1}
                            onClick={() => moveStage(slug, "down")}
                            className="p-0.5 rounded hover:bg-muted disabled:opacity-20 disabled:cursor-not-allowed"
                            aria-label="Переместить вниз"
                          >
                            <ChevronDown className="size-3.5 text-muted-foreground" />
                          </button>
                        </div>
                      </td>

                      {/* Стадия */}
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-muted-foreground truncate max-w-[80px]">
                            {def.defaultLabel}
                          </span>
                          {isSystem && (
                            <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0">
                              сист.
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
              Выключенные стадии не показываются в воронке новых вакансий. Системные стадии («Новый», «Отказ») выключить нельзя.
            </p>
            <p className="text-[11px] text-muted-foreground">
              Авито и SuperJob — интеграции в разработке; действия сохранятся и применятся после подключения. Сейчас работает hh.ru.
            </p>
          </div>

          {/* Сохранённые шаблоны компании с кнопкой удаления */}
          {companyPresets.length > 0 && (
            <div className="rounded-lg border divide-y">
              <div className="px-3 py-2 bg-muted/30">
                <p className="text-xs font-medium text-muted-foreground">Сохранённые шаблоны компании</p>
              </div>
              {companyPresets.map(preset => (
                <div key={preset.id} className="flex items-center justify-between px-3 py-2">
                  <div>
                    <p className="text-xs font-medium">{preset.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {new Date(preset.createdAt).toLocaleDateString("ru-RU")} ·{" "}
                      {Object.values(preset.enabledStages).filter(Boolean).length} стадий включено
                    </p>
                  </div>
                  <div className="flex gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => applyCompanyPreset(preset)}
                    >
                      Применить
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => setDeletePresetId(preset.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5"
              onClick={() => {
                setPresetName("")
                setSaveDialogOpen(true)
              }}
            >
              <BookmarkPlus className="size-3.5" />
              Сохранить как шаблон
            </Button>

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

      {/* ── Диалог: сохранить как шаблон ── */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Сохранить шаблон воронки</DialogTitle>
            <DialogDescription>
              Текущие настройки стадий (включённые, порядок, цвета, названия,
              действия hh/Авито/SuperJob) будут сохранены как шаблон компании.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="preset-name">Название шаблона</Label>
            <Input
              id="preset-name"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              placeholder="Например: Массовый найм операторов"
              onKeyDown={(e) => {
                if (e.key === "Enter" && presetName.trim()) void handleSavePreset()
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>
              Отмена
            </Button>
            <Button
              onClick={() => void handleSavePreset()}
              disabled={!presetName.trim() || savingPreset}
            >
              {savingPreset ? "Сохранение…" : "Сохранить шаблон"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Диалог: подтверждение удаления пресета ── */}
      <AlertDialog open={!!deletePresetId} onOpenChange={(o) => { if (!o) setDeletePresetId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить шаблон?</AlertDialogTitle>
            <AlertDialogDescription>
              Шаблон будет удалён безвозвратно. Это не повлияет на уже
              созданные вакансии.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deletePresetId && void handleDeletePreset(deletePresetId)}
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
