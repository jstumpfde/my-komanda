"use client"

import { useState, useCallback, useEffect } from "react"
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Plus,
  GripVertical,
  Trash2,
  Lock,
  User,
  Phone,
  Save,
  Loader2,
  ClipboardList,
} from "lucide-react"
import { toast } from "sonner"

// ─── Типы ────────────────────────────────────────────────────

export type MiniFormFieldType = "text" | "number" | "select" | "boolean"

export interface MiniFormField {
  id: string
  label: string
  type: MiniFormFieldType
  required: boolean
  placeholder?: string
  options?: string[] // для type === "select"
}

const PRESET_FIELDS: { label: string; type: MiniFormFieldType; placeholder?: string }[] = [
  { label: "Город", type: "text", placeholder: "Москва" },
  { label: "Опыт (лет)", type: "number", placeholder: "3" },
  { label: "Зарплатные ожидания", type: "number", placeholder: "100 000" },
  { label: "Откуда узнали", type: "text", placeholder: "hh.ru, знакомые..." },
  { label: "Email", type: "text", placeholder: "email@example.com" },
  { label: "Ссылка на резюме", type: "text", placeholder: "https://..." },
]

const FIELD_TYPE_LABELS: Record<MiniFormFieldType, string> = {
  text: "Текст",
  number: "Число",
  select: "Выбор из списка",
  boolean: "Да / Нет",
}

// ─── Sortable Item ───────────────────────────────────────────

function SortableField({
  field,
  onToggleRequired,
  onRemove,
}: {
  field: MiniFormField
  onToggleRequired: (id: string) => void
  onRemove: (id: string) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: field.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 px-3 py-2.5 rounded-lg border bg-background hover:bg-muted/30 transition-colors group"
    >
      <button
        className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground shrink-0"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="w-4 h-4" />
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{field.label}</span>
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">
            {FIELD_TYPE_LABELS[field.type]}
          </Badge>
        </div>
        {field.placeholder && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">
            {field.placeholder}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <div className="flex items-center gap-1.5">
          <Label className="text-[11px] text-muted-foreground cursor-pointer" htmlFor={`req-${field.id}`}>
            Обяз.
          </Label>
          <Switch
            id={`req-${field.id}`}
            checked={field.required}
            onCheckedChange={() => onToggleRequired(field.id)}
            className="scale-75"
          />
        </div>
        <button
          onClick={() => onRemove(field.id)}
          className="text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

// ─── Main Component ──────────────────────────────────────────

interface MiniFormBuilderProps {
  vacancyId: string
  descriptionJson?: unknown
}

export function MiniFormBuilder({ vacancyId, descriptionJson }: MiniFormBuilderProps) {
  const [fields, setFields] = useState<MiniFormField[]>([])
  const [saving, setSaving] = useState(false)
  const [showCustomDialog, setShowCustomDialog] = useState(false)
  const [customLabel, setCustomLabel] = useState("")
  const [customType, setCustomType] = useState<MiniFormFieldType>("text")
  const [customOptions, setCustomOptions] = useState("")

  // Parse initial fields from descriptionJson
  useEffect(() => {
    if (descriptionJson && typeof descriptionJson === "object" && descriptionJson !== null) {
      const dj = descriptionJson as Record<string, unknown>
      if (Array.isArray(dj.miniFormFields)) {
        setFields(dj.miniFormFields as MiniFormField[])
      }
    }
  }, [descriptionJson])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (over && active.id !== over.id) {
      setFields((prev) => {
        const oldIndex = prev.findIndex((f) => f.id === active.id)
        const newIndex = prev.findIndex((f) => f.id === over.id)
        return arrayMove(prev, oldIndex, newIndex)
      })
    }
  }

  const addPresetField = (preset: (typeof PRESET_FIELDS)[number]) => {
    const exists = fields.some((f) => f.label === preset.label)
    if (exists) {
      toast.error(`Поле «${preset.label}» уже добавлено`)
      return
    }
    setFields((prev) => [
      ...prev,
      {
        id: `field-${Date.now()}`,
        label: preset.label,
        type: preset.type,
        required: false,
        placeholder: preset.placeholder,
      },
    ])
  }

  const addCustomField = () => {
    if (!customLabel.trim()) {
      toast.error("Введите название поля")
      return
    }
    const newField: MiniFormField = {
      id: `field-${Date.now()}`,
      label: customLabel.trim(),
      type: customType,
      required: false,
    }
    if (customType === "select" && customOptions.trim()) {
      newField.options = customOptions.split(",").map((o) => o.trim()).filter(Boolean)
    }
    setFields((prev) => [...prev, newField])
    setShowCustomDialog(false)
    setCustomLabel("")
    setCustomType("text")
    setCustomOptions("")
  }

  const toggleRequired = (id: string) => {
    setFields((prev) =>
      prev.map((f) => (f.id === id ? { ...f, required: !f.required } : f)),
    )
  }

  const removeField = (id: string) => {
    setFields((prev) => prev.filter((f) => f.id !== id))
  }

  const saveFields = useCallback(async () => {
    setSaving(true)
    try {
      const currentJson =
        descriptionJson && typeof descriptionJson === "object" && descriptionJson !== null
          ? (descriptionJson as Record<string, unknown>)
          : {}

      const res = await fetch(`/api/modules/hr/vacancies/${vacancyId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description_json: { ...currentJson, miniFormFields: fields },
        }),
      })

      if (!res.ok) throw new Error("Ошибка сохранения")
      toast.success("Поля формы сохранены")
    } catch {
      toast.error("Не удалось сохранить поля формы")
    } finally {
      setSaving(false)
    }
  }, [vacancyId, fields, descriptionJson])

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardList className="w-4 h-4" />
            Поля формы для анонимных кандидатов
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Настройте поля, которые кандидат заполняет при отклике на публичной странице вакансии
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Системные поля */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Системные поля (всегда показаны)
            </p>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-dashed bg-muted/30">
                <Lock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="text-sm font-medium">Имя</span>
                <span className="text-xs text-muted-foreground ml-auto">Имя Фамилия</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-dashed bg-muted/30">
                <Lock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <Phone className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="text-sm font-medium">Телефон или Telegram</span>
                <span className="text-xs text-muted-foreground ml-auto">переключатель</span>
              </div>
            </div>
          </div>

          {/* Настраиваемые поля */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Дополнительные поля
            </p>

            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={fields.map((f) => f.id)} strategy={verticalListSortingStrategy}>
                <div className="space-y-1.5">
                  {fields.map((field) => (
                    <SortableField
                      key={field.id}
                      field={field}
                      onToggleRequired={toggleRequired}
                      onRemove={removeField}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>

          {/* Кнопки: добавить + сохранить */}
          <div className="flex items-center justify-between mt-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 px-4 h-8 text-xs">
                  <Plus className="w-3.5 h-3.5" />
                  Добавить поле
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                {PRESET_FIELDS.map((preset) => {
                  const exists = fields.some((f) => f.label === preset.label)
                  return (
                    <DropdownMenuItem
                      key={preset.label}
                      disabled={exists}
                      onClick={() => addPresetField(preset)}
                    >
                      {preset.label}
                      {exists && <span className="ml-auto text-xs text-muted-foreground">добавлено</span>}
                    </DropdownMenuItem>
                  )
                })}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setShowCustomDialog(true)}>
                  <Plus className="w-3.5 h-3.5 mr-2" />
                  Своё поле…
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="sm" className="gap-1.5 h-8 text-xs" onClick={saveFields} disabled={saving}>
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Сохранить
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Диалог кастомного поля */}
      <Dialog open={showCustomDialog} onOpenChange={setShowCustomDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Добавить своё поле</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-sm">Название поля</Label>
              <Input
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
                placeholder="Например: Портфолио"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Тип</Label>
              <Select value={customType} onValueChange={(v) => setCustomType(v as MiniFormFieldType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Текст</SelectItem>
                  <SelectItem value="number">Число</SelectItem>
                  <SelectItem value="select">Выбор из списка</SelectItem>
                  <SelectItem value="boolean">Да / Нет</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {customType === "select" && (
              <div className="space-y-1.5">
                <Label className="text-sm">Варианты (через запятую)</Label>
                <Input
                  value={customOptions}
                  onChange={(e) => setCustomOptions(e.target.value)}
                  placeholder="Вариант 1, Вариант 2, Вариант 3"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCustomDialog(false)}>
              Отмена
            </Button>
            <Button onClick={addCustomField}>Добавить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
