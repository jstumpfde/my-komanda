"use client"

// Funnel Builder MVP — экспериментальный конструктор воронки на вакансию.
// См. drizzle/0127_funnel_builder.sql и lib/funnel-builder/blocks.ts.

import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { GripVertical, Settings2 } from "lucide-react"

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
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  BLOCK_META,
  type FunnelBlock,
  type FunnelBlockType,
  type FunnelConfig,
} from "@/lib/funnel-builder/blocks"

export interface FunnelBuilderProps {
  vacancyId: string
}

interface FunnelConfigResponse {
  funnelBuilderEnabled: boolean
  funnelConfigJson:     FunnelConfig
}

interface PendingIncompatibility {
  type:           FunnelBlockType
  conflictTypes:  FunnelBlockType[]
}

export function FunnelBuilder({ vacancyId }: FunnelBuilderProps) {
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [blocks, setBlocks] = useState<FunnelBlock[]>([])
  const [saving, setSaving] = useState(false)
  const [pendingConflict, setPendingConflict] = useState<PendingIncompatibility | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/modules/hr/vacancies/${vacancyId}/funnel-config`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<FunnelConfigResponse>
      })
      .then((d) => {
        if (cancelled) return
        setEnabled(Boolean(d.funnelBuilderEnabled))
        setBlocks(d.funnelConfigJson.blocks ?? [])
      })
      .catch(() => {
        if (cancelled) return
        setEnabled(false)
        setBlocks([])
      })
    return () => { cancelled = true }
  }, [vacancyId])

  const saveConfig = async (next: {
    funnelBuilderEnabled?: boolean
    blocks?:               FunnelBlock[]
  }) => {
    setSaving(true)
    try {
      const res = await fetch(`/api/modules/hr/vacancies/${vacancyId}/funnel-config`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(next),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(typeof data.error === "string" ? data.error : `HTTP ${res.status}`)
      }
      return true
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Не удалось сохранить")
      return false
    } finally {
      setSaving(false)
    }
  }

  const handleToggleBuilder = async (next: boolean) => {
    const prev = enabled
    setEnabled(next)
    const ok = await saveConfig({ funnelBuilderEnabled: next })
    if (!ok) {
      setEnabled(prev)
      return
    }
    toast.success(next ? "Конструктор включён" : "Конструктор выключен", { duration: 1500 })
  }

  const applyBlocks = async (next: FunnelBlock[]) => {
    const prev = blocks
    setBlocks(next)
    const ok = await saveConfig({ blocks: next })
    if (!ok) setBlocks(prev)
  }

  const handleToggleBlock = async (type: FunnelBlockType) => {
    const block = blocks.find((b) => b.type === type)
    if (!block) return
    const meta = BLOCK_META[type]
    if (meta.required && block.enabled) return // required нельзя выключить

    const turningOn = !block.enabled

    // Включение блока с incompatibleWith — спросить подтверждение.
    if (turningOn && meta.incompatibleWith.length > 0) {
      const conflicts = meta.incompatibleWith.filter((conflictType) => {
        const conflictBlock = blocks.find((b) => b.type === conflictType)
        return conflictBlock?.enabled
      })
      if (conflicts.length > 0) {
        setPendingConflict({ type, conflictTypes: conflicts })
        return
      }
    }

    const next = blocks.map((b) =>
      b.type === type ? { ...b, enabled: turningOn } : b,
    )
    await applyBlocks(next)
  }

  const confirmConflict = async () => {
    if (!pendingConflict) return
    const { type, conflictTypes } = pendingConflict
    setPendingConflict(null)
    const next = blocks.map((b) => {
      if (b.type === type) return { ...b, enabled: true }
      if (conflictTypes.includes(b.type)) return { ...b, enabled: false }
      return b
    })
    await applyBlocks(next)
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = blocks.findIndex((b) => b.type === active.id)
    const newIndex = blocks.findIndex((b) => b.type === over.id)
    if (oldIndex < 0 || newIndex < 0) return
    const reordered = arrayMove(blocks, oldIndex, newIndex).map((b, idx) => ({
      ...b,
      order: idx + 1,
    }))
    await applyBlocks(reordered)
  }

  const itemIds = useMemo(() => blocks.map((b) => b.type), [blocks])

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle>Конструктор воронки</CardTitle>
          <Badge variant="outline">Beta</Badge>
        </div>
        <CardDescription>
          Экспериментальный режим. Перетаскивайте блоки чтобы изменить порядок.
          Включите тумблер чтобы протестировать новый формат настройки воронки.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between mb-4">
          <Label className="text-sm font-medium">Использовать конструктор воронки</Label>
          <Switch
            checked={Boolean(enabled)}
            onCheckedChange={handleToggleBuilder}
            disabled={enabled === null || saving}
          />
        </div>

        {enabled && (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {blocks.map((block) => (
                  <SortableBlockCard
                    key={block.type}
                    block={block}
                    saving={saving}
                    onToggle={() => handleToggleBlock(block.type)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}

        {!enabled && (
          <div className="text-sm text-muted-foreground py-8 text-center">
            Конструктор выключен. Используется классическая воронка из других табов настроек.
          </div>
        )}
      </CardContent>

      <AlertDialog
        open={pendingConflict !== null}
        onOpenChange={(open) => { if (!open) setPendingConflict(null) }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingConflict && `Включить «${BLOCK_META[pendingConflict.type].label}»?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingConflict && (
                <>
                  Включение «{BLOCK_META[pendingConflict.type].label}» отключит{" "}
                  {pendingConflict.conflictTypes
                    .map((t) => `«${BLOCK_META[t].label}»`)
                    .join(" и ")}
                  . Продолжить?
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={confirmConflict}>Включить</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}

interface SortableBlockCardProps {
  block:    FunnelBlock
  saving:   boolean
  onToggle: () => void
}

function SortableBlockCard({ block, saving, onToggle }: SortableBlockCardProps) {
  const meta = BLOCK_META[block.type]
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: block.type })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity:   isDragging ? 0.5 : 1,
  }

  const Icon = meta.icon

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5"
    >
      <button
        type="button"
        className="touch-none cursor-grab text-muted-foreground hover:text-foreground"
        aria-label="Перетащить"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <Icon className="h-5 w-5 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{meta.label}</span>
          {meta.required && (
            <Badge variant="secondary" className="text-[10px]">обязательный</Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground truncate">{meta.description}</p>
      </div>
      {meta.required ? (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              {/* span обёртка нужна — disabled Switch не ловит hover */}
              <span className="inline-flex">
                <Switch checked={block.enabled} disabled />
              </span>
            </TooltipTrigger>
            <TooltipContent>Обязательный блок</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        <Switch
          checked={block.enabled}
          onCheckedChange={onToggle}
          disabled={saving}
        />
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        aria-label="Настройки блока"
        disabled
      >
        <Settings2 className="h-4 w-4" />
      </Button>
    </div>
  )
}
