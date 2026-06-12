"use client"

import { useState, useCallback } from "react"
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
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
  GripVertical,
  Pencil,
} from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import type { CompanyHiringDefaults } from "@/lib/db/schema"
import {
  ALL_STAGE_SLUGS,
  PLATFORM_STAGES,
  FUNNEL_PRESETS,
  type StageSlug,
  type StageColor,
} from "@/lib/stages"

// ─── Палитра цветов ───────────────────────────────────────────────────────────
const COLOR_ORDER: StageColor[] = [
  "blue", "indigo", "violet", "purple", "emerald", "green",
  "amber", "orange", "rose", "red", "slate", "yellow",
]
const STAGE_DOT_CLASSES: Record<StageColor, string> = {
  slate: "bg-slate-500",   blue: "bg-blue-500",    indigo: "bg-indigo-500",
  violet: "bg-violet-500", purple: "bg-purple-500", amber: "bg-amber-500",
  orange: "bg-orange-500", yellow: "bg-yellow-500", lime: "bg-lime-500",
  green: "bg-green-500",   emerald: "bg-emerald-500", rose: "bg-rose-500",
  red: "bg-destructive",
}

// ─── hh.ru маппинг стадий (статусы переговоров hh) ───────────────────────────
// Статусы (коллекции переговоров) кандидата на hh.ru — куда переносим отклик.
const HH_STAGE_OPTIONS = [
  { value: "none",                 label: "—" },
  { value: "response",             label: "Новый отклик" },
  { value: "consider",             label: "Думаю / в работе" },
  { value: "phone_interview",      label: "Телефонное интервью" },
  { value: "assessment",           label: "Тестовое задание" },
  { value: "interview",            label: "Собеседование" },
  { value: "offer",                label: "Оффер" },
  { value: "hired",                label: "Принят / выход на работу" },
  { value: "discard_by_employer",  label: "Отказ (мы отказали)" },
  { value: "discard_by_applicant", label: "Кандидат отказался" },
]

// ─── Тип пресета компании ─────────────────────────────────────────────────────
type CompanyPreset = NonNullable<CompanyHiringDefaults["companyFunnelPresets"]>[number]

// ─── Хелперы для порядка стадий ──────────────────────────────────────────────
function resolveOrder(savedOrder: string[] | undefined): StageSlug[] {
  const all = [...ALL_STAGE_SLUGS]
  if (!savedOrder || savedOrder.length === 0) return all

  const result: StageSlug[] = []
  for (const slug of savedOrder) {
    if (all.includes(slug as StageSlug)) result.push(slug as StageSlug)
  }
  for (const slug of all) {
    if (!result.includes(slug)) result.push(slug)
  }
  return result
}

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

// ─── Сортируемая строка таблицы ──────────────────────────────────────────────
interface SortableStageRowProps {
  slug: StageSlug
  idx: number
  totalCount: number
  isEnabled: boolean
  isSystem: boolean
  color: StageColor
  label: string
  hhAction: "invitation" | "discard" | "assessment" | null
  hhStage: string
  avitoVal: string
  onToggle: (slug: StageSlug, value: boolean) => void
  onMoveUp: (slug: StageSlug) => void
  onMoveDown: (slug: StageSlug) => void
  onColorChange: (slug: StageSlug, color: StageColor) => void
  onLabelChange: (slug: StageSlug, value: string) => void
  onHhActionChange: (slug: StageSlug, value: "invitation" | "discard" | "assessment" | null) => void
  onHhStageChange: (slug: StageSlug, value: string) => void
  onAvitoChange: (slug: StageSlug, value: string) => void
}

function SortableStageRow({
  slug,
  idx,
  totalCount,
  isEnabled,
  isSystem,
  color,
  label,
  hhAction,
  hhStage,
  avitoVal,
  onToggle,
  onMoveUp,
  onMoveDown,
  onColorChange,
  onLabelChange,
  onHhActionChange,
  onHhStageChange,
  onAvitoChange,
}: SortableStageRowProps) {
  const def = PLATFORM_STAGES[slug]

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: slug })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={cn(
        "transition-colors border-b last:border-0",
        isDragging ? "opacity-50 bg-muted/40 shadow-md" : "",
        isEnabled ? "hover:bg-muted/20" : "bg-muted/10 opacity-60",
      )}
    >
      {/* Вкл/выкл */}
      <td className="px-2 py-1.5 text-center">
        {isSystem ? (
          <Lock className="size-3 text-muted-foreground mx-auto" />
        ) : (
          <Switch
            checked={isEnabled}
            onCheckedChange={(v) => onToggle(slug, v)}
            className="scale-75 origin-center"
          />
        )}
      </td>

      {/* Drag-handle + кнопки ↑↓ */}
      <td className="px-1 py-1.5">
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            className="cursor-grab active:cursor-grabbing p-0.5 rounded hover:bg-muted text-muted-foreground touch-none"
            aria-label="Перетащить"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-3.5" />
          </button>
          <div className="flex flex-col gap-0">
            <button
              type="button"
              disabled={idx === 0}
              onClick={() => onMoveUp(slug)}
              className="p-0.5 rounded hover:bg-muted disabled:opacity-20 disabled:cursor-not-allowed"
              aria-label="Переместить вверх"
            >
              <ChevronUp className="size-3 text-muted-foreground" />
            </button>
            <button
              type="button"
              disabled={idx === totalCount - 1}
              onClick={() => onMoveDown(slug)}
              className="p-0.5 rounded hover:bg-muted disabled:opacity-20 disabled:cursor-not-allowed"
              aria-label="Переместить вниз"
            >
              <ChevronDown className="size-3 text-muted-foreground" />
            </button>
          </div>
        </div>
      </td>

      {/* Стадия */}
      <td className="px-3 py-1.5">
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground truncate max-w-[90px]">
            {def.defaultLabel}
          </span>
          {isSystem && (
            <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0">
              сист.
            </Badge>
          )}
        </div>
      </td>

      {/* Цвет — палитра 2 ряда по 6 */}
      <td className="px-2 py-1.5">
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={cn(
                "w-5 h-5 rounded-full transition-all ring-1 ring-offset-1 ring-border hover:ring-foreground/40",
                STAGE_DOT_CLASSES[color],
              )}
              aria-label="Выбрать цвет"
            />
          </PopoverTrigger>
          <PopoverContent className="w-auto p-2" align="start">
            <div className="grid grid-cols-6 gap-1.5">
              {COLOR_ORDER.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => onColorChange(slug, c)}
                  className={cn(
                    "w-5 h-5 rounded-full transition-all hover:scale-110",
                    STAGE_DOT_CLASSES[c] ?? "bg-slate-400",
                    color === c
                      ? "ring-2 ring-offset-1 ring-foreground"
                      : "opacity-70 hover:opacity-100",
                  )}
                  aria-label={c}
                />
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </td>

      {/* Название — растянутое */}
      <td className="px-2 py-1.5 min-w-[200px]">
        <Input
          value={label}
          onChange={(e) => onLabelChange(slug, e.target.value)}
          placeholder={def.defaultLabel}
          className="h-7 text-xs w-full"
        />
      </td>

      {/* Действие (hh-action: Пригласить/Тест/Отказать/Ничего) */}
      <td className="px-2 py-1.5 w-[140px]">
        <Select
          value={hhAction ?? "none"}
          onValueChange={(v) =>
            onHhActionChange(
              slug,
              v === "invitation" || v === "discard" || v === "assessment" ? v : null,
            )
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

      {/* hh.ru — маппинг на стадию переговоров hh */}
      <td className="px-2 py-1.5 w-[140px]">
        <Select
          value={hhStage || "none"}
          onValueChange={(v) => onHhStageChange(slug, v)}
        >
          <SelectTrigger className="h-7 text-xs w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {HH_STAGE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </td>

      {/* Авито */}
      <td className="px-2 py-1.5 w-[120px]">
        <Select
          value={avitoVal || "none"}
          onValueChange={(v) => onAvitoChange(slug, v)}
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
}

// ─── Основной компонент ───────────────────────────────────────────────────────

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
  // ── Маппинг стадий→hh-стадии переговоров (новое поле, хранится в stageHhStages) ──
  // Используем stageAvitoActions как резервное поле не трогая его; hh-стадии —
  // новое поле в defaults. Если поля нет — инициализируем пустым объектом.
  const [stageHhStages, setStageHhStages] = useState<Record<string, string>>(
    ((defaults as Record<string, unknown>).stageHhStages as Record<string, string> | undefined) ?? {},
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

  // ── Порядок и вкл/выкл ──
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

  // ── Диалог переименования пресета ──
  const [renamePresetId, setRenamePresetId] = useState<string | null>(null)
  const [renamePresetName, setRenamePresetName] = useState("")
  // Последний применённый пресет — для подсветки активной кнопки.
  // Ключ встроенного («fast»/«standard»/«deep») или id шаблона компании.
  const [appliedPreset, setAppliedPreset] = useState<string | null>(null)

  // ── Режим «обновить пресет» — сохраняем поверх существующего ──
  const [updatePresetId, setUpdatePresetId] = useState<string | null>(null)

  const [savingStages, setSavingStages] = useState(false)

  // (Опросы обратной связи 30/60/90 перенесены в таб «Адаптация».)

  // ── DnD сенсоры ──
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  // ── Обработчик завершения drag ──
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setStageOrder(prev => {
      const oldIdx = prev.indexOf(active.id as StageSlug)
      const newIdx = prev.indexOf(over.id as StageSlug)
      return arrayMove(prev, oldIdx, newIdx)
    })
  }, [])

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

  // ── Собираем patch с учётом новых полей ──
  const buildStagesPatch = useCallback((): Partial<CompanyHiringDefaults> => ({
    stageHhActions,
    stageLabels,
    stageColors,
    stageAvitoActions,
    enabledStages: enabledStages as Record<string, boolean>,
    stageOrder,
    // stageHhStages идёт как дополнительное поле через spread
    ...(Object.keys(stageHhStages).length > 0 ? { stageHhStages } as Record<string, unknown> : {}),
  }), [stageHhActions, stageLabels, stageColors, stageAvitoActions, enabledStages, stageOrder, stageHhStages])

  // ── Сохранение: единая таблица стадий ──
  const handleSaveStages = async () => {
    setSavingStages(true)
    try {
      await onPatch(buildStagesPatch())
      toast.success("Настройки стадий сохранены")
    } catch {
      toast.error("Не удалось сохранить")
    } finally {
      setSavingStages(false)
    }
  }

  // (handleSaveFeedback перенесён в AdaptationSection.)

  // ── Применить пресет к таблице ──
  const applyBuiltinPreset = (presetKey: "fast" | "standard" | "deep") => {
    const preset = FUNNEL_PRESETS[presetKey]
    const enabled = resolveEnabled(
      Object.fromEntries(
        ALL_STAGE_SLUGS.map(s => [s, preset.enabledStages.includes(s)])
      )
    )
    setEnabledStages(enabled)
    setStageOrder(ALL_STAGE_SLUGS)
    setAppliedPreset(presetKey)
    toast.success(`Пресет «${preset.label}» применён — сохраните чтобы зафиксировать`)
  }

  const applyCompanyPreset = (preset: CompanyPreset) => {
    const enabled = resolveEnabled(preset.enabledStages as Record<string, boolean>)
    setEnabledStages(enabled)
    setStageOrder(resolveOrder(preset.stageOrder))
    setStageLabels(preset.stageLabels ?? {})
    setStageColors(preset.stageColors ?? {})
    setStageHhActions(
      (preset.stageHhActions ?? {}) as Record<string, "invitation" | "discard" | "assessment" | null>
    )
    setStageAvitoActions(preset.stageAvitoActions ?? {})
    setAppliedPreset(preset.id)
    toast.success(`Шаблон «${preset.name}» применён — сохраните чтобы зафиксировать`)
  }

  // ── Строим данные пресета из текущего состояния ──
  const buildPresetData = (): Omit<CompanyPreset, "id" | "name" | "createdAt"> => ({
    enabledStages: enabledStages as Record<string, boolean>,
    stageOrder,
    stageLabels,
    stageColors,
    stageHhActions: stageHhActions as Record<string, string | null>,
    stageAvitoActions,
    stageSjActions: {},
  })

  // ── Сохранить новый пресет ──
  const handleSavePreset = async () => {
    const name = presetName.trim()
    if (!name) return
    setSavingPreset(true)
    try {
      let updated: CompanyPreset[]
      if (updatePresetId) {
        // Обновляем существующий (перезаписываем данные, сохраняем name и createdAt)
        updated = companyPresets.map(p =>
          p.id === updatePresetId
            ? { ...p, ...buildPresetData(), name }
            : p
        )
      } else {
        const newPreset: CompanyPreset = {
          id: crypto.randomUUID(),
          name,
          createdAt: new Date().toISOString(),
          ...buildPresetData(),
        }
        updated = [...companyPresets, newPreset]
      }
      await onPatch({ companyFunnelPresets: updated })
      setCompanyPresets(updated)
      setPresetName("")
      setUpdatePresetId(null)
      setSaveDialogOpen(false)
      toast.success(updatePresetId ? `Шаблон «${name}» обновлён` : `Шаблон «${name}» сохранён`)
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

  // ── Переименовать пресет ──
  const handleRenamePreset = async () => {
    const name = renamePresetName.trim()
    if (!name || !renamePresetId) return
    const updated = companyPresets.map(p =>
      p.id === renamePresetId ? { ...p, name } : p
    )
    try {
      await onPatch({ companyFunnelPresets: updated })
      setCompanyPresets(updated)
      toast.success(`Шаблон переименован в «${name}»`)
    } catch {
      toast.error("Не удалось переименовать шаблон")
    } finally {
      setRenamePresetId(null)
      setRenamePresetName("")
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
            Включите нужные стадии, перетащите или нажмите ↑↓ для порядка, настройте
            цвет, название и действия на джоб-бордах. Системные стадии выключить
            нельзя. Это дефолт компании — применяется ко всем вакансиям.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">

          {/* Пресеты: встроенные */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Быстрое применение пресета
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {(Object.entries(FUNNEL_PRESETS) as [string, typeof FUNNEL_PRESETS[keyof typeof FUNNEL_PRESETS]][]).map(
                ([key, preset]) => {
                  const isActive = appliedPreset === key
                  return (
                    <Button
                      key={key}
                      variant={isActive ? "default" : "outline"}
                      size="sm"
                      className="h-7 text-xs gap-1"
                      onClick={() => applyBuiltinPreset(key as "fast" | "standard" | "deep")}
                    >
                      {isActive && <Check className="size-3" />}
                      {preset.label}
                    </Button>
                  )
                }
              )}
              {/* Шаблоны компании — чип: применить (по клику) + карандаш (переименовать) + удалить.
                  Активный (последний применённый) подсвечен заливкой. */}
              {companyPresets.map(preset => {
                const isActive = appliedPreset === preset.id
                return (
                  <div
                    key={preset.id}
                    className={cn(
                      "inline-flex items-center h-7 rounded-md border text-xs transition-colors",
                      isActive
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-primary/40 text-primary"
                    )}
                  >
                    <button
                      type="button"
                      className={cn(
                        "inline-flex items-center gap-1 pl-2.5 pr-1.5 h-full font-medium rounded-l-md",
                        !isActive && "hover:bg-primary/5"
                      )}
                      onClick={() => applyCompanyPreset(preset)}
                      title="Применить шаблон"
                    >
                      {isActive && <Check className="size-3" />}
                      {preset.name}
                    </button>
                    <button
                      type="button"
                      className={cn(
                        "inline-flex items-center justify-center w-6 h-full",
                        isActive ? "hover:bg-primary-foreground/15" : "hover:bg-primary/10 text-muted-foreground hover:text-foreground"
                      )}
                      onClick={() => { setRenamePresetId(preset.id); setRenamePresetName(preset.name) }}
                      title="Переименовать"
                    >
                      <Pencil className="size-3" />
                    </button>
                    <button
                      type="button"
                      className={cn(
                        "inline-flex items-center justify-center w-6 h-full rounded-r-md",
                        isActive ? "hover:bg-primary-foreground/15" : "hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                      )}
                      onClick={() => setDeletePresetId(preset.id)}
                      title="Удалить"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Таблица с горизонтальным скроллом */}
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground w-[42px]">
                    Вкл
                  </th>
                  <th className="px-1 py-2 text-left text-xs font-medium text-muted-foreground w-[60px]">
                    Порядок
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground w-[110px]">
                    Стадия
                  </th>
                  <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground w-[40px]">
                    Цвет
                  </th>
                  <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground">
                    Название
                  </th>
                  <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground w-[140px]">
                    Действие
                  </th>
                  <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground w-[140px]">
                    hh.ru
                  </th>
                  <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground w-[120px]">
                    <span>Авито</span>{" "}
                    <Badge variant="secondary" className="text-[10px] px-1 py-0 align-middle">скоро</Badge>
                  </th>
                </tr>
              </thead>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext items={stageOrder} strategy={verticalListSortingStrategy}>
                  <tbody>
                    {stageOrder.map((slug, idx) => {
                      const def = PLATFORM_STAGES[slug]
                      const isEnabled = enabledStages[slug] ?? true
                      const isSystem = def.isSystem
                      const color = (stageColors[slug] as StageColor | undefined) ?? def.defaultColor
                      const label = stageLabels[slug] ?? ""
                      const hhAction =
                        slug in stageHhActions
                          ? stageHhActions[slug]
                          : def.defaultHhAction
                      const hhStage = stageHhStages[slug] ?? "none"
                      const avitoVal = stageAvitoActions[slug] ?? "none"

                      return (
                        <SortableStageRow
                          key={slug}
                          slug={slug}
                          idx={idx}
                          totalCount={stageOrder.length}
                          isEnabled={isEnabled}
                          isSystem={isSystem}
                          color={color}
                          label={label}
                          hhAction={hhAction}
                          hhStage={hhStage}
                          avitoVal={avitoVal}
                          onToggle={toggleStage}
                          onMoveUp={(s) => moveStage(s, "up")}
                          onMoveDown={(s) => moveStage(s, "down")}
                          onColorChange={(s, c) => setStageColors(prev => ({ ...prev, [s]: c }))}
                          onLabelChange={(s, v) => setStageLabels(prev => ({ ...prev, [s]: v }))}
                          onHhActionChange={(s, v) =>
                            setStageHhActions(prev => ({ ...prev, [s]: v }))
                          }
                          onHhStageChange={(s, v) =>
                            setStageHhStages(prev => ({ ...prev, [s]: v }))
                          }
                          onAvitoChange={(s, v) =>
                            setStageAvitoActions(prev => ({ ...prev, [s]: v }))
                          }
                        />
                      )
                    })}
                  </tbody>
                </SortableContext>
              </DndContext>
            </table>
          </div>

          {/* Подсказки */}
          <div className="space-y-1">
            <p className="text-[11px] text-muted-foreground">
              Выключенные стадии не показываются в воронке новых вакансий. Системные стадии («Новый», «Отказ») выключить нельзя. Перетащите строки за иконку или используйте кнопки ↑↓.
            </p>
            <p className="text-[11px] text-muted-foreground">
              Авито — интеграция в разработке; действия сохранятся и применятся после подключения. Сейчас работает hh.ru.
            </p>
          </div>

          {/* Список «Сохранённые шаблоны компании» убран — управление шаблонами
              (применить / переименовать / удалить) перенесено на чипы пресетов
              сверху; ниже остаются «Сохранить как шаблон» и «Сохранить стадии». */}

          <div className="flex items-center justify-between gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5"
              onClick={() => {
                setUpdatePresetId(null)
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

      {/* Блок «Автоматический сбор обратной связи» перенесён в таб «Адаптация»
          (components/hiring-settings/adaptation-section.tsx). */}

      {/* ── Диалог: сохранить / обновить шаблон ── */}
      <Dialog
        open={saveDialogOpen}
        onOpenChange={(o) => {
          if (!o) {
            setSaveDialogOpen(false)
            setUpdatePresetId(null)
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {updatePresetId ? "Обновить шаблон воронки" : "Сохранить шаблон воронки"}
            </DialogTitle>
            <DialogDescription>
              {updatePresetId
                ? "Текущие настройки стадий перезапишут выбранный шаблон."
                : "Текущие настройки стадий (включённые, порядок, цвета, названия, действия hh/Авито) будут сохранены как шаблон компании."}
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
            <Button variant="outline" onClick={() => {
              setSaveDialogOpen(false)
              setUpdatePresetId(null)
            }}>
              Отмена
            </Button>
            <Button
              onClick={() => void handleSavePreset()}
              disabled={!presetName.trim() || savingPreset}
            >
              {savingPreset
                ? "Сохранение…"
                : updatePresetId
                  ? "Обновить шаблон"
                  : "Сохранить шаблон"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Диалог: переименование пресета ── */}
      <Dialog open={!!renamePresetId} onOpenChange={(o) => { if (!o) { setRenamePresetId(null); setRenamePresetName("") } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Переименовать шаблон</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="rename-preset-name">Новое название</Label>
            <Input
              id="rename-preset-name"
              value={renamePresetName}
              onChange={(e) => setRenamePresetName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && renamePresetName.trim()) void handleRenamePreset()
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRenamePresetId(null); setRenamePresetName("") }}>
              Отмена
            </Button>
            <Button
              onClick={() => void handleRenamePreset()}
              disabled={!renamePresetName.trim()}
            >
              Сохранить
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
