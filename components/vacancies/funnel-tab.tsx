"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { ChevronRight, Pencil, Save, Loader2 } from "lucide-react"
import { toast } from "sonner"
import {
  ALL_STAGE_SLUGS,
  PLATFORM_STAGES,
  STAGE_COLOR_CLASSES,
  FUNNEL_PRESETS,
  getDefaultPipeline,
  type StageSlug,
  type StageColor,
  type FunnelPreset,
  type VacancyPipelineV2,
  type VacancyStageConfig,
  type HhAction,
} from "@/lib/stages"
import { cn } from "@/lib/utils"

// Палитра для popover-редактора (порядок — для удобства HR).
const COLOR_PALETTE: StageColor[] = [
  "blue", "indigo", "violet", "purple",
  "emerald", "green", "lime", "yellow",
  "amber", "orange", "rose", "red", "slate",
]

// Маппинг StageColor → класс заливки кружка-индикатора в списке стадий.
// Tailwind purge режет динамические `bg-${color}-500`, поэтому держим явный словарь.
const STAGE_DOT_CLASSES: Record<StageColor, string> = {
  slate:   "bg-slate-500",
  blue:    "bg-blue-500",
  indigo:  "bg-indigo-500",
  violet:  "bg-violet-500",
  purple:  "bg-purple-500",
  amber:   "bg-amber-500",
  orange:  "bg-orange-500",
  yellow:  "bg-yellow-500",
  lime:    "bg-lime-500",
  green:   "bg-green-500",
  emerald: "bg-emerald-500",
  rose:    "bg-rose-500",
  red:     "bg-destructive",
}

export interface FunnelTabProps {
  vacancyId: string
  initialPipeline: VacancyPipelineV2
  onSaved?: (pipeline: VacancyPipelineV2) => void
}

export function FunnelTab({ vacancyId, initialPipeline, onSaved }: FunnelTabProps) {
  const [pipeline, setPipeline] = useState<VacancyPipelineV2>(initialPipeline)
  const [editingStage, setEditingStage] = useState<StageSlug | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedPipeline, setSavedPipeline] = useState<VacancyPipelineV2>(initialPipeline)
  const dirty = JSON.stringify(pipeline) !== JSON.stringify(savedPipeline)

  const handlePresetChange = (newPreset: Exclude<FunnelPreset, "custom">) => {
    setPipeline(getDefaultPipeline(newPreset))
  }

  const handleStageToggle = (slug: StageSlug, enabled: boolean) => {
    if (PLATFORM_STAGES[slug].isSystem) return
    setPipeline(prev => ({
      ...prev,
      preset: "custom",
      stages: prev.stages.map(s => s.slug === slug ? { ...s, enabled } : s),
    }))
  }

  const handleStageUpdate = (slug: StageSlug, patch: Partial<VacancyStageConfig>) => {
    setPipeline(prev => ({
      ...prev,
      preset: "custom",
      stages: prev.stages.map(s => s.slug === slug ? { ...s, ...patch } : s),
    }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/modules/hr/vacancies/${vacancyId}/pipeline`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pipeline),
      })
      if (!res.ok) throw new Error(`save failed (${res.status})`)
      const json = await res.json() as { pipeline?: VacancyPipelineV2 }
      const saved = json.pipeline ?? pipeline
      setPipeline(saved)
      setSavedPipeline(saved)
      toast.success("Воронка сохранена")
      onSaved?.(saved)
    } catch {
      toast.error("Не удалось сохранить воронку")
    } finally {
      setSaving(false)
    }
  }

  const enabledStages = pipeline.stages
    .filter(s => s.enabled)
    .sort((a, b) => PLATFORM_STAGES[a.slug].sortOrder - PLATFORM_STAGES[b.slug].sortOrder)

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Заголовок */}
      <div>
        <h2 className="text-lg font-semibold">Воронка</h2>
        <p className="text-sm text-muted-foreground">
          Через какие этапы проходит кандидат от отклика до оффера
        </p>
      </div>

      {/* Шаблон воронки */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Шаблон воронки</CardTitle>
          <CardDescription>Выберите готовый шаблон или настройте свой</CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={pipeline.preset}
            onValueChange={(v) => {
              if (v === "custom") {
                setPipeline(prev => ({ ...prev, preset: "custom" }))
              } else if (v === "fast" || v === "standard" || v === "deep") {
                handlePresetChange(v)
              }
            }}
            className="gap-3"
          >
            {(["fast", "standard", "deep"] as const).map(presetId => {
              const p = FUNNEL_PRESETS[presetId]
              return (
                <label
                  key={p.id}
                  className={cn(
                    "flex items-start gap-3 rounded-lg border p-3 cursor-pointer hover:bg-accent transition-colors",
                    pipeline.preset === p.id && "border-primary bg-primary/5",
                  )}
                >
                  <RadioGroupItem value={p.id} className="mt-1" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-lg leading-none">{p.emoji}</span>
                      <span className="font-medium">{p.label}</span>
                      {p.id === "standard" && (
                        <span className="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary">
                          Рекомендуем
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{p.description}</p>
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      {p.enabledStages.map((slug, idx) => (
                        <div key={slug} className="flex items-center gap-1.5">
                          <span className={cn(
                            "text-xs px-2 py-0.5 rounded border",
                            STAGE_COLOR_CLASSES[PLATFORM_STAGES[slug].defaultColor],
                          )}>
                            {PLATFORM_STAGES[slug].defaultLabel}
                          </span>
                          {idx < p.enabledStages.length - 1 && (
                            <ChevronRight className="h-3 w-3 text-muted-foreground" />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </label>
              )
            })}

            <label className={cn(
              "flex items-start gap-3 rounded-lg border p-3 cursor-pointer hover:bg-accent transition-colors",
              pipeline.preset === "custom" && "border-primary bg-primary/5",
            )}>
              <RadioGroupItem value="custom" className="mt-1" />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-lg leading-none">✏️</span>
                  <span className="font-medium">Свой набор</span>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Включите/выключите нужные стадии, переименуйте, измените цвета
                </p>
              </div>
            </label>
          </RadioGroup>
        </CardContent>
      </Card>

      {/* Список 14 стадий */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Стадии воронки</CardTitle>
          <CardDescription>
            Карандаш — переименовать стадию, изменить цвет или настроить hh.ru
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {ALL_STAGE_SLUGS.map(slug => {
            const cfg = pipeline.stages.find(s => s.slug === slug)
            if (!cfg) return null
            const def = PLATFORM_STAGES[slug]
            const label = cfg.customLabel || def.defaultLabel
            const color = cfg.customColor || def.defaultColor
            const isSystem = def.isSystem

            return (
              <div
                key={slug}
                className={cn(
                  "flex items-center gap-3 rounded-lg border p-2.5 transition-opacity",
                  !cfg.enabled && "opacity-60",
                )}
              >
                <Switch
                  checked={cfg.enabled}
                  onCheckedChange={(v) => handleStageToggle(slug, v)}
                  disabled={isSystem}
                />
                <div className={cn("h-3 w-3 rounded-full shrink-0", STAGE_DOT_CLASSES[color])} />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{label}</div>
                  <div className="text-xs text-muted-foreground truncate">{def.description}</div>
                </div>
                {isSystem && (
                  <span className="text-[10px] text-muted-foreground px-1.5 py-0.5 rounded bg-muted">
                    системная
                  </span>
                )}
                {cfg.hhAction && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground">
                    {cfg.hhAction === "invitation" ? "hh: пригласить" : cfg.hhAction === "assessment" ? "hh: тест" : "hh: отказать"}
                  </span>
                )}
                <Popover open={editingStage === slug} onOpenChange={(open) => setEditingStage(open ? slug : null)}>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" size="sm" className="shrink-0">
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80" align="end">
                    <StageEditor
                      stage={cfg}
                      definition={def}
                      onApply={(patch) => {
                        handleStageUpdate(slug, patch)
                        setEditingStage(null)
                      }}
                      onClose={() => setEditingStage(null)}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            )
          })}
        </CardContent>
      </Card>

      {/* Превью включённой воронки */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Превью воронки</CardTitle>
          <CardDescription>Как кандидат проходит через стадии</CardDescription>
        </CardHeader>
        <CardContent>
          {enabledStages.length === 0 ? (
            <p className="text-sm text-muted-foreground">Не выбрано ни одной стадии — кандидаты не смогут проходить воронку.</p>
          ) : (
            <div className="flex flex-wrap items-center gap-1.5">
              {enabledStages.map((cfg, idx) => {
                const def = PLATFORM_STAGES[cfg.slug]
                const label = cfg.customLabel || def.defaultLabel
                const color = cfg.customColor || def.defaultColor
                return (
                  <div key={cfg.slug} className="flex items-center gap-1.5">
                    <span className={cn(
                      "text-xs px-2 py-1 rounded border",
                      STAGE_COLOR_CLASSES[color],
                    )}>
                      {label}
                    </span>
                    {idx < enabledStages.length - 1 && (
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Сохранить */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving || !dirty}>
          {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          {saving ? "Сохраняем..." : "Сохранить настройки воронки"}
        </Button>
      </div>
    </div>
  )
}

// ───────────────────────────────────────────────────────────────────
// Popover-редактор стадии
// ───────────────────────────────────────────────────────────────────

function StageEditor({
  stage,
  definition,
  onApply,
  onClose,
}: {
  stage: VacancyStageConfig
  definition: typeof PLATFORM_STAGES[StageSlug]
  onApply: (patch: Partial<VacancyStageConfig>) => void
  onClose: () => void
}) {
  const [localLabel, setLocalLabel] = useState(stage.customLabel ?? "")
  const [localColor, setLocalColor] = useState<StageColor | null>(stage.customColor)
  const [localHhAction, setLocalHhAction] = useState<HhAction>(stage.hhAction)

  const apply = () => {
    onApply({
      customLabel: localLabel.trim() || null,
      customColor: localColor,
      hhAction: localHhAction,
    })
  }

  return (
    <div className="space-y-4">
      <div>
        <h4 className="font-semibold text-sm">Редактировать стадию</h4>
        <p className="text-xs text-muted-foreground">Системное имя: <code className="px-1 py-0.5 rounded bg-muted text-[11px]">{stage.slug}</code></p>
      </div>

      {/* Название */}
      <div className="space-y-1.5">
        <Label className="text-xs">Название (кастомное)</Label>
        <Input
          value={localLabel}
          onChange={(e) => setLocalLabel(e.target.value)}
          placeholder={definition.defaultLabel}
        />
        <p className="text-[11px] text-muted-foreground">
          Оставьте пустым чтобы использовать «{definition.defaultLabel}»
        </p>
      </div>

      {/* Цвет */}
      <div className="space-y-1.5">
        <Label className="text-xs">Цвет</Label>
        <div className="grid grid-cols-7 gap-1.5">
          {COLOR_PALETTE.map(c => (
            <button
              key={c}
              type="button"
              className={cn(
                "h-7 rounded border-2 transition",
                STAGE_DOT_CLASSES[c],
                localColor === c ? "border-foreground" : "border-transparent",
              )}
              onClick={() => setLocalColor(c)}
              title={c}
            />
          ))}
        </div>
        <button
          type="button"
          className="text-[11px] text-primary hover:underline"
          onClick={() => setLocalColor(null)}
        >
          Сбросить (дефолтный: {definition.defaultColor})
        </button>
      </div>

      {/* hh-action */}
      <div className="space-y-1.5">
        <Label className="text-xs">Действие в hh.ru при переходе в эту стадию</Label>
        <RadioGroup
          value={localHhAction ?? "none"}
          onValueChange={(v) => setLocalHhAction(v === "invitation" || v === "discard" || v === "assessment" ? v : null)}
          className="gap-2"
        >
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <RadioGroupItem value="none" />
            <span>Ничего не делать</span>
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <RadioGroupItem value="invitation" />
            <span>Пригласить (hh-приглашение)</span>
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <RadioGroupItem value="assessment" />
            <span>Тестовое задание (hh-assessment)</span>
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <RadioGroupItem value="discard" />
            <span>Отказать (hh-отказ)</span>
          </label>
        </RadioGroup>
      </div>

      <div className="flex justify-end gap-2 pt-2 border-t">
        <Button variant="ghost" size="sm" onClick={onClose}>Отмена</Button>
        <Button size="sm" onClick={apply}>Применить</Button>
      </div>
    </div>
  )
}
