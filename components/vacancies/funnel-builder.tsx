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
import { ChevronDown, GripVertical, Plus, Settings, Settings2, Star } from "lucide-react"

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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  applyFunnelTemplate,
  BLOCK_META,
  FUNNEL_TEMPLATES,
  normalizeFunnelConfig,
  type FunnelBlock,
  type FunnelBlockType,
  type FunnelConfig,
} from "@/lib/funnel-builder/blocks"
import { BLOCK_SETTINGS_REGISTRY } from "@/lib/funnel-builder/block-settings"
import {
  ManageFunnelTemplatesDialog,
  SaveFunnelTemplateDialog,
  type CompanyFunnelTemplate,
} from "./company-funnel-templates-dialogs"

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
  const [openBlockType, setOpenBlockType] = useState<FunnelBlockType | null>(null)
  const [pendingTemplate, setPendingTemplate] = useState<string | null>(null)
  // Group 15: пер-компанийная библиотека шаблонов воронки.
  const [companyTemplates, setCompanyTemplates] = useState<CompanyFunnelTemplate[]>([])
  const [pendingCompanyTplId, setPendingCompanyTplId] = useState<string | null>(null)
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [manageDialogOpen, setManageDialogOpen] = useState(false)

  const reloadCompanyTemplates = async () => {
    try {
      const res = await fetch("/api/modules/hr/company-funnel-templates")
      if (!res.ok) return
      const data = await res.json() as { templates?: CompanyFunnelTemplate[] }
      setCompanyTemplates(data.templates ?? [])
    } catch {
      // тихо — это не критично
    }
  }

  useEffect(() => {
    void reloadCompanyTemplates()
  }, [])

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

  const confirmTemplate = async () => {
    if (!pendingTemplate) return
    const tpl = FUNNEL_TEMPLATES[pendingTemplate]
    setPendingTemplate(null)
    if (!tpl) return
    const next = applyFunnelTemplate(tpl, blocks)
    await applyBlocks(next)
    toast.success(`Шаблон «${tpl.name}» применён`, { duration: 1500 })
  }

  const confirmCompanyTemplate = async () => {
    if (!pendingCompanyTplId) return
    const tpl = companyTemplates.find((t) => t.id === pendingCompanyTplId)
    setPendingCompanyTplId(null)
    if (!tpl) return
    // Шаблон компании хранит готовый набор блоков — нормализуем (на случай
    // если список типов изменился с момента сохранения) и применяем целиком.
    const normalized = normalizeFunnelConfig(tpl.configJson)
    await applyBlocks(normalized.blocks)
    toast.success(`Шаблон «${tpl.name}» применён`, { duration: 1500 })
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
        <div className="flex items-center justify-between mb-4 gap-2">
          <Label className="text-sm font-medium">Использовать конструктор воронки</Label>
          <div className="flex items-center gap-2">
            {enabled && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" disabled={saving}>
                    Применить шаблон
                    <ChevronDown className="ml-1 h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-80">
                  {companyTemplates.length > 0 && (
                    <>
                      <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        Шаблоны компании
                      </DropdownMenuLabel>
                      {companyTemplates.map((tpl) => (
                        <DropdownMenuItem
                          key={tpl.id}
                          onSelect={() => setPendingCompanyTplId(tpl.id)}
                          className="flex flex-col items-start gap-0.5 py-2"
                        >
                          <span className="text-sm font-medium flex items-center gap-1.5 w-full">
                            <span className="truncate">{tpl.name}</span>
                            {tpl.isDefault && (
                              <Star className="h-3 w-3 fill-amber-400 text-amber-500 shrink-0 ml-auto" />
                            )}
                          </span>
                          {tpl.description && (
                            <span className="text-xs text-muted-foreground line-clamp-2">{tpl.description}</span>
                          )}
                        </DropdownMenuItem>
                      ))}
                      <DropdownMenuSeparator />
                    </>
                  )}
                  <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Встроенные
                  </DropdownMenuLabel>
                  {Object.entries(FUNNEL_TEMPLATES).map(([key, template]) => (
                    <DropdownMenuItem
                      key={key}
                      onSelect={() => setPendingTemplate(key)}
                      className="flex flex-col items-start gap-0.5 py-2"
                    >
                      <span className="text-sm font-medium">{template.name}</span>
                      <span className="text-xs text-muted-foreground">{template.description}</span>
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => setSaveDialogOpen(true)}
                    className="flex items-center gap-2 py-2"
                  >
                    <Plus className="h-4 w-4" />
                    <span className="text-sm">Сохранить текущую как шаблон…</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => setManageDialogOpen(true)}
                    className="flex items-center gap-2 py-2"
                  >
                    <Settings className="h-4 w-4" />
                    <span className="text-sm">Управление шаблонами…</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <Switch
              checked={Boolean(enabled)}
              onCheckedChange={handleToggleBuilder}
              disabled={enabled === null || saving}
            />
          </div>
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
                    onOpenSettings={() => setOpenBlockType(block.type)}
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

      <AlertDialog
        open={pendingTemplate !== null}
        onOpenChange={(open) => { if (!open) setPendingTemplate(null) }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingTemplate && `Применить шаблон «${FUNNEL_TEMPLATES[pendingTemplate]?.name}»?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Текущие настройки блоков воронки будут перезаписаны значениями
              из шаблона. Сами настройки внутри блоков (тексты сообщений, пороги
              и т. п.) сохранятся — изменится только список включённых блоков.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={confirmTemplate}>Применить</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={pendingCompanyTplId !== null}
        onOpenChange={(open) => { if (!open) setPendingCompanyTplId(null) }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingCompanyTplId && `Применить шаблон «${companyTemplates.find((t) => t.id === pendingCompanyTplId)?.name ?? ""}»?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Текущий набор включённых блоков и их порядок будут заменены
              сохранённым шаблоном. Настройки внутри блоков (тексты, пороги,
              сценарии AI и т. п.) сохранятся — изменится только список
              включённых блоков и порядок.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={confirmCompanyTemplate}>Применить</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SaveFunnelTemplateDialog
        open={saveDialogOpen}
        onOpenChange={setSaveDialogOpen}
        currentBlocks={blocks}
        onSaved={() => { void reloadCompanyTemplates() }}
      />

      <ManageFunnelTemplatesDialog
        open={manageDialogOpen}
        onOpenChange={setManageDialogOpen}
        onChanged={() => { void reloadCompanyTemplates() }}
      />

      <Sheet
        open={openBlockType !== null}
        onOpenChange={(open) => { if (!open) setOpenBlockType(null) }}
      >
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto p-6">
          {openBlockType && (() => {
            const entry  = BLOCK_SETTINGS_REGISTRY[openBlockType]
            const meta   = BLOCK_META[openBlockType]
            const title  = entry?.title       ?? meta.label
            const desc   = entry?.description ?? meta.description
            const Comp   = entry?.component   ?? null
            return (
              <>
                <SheetHeader className="px-0">
                  <SheetTitle>{title}</SheetTitle>
                  <SheetDescription>{desc}</SheetDescription>
                </SheetHeader>
                <div className="mt-6">
                  {Comp ? (
                    <Comp vacancyId={vacancyId} onSaved={() => setOpenBlockType(null)} />
                  ) : (
                    <p className="text-sm text-muted-foreground">В разработке — настроек для этого блока пока нет.</p>
                  )}
                </div>
              </>
            )
          })()}
        </SheetContent>
      </Sheet>
    </Card>
  )
}

interface SortableBlockCardProps {
  block:          FunnelBlock
  saving:         boolean
  onToggle:       () => void
  onOpenSettings: () => void
}

function SortableBlockCard({ block, saving, onToggle, onOpenSettings }: SortableBlockCardProps) {
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
        onClick={onOpenSettings}
      >
        <Settings2 className="h-4 w-4" />
      </Button>
    </div>
  )
}
