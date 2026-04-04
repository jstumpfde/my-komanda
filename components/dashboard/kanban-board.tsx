"use client"

import { useState } from "react"
import { CandidateCard, type Candidate } from "./candidate-card"
import { ListView } from "./list-view"
import { FunnelView } from "./funnel-view"
import { TilesView } from "./tiles-view"
import { ColumnColorPicker } from "./column-color-picker"
import type { CardDisplaySettings } from "./card-settings"
import { LayoutGrid, List, TrendingDown, Grid3X3, Plus, Minus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { cn } from "@/lib/utils"
import type { CandidateAction } from "@/lib/column-config"
import { COLUMN_ORDER } from "@/lib/column-config"

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

export function KanbanBoard({ settings, viewMode, onViewModeChange, columns = [], onColumnsChange, onOpenProfile, onAction, hideViewSwitcher, onAddCustomColumn, onRemoveColumn }: KanbanBoardProps) {
  const [addColOpen, setAddColOpen] = useState(false)
  const [newColName, setNewColName] = useState("")
  const [newColColor, setNewColColor] = useState("#3b82f6")
  const [insertAfterColId, setInsertAfterColId] = useState<string | null>(null)
  const [removeColId, setRemoveColId] = useState<string | null>(null)

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

  // KPI metrics — only standard columns
  const STANDARD_IDS = COLUMN_ORDER as readonly string[]
  const KPI_LABELS: Record<string, string> = {
    new: "Новый", demo: "Демо", decision: "Решение",
    interview: "Интервью", final_decision: "Фин.решение", hired: "Нанят",
  }
  const kpiSteps = STANDARD_IDS
    .map((id) => columns.find((c) => c.id === id))
    .filter((col): col is ColumnData => !!col)
    .map((col, i, arr) => {
      const prev = i > 0 ? arr[i - 1] : null
      const pct = prev && prev.count > 0 ? Math.round((col.count / prev.count) * 100) : null
      return { title: KPI_LABELS[col.id] || col.title, count: col.count, pct }
    })

  return (
    <div>
      {/* View mode switcher */}
      {!hideViewSwitcher && (
        <div className="flex items-center gap-2 mb-5">
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
        </div>
      )}

      {/* KPI funnel metrics bar */}
      {viewMode === "kanban" && kpiSteps.length > 0 && (
        <div className="flex items-center gap-1.5 mb-4 px-1 text-sm flex-wrap">
          {kpiSteps.map((step, i) => (
            <span key={step.title} className="flex items-center gap-1.5 shrink-0">
              {i > 0 && <span className="text-muted-foreground">→</span>}
              <span className="text-muted-foreground">{step.title}:</span>
              <span className="font-bold">{step.count}</span>
              {step.pct !== null && (
                <span className="text-muted-foreground text-xs">({step.pct}%)</span>
              )}
            </span>
          ))}
        </div>
      )}

      {/* Kanban View — no drag-and-drop */}
      {viewMode === "kanban" && (
        <div className="pb-4 -mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto">
          <div className="flex gap-3">
            {columns.map((column, colIndex) => {
              const isFirst = colIndex === 0
              const isLast = colIndex === columns.length - 1
              const isMiddle = !isFirst && !isLast

              return (
                <div
                  key={column.id}
                  className={cn(
                    "flex flex-col rounded-xl",
                    columns.length <= 6
                      ? "flex-1 min-w-[200px]"
                      : "shrink-0 min-w-[200px]"
                  )}
                  style={columns.length > 6 ? { width: "calc((100% - 3.75rem) / 6)" } : undefined}
                >
                  {/* Column Header */}
                  <div className="mb-3 rounded-xl overflow-visible group relative">
                    <div
                      className="flex items-center justify-between px-3.5 py-2.5 rounded-xl"
                      style={{ background: `linear-gradient(135deg, ${column.colorFrom}, ${column.colorTo})` }}
                    >
                      <div className="flex items-center gap-1.5">
                        <h3 className="font-semibold text-white text-sm">{column.title}</h3>
                        <span className="text-white font-bold text-sm">{column.count}</span>
                      </div>
                      <ColumnColorPicker
                        colorFrom={column.colorFrom}
                        colorTo={column.colorTo}
                        onColorChange={(from, to) => handleColorChange(column.id, from, to)}
                        title={column.title}
                        onTitleChange={(t) => handleTitleChange(column.id, t)}
                      />
                    </div>
                    {/* TASK 2+3: Minus & Plus buttons on middle columns */}
                    {isMiddle && (
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
                  <div className="space-y-3 flex-1 min-h-[100px] rounded-lg p-1">
                    {(column.candidates || []).map((candidate) => (
                      <CandidateCard
                        key={candidate.id}
                        candidate={candidate}
                        settings={settings}
                        columnId={column.id}
                        isLastColumn={isLast}
                        onOpenProfile={(c) => onOpenProfile?.(c, column.id)}
                        onAction={onAction}
                      />
                    ))}
                    {(column.candidates || []).length === 0 && (
                      <div className="flex items-center justify-center h-20 rounded-lg border-2 border-dashed border-border/50 text-muted-foreground/40">
                        <span className="text-xs">Пусто</span>
                      </div>
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
