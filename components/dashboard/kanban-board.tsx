"use client"

import { useState } from "react"
import { CandidateCard, type Candidate } from "./candidate-card"
import { ListView } from "./list-view"
import { FunnelView } from "./funnel-view"
import { TilesView } from "./tiles-view"
import { ColumnColorPicker } from "./column-color-picker"
import type { CardDisplaySettings } from "./card-settings"
import { LayoutGrid, List, TrendingDown, Grid3X3, Plus, Minus, MonitorPlay, Clock, X, ArrowUpDown, ArrowDown, ArrowUp, BarChart3, Sparkles, Star } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import type { CandidateAction } from "@/lib/column-config"

export type CandidateSortMode = "date_desc" | "date_asc" | "demo_progress" | "ai_score" | "favorite"

const SORT_OPTIONS: Array<{ value: CandidateSortMode; label: string; icon: React.ElementType }> = [
  { value: "date_desc",     label: "По дате (новые сверху)", icon: ArrowDown },
  { value: "date_asc",      label: "По дате (старые сверху)", icon: ArrowUp },
  { value: "demo_progress", label: "По прогрессу демо",       icon: BarChart3 },
  { value: "ai_score",      label: "По AI-скору",             icon: Sparkles },
  { value: "favorite",      label: "Избранные сверху",        icon: Star },
]

function timestampOf(c: Candidate): number {
  if (c.createdAt) {
    const d = c.createdAt instanceof Date ? c.createdAt : new Date(c.createdAt)
    const t = d.getTime()
    if (!Number.isNaN(t)) return t
  }
  if (c.addedAt) {
    const t = c.addedAt instanceof Date ? c.addedAt.getTime() : new Date(c.addedAt as unknown as string).getTime()
    if (!Number.isNaN(t)) return t
  }
  return 0
}

function demoProgressOf(c: Candidate): number {
  const dp = c.demoProgressJson
  if (!dp || !Array.isArray(dp.blocks)) return -1
  const total = dp.totalBlocks ?? dp.blocks.length
  if (total <= 0) return -1
  const completed = dp.blocks.filter(b => b?.status === "completed").length
  return completed / total
}

export function applySortMode(list: Candidate[], mode: CandidateSortMode): Candidate[] {
  const arr = [...list]
  switch (mode) {
    case "date_desc":
      return arr.sort((a, b) => timestampOf(b) - timestampOf(a))
    case "date_asc":
      return arr.sort((a, b) => timestampOf(a) - timestampOf(b))
    case "demo_progress":
      return arr.sort((a, b) => {
        const da = demoProgressOf(a)
        const db = demoProgressOf(b)
        if (db !== da) return db - da
        return timestampOf(b) - timestampOf(a)
      })
    case "ai_score":
      return arr.sort((a, b) => {
        const sa = a.aiScore ?? -1
        const sb = b.aiScore ?? -1
        if (sb !== sa) return sb - sa
        return timestampOf(b) - timestampOf(a)
      })
    case "favorite":
      return arr.sort((a, b) => {
        const fa = a.isFavorite ? 1 : 0
        const fb = b.isFavorite ? 1 : 0
        if (fb !== fa) return fb - fa
        return timestampOf(b) - timestampOf(a)
      })
    default:
      return arr
  }
}

export type ViewMode = "kanban" | "list" | "funnel" | "tiles"

interface ColumnData {
  id: string
  title: string
  count: number
  colorFrom: string
  colorTo: string
  candidates: Candidate[]
}

interface KanbanBoardProps {
  settings: CardDisplaySettings
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
  columns: ColumnData[]
  onColumnsChange: (columns: ColumnData[]) => void
  onOpenProfile?: (candidate: Candidate, columnId: string) => void
  onAction?: (candidateId: string, columnId: string, action: CandidateAction) => void
  onToggleFavorite?: (candidateId: string, isFavorite: boolean) => void
  hideViewSwitcher?: boolean
  onAddCustomColumn?: (name: string, color: string, afterColumnId?: string) => void
  onRemoveColumn?: (columnId: string) => void
}

const VIEW_BUTTONS: { mode: ViewMode; icon: React.ElementType; label: string }[] = [
  { mode: "funnel", icon: TrendingDown, label: "Воронка" },
  { mode: "list", icon: List, label: "Список" },
  { mode: "kanban", icon: LayoutGrid, label: "Канбан" },
  { mode: "tiles", icon: Grid3X3, label: "Плитки" },
]

const PRESET_COLORS = ["#94a3b8", "#3b82f6", "#ef4444", "#8b5cf6", "#f97316", "#22c55e", "#ec4899", "#06b6d4", "#f59e0b", "#10b981"]

export function KanbanBoard({ settings, viewMode, onViewModeChange, columns = [], onColumnsChange, onOpenProfile, onAction, onToggleFavorite, hideViewSwitcher, onAddCustomColumn, onRemoveColumn }: KanbanBoardProps) {
  const [addColOpen, setAddColOpen] = useState(false)
  const [newColName, setNewColName] = useState("")
  const [newColColor, setNewColColor] = useState("#3b82f6")
  const [insertAfterColId, setInsertAfterColId] = useState<string | null>(null)
  const [removeColId, setRemoveColId] = useState<string | null>(null)
  const [sortMode, setSortMode] = useState<CandidateSortMode>("date_desc")
  const sortLabel = SORT_OPTIONS.find(o => o.value === sortMode)?.label ?? "Сортировка"

  const handleAddColumn = () => {
    if (!newColName.trim() || !onAddCustomColumn) return
    onAddCustomColumn(newColName.trim(), newColColor, insertAfterColId || undefined)
    setNewColName("")
    setNewColColor("#3b82f6")
    setInsertAfterColId(null)
    setAddColOpen(false)
  }

  const handleRemoveColumn = () => {
    if (!removeColId || !onRemoveColumn) return
    onRemoveColumn(removeColId)
    setRemoveColId(null)
  }

  const handleColorChange = (colId: string, from: string, to: string) => {
    onColumnsChange(
      columns.map((col) => (col.id === colId ? { ...col, colorFrom: from, colorTo: to } : col))
    )
  }

  const handleTitleChange = (colId: string, title: string) => {
    onColumnsChange(
      columns.map((col) => (col.id === colId ? { ...col, title } : col))
    )
  }

  return (
    <div>
      {/* View mode switcher + sort */}
      {!hideViewSwitcher && (
        <div className="flex items-center gap-2 mb-5 flex-wrap">
          <div className="flex items-center bg-muted rounded-lg p-1 gap-0.5">
            {VIEW_BUTTONS.map(({ mode, icon: Icon, label }) => (
              <Button
                key={mode}
                variant={viewMode === mode ? "default" : "ghost"}
                size="sm"
                className={cn(
                  "h-7 px-3 text-xs gap-1.5 transition-all",
                  viewMode === mode ? "shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
                onClick={() => onViewModeChange(mode)}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </Button>
            ))}
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 px-2.5 text-xs gap-1.5">
                <ArrowUpDown className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{sortLabel}</span>
                <span className="sm:hidden">Сортировка</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              {SORT_OPTIONS.map(opt => {
                const Icon = opt.icon
                return (
                  <DropdownMenuItem
                    key={opt.value}
                    onClick={() => setSortMode(opt.value)}
                    className={cn(sortMode === opt.value && "bg-accent")}
                  >
                    <Icon className="w-3.5 h-3.5 mr-2" />
                    {opt.label}
                  </DropdownMenuItem>
                )
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {/* Kanban View — equal-width columns filling full width */}
      {viewMode === "kanban" && (
        <div className="pb-4 -mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto">
          <div
            className="grid gap-3 w-full"
            style={{ gridTemplateColumns: `repeat(${columns.length || 1}, minmax(150px, 1fr))` }}
          >
            {columns.map((column, colIndex) => {
              const isFirst = colIndex === 0
              const isLast = colIndex === columns.length - 1
              const protectedIds = ["new", "demo", "final_decision", "hired"]
              const canManage = !protectedIds.includes(column.id)

              return (
                <div
                  key={column.id}
                  className="flex flex-col rounded-xl min-w-0"
                >
                  {/* Column Header */}
                  <div className="mb-3 rounded-lg overflow-visible group relative">
                    <div
                      className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg w-full relative"
                      style={{ background: `linear-gradient(135deg, ${column.colorFrom}, ${column.colorTo})` }}
                    >
                      <h3 className="font-medium text-white text-xs truncate">{column.title}</h3>
                      <span className="text-white/90 font-bold text-xs">{column.count}</span>
                      <div className="absolute right-2 top-1/2 -translate-y-1/2">
                        <ColumnColorPicker
                          colorFrom={column.colorFrom}
                          colorTo={column.colorTo}
                          onColorChange={(from, to) => handleColorChange(column.id, from, to)}
                          title={column.title}
                          onTitleChange={(t) => handleTitleChange(column.id, t)}
                        />
                      </div>
                    </div>
                    {(() => {
                      const cands = column.candidates || []
                      if (cands.length === 0) return null
                      const completed = cands.filter((c) => c.demoProgressJson?.completedAt != null).length
                      const inProgress = cands.filter((c) => c.demoProgressJson != null && !c.demoProgressJson?.completedAt).length
                      const notStarted = cands.filter((c) => c.demoProgressJson == null).length
                      return (
                        <div className="mt-1.5 flex items-center justify-center gap-2 text-xs text-muted-foreground flex-wrap">
                          <span className="inline-flex items-center gap-1"><MonitorPlay className="w-3 h-3" /> {completed}</span>
                          <span className="inline-flex items-center gap-1"><Clock className="w-3 h-3" /> {inProgress}</span>
                          <span className="inline-flex items-center gap-1"><X className="w-3 h-3" /> {notStarted}</span>
                        </div>
                      )
                    })()}
                    {/* Minus & Plus buttons on manageable columns */}
                    {canManage && !isFirst && !isLast && (
                      <>
                        {onRemoveColumn && (
                          <button
                            type="button"
                            className="absolute left-[-10px] top-1/2 -translate-y-1/2 z-10 w-5 h-5 rounded-full bg-background border border-border shadow-sm hover:bg-red-50 hover:border-red-200 flex items-center justify-center transition-all opacity-0 group-hover:opacity-100"
                            title="Удалить этап"
                            onClick={() => setRemoveColId(column.id)}
                          >
                            <Minus className="w-3.5 h-3.5 text-muted-foreground" />
                          </button>
                        )}
                        {onAddCustomColumn && (
                          <button
                            type="button"
                            className="absolute right-[-10px] top-1/2 -translate-y-1/2 z-10 w-5 h-5 rounded-full bg-background border border-border shadow-sm hover:bg-green-50 hover:border-green-200 flex items-center justify-center transition-all opacity-0 group-hover:opacity-100"
                            title="Добавить этап после"
                            onClick={() => { setInsertAfterColId(column.id); setAddColOpen(true) }}
                          >
                            <Plus className="w-3.5 h-3.5 text-muted-foreground" />
                          </button>
                        )}
                      </>
                    )}
                  </div>

                  {/* Cards */}
                  <div
                    className={cn(
                      "space-y-3 flex-1 min-h-[300px] rounded-lg p-1",
                      (column.candidates || []).length === 0 && "border-2 border-dashed border-border/50 flex items-center justify-center",
                    )}
                  >
                    {applySortMode(column.candidates || [], sortMode).map((candidate) => (
                      <CandidateCard
                        key={candidate.id}
                        candidate={candidate}
                        settings={settings}
                        columnId={column.id}
                        isLastColumn={isLast}
                        onOpenProfile={(c) => onOpenProfile?.(c, column.id)}
                        onAction={onAction}
                        onToggleFavorite={onToggleFavorite}
                      />
                    ))}
                    {(column.candidates || []).length === 0 && (
                      <span className="text-xs text-muted-foreground/50">Пусто</span>
                    )}
                  </div>
                </div>
              )
            })}

          </div>
        </div>
      )}

      {/* Add custom column dialog */}
      <Dialog open={addColOpen} onOpenChange={(open) => { setAddColOpen(open); if (!open) setInsertAfterColId(null) }}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader>
            <DialogTitle>Добавить колонку</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Название</Label>
              <Input
                value={newColName}
                onChange={(e) => setNewColName(e.target.value)}
                placeholder="Название колонки"
                onKeyDown={(e) => e.key === "Enter" && handleAddColumn()}
              />
            </div>
            <div className="space-y-2">
              <Label>Цвет</Label>
              <div className="flex gap-2 flex-wrap">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    className={cn(
                      "w-7 h-7 rounded-full border-2 transition-all",
                      newColColor === c ? "border-foreground scale-110" : "border-transparent"
                    )}
                    style={{ backgroundColor: c }}
                    onClick={() => setNewColColor(c)}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddColOpen(false); setInsertAfterColId(null) }}>Отмена</Button>
            <Button onClick={handleAddColumn} disabled={!newColName.trim()}>Добавить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove column confirm dialog */}
      <AlertDialog open={!!removeColId} onOpenChange={(open) => { if (!open) setRemoveColId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить этап?</AlertDialogTitle>
            <AlertDialogDescription>
              Кандидаты перейдут в предыдущий этап.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemoveColumn} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {viewMode === "list" && (
        <ListView columns={columns} settings={settings} onOpenProfile={onOpenProfile} onAction={onAction} />
      )}

      {viewMode === "funnel" && (
        <FunnelView columns={columns} settings={settings} onOpenProfile={onOpenProfile} onAction={onAction} />
      )}

      {viewMode === "tiles" && (
        <TilesView columns={columns} settings={settings} onOpenProfile={onOpenProfile} onAction={onAction} />
      )}
    </div>
  )
}
