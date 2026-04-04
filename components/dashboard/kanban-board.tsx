"use client"

import { useState } from "react"
import { CandidateCard, type Candidate } from "./candidate-card"
import { ListView } from "./list-view"
import { FunnelView } from "./funnel-view"
import { TilesView } from "./tiles-view"
import { ColumnColorPicker } from "./column-color-picker"
import type { CardDisplaySettings } from "./card-settings"
import { LayoutGrid, List, TrendingDown, Grid3X3, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import type { CandidateAction } from "@/lib/column-config"
import { HR_DECISION_COLUMNS } from "@/lib/column-config"

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
  onAddCustomColumn?: (name: string, color: string) => void
}

const VIEW_BUTTONS: { mode: ViewMode; icon: React.ElementType; label: string }[] = [
  { mode: "funnel", icon: TrendingDown, label: "Воронка" },
  { mode: "list", icon: List, label: "Список" },
  { mode: "kanban", icon: LayoutGrid, label: "Канбан" },
  { mode: "tiles", icon: Grid3X3, label: "Плитки" },
]

const PRESET_COLORS = ["#94a3b8", "#3b82f6", "#ef4444", "#8b5cf6", "#f97316", "#22c55e", "#ec4899", "#06b6d4", "#f59e0b", "#10b981"]

export function KanbanBoard({ settings, viewMode, onViewModeChange, columns = [], onColumnsChange, onOpenProfile, onAction, hideViewSwitcher, onAddCustomColumn }: KanbanBoardProps) {
  const [addColOpen, setAddColOpen] = useState(false)
  const [newColName, setNewColName] = useState("")
  const [newColColor, setNewColColor] = useState("#3b82f6")

  const handleAddColumn = () => {
    if (!newColName.trim() || !onAddCustomColumn) return
    onAddCustomColumn(newColName.trim(), newColColor)
    setNewColName("")
    setNewColColor("#3b82f6")
    setAddColOpen(false)
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

      {/* Kanban column counters — mobile */}
      {viewMode === "kanban" && (
        <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1 md:hidden">
          {columns.map(col => (
            <div key={col.id} className="flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-medium shrink-0 border" style={{ borderColor: col.colorFrom + "40", color: col.colorFrom }}>
              {col.title.split(" ")[0]} <span className="font-bold">{col.count}</span>
            </div>
          ))}
        </div>
      )}

      {/* Kanban View — no drag-and-drop */}
      {viewMode === "kanban" && (
        <div className="pb-4 -mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto">
          <div className="flex gap-3">
            {columns.map((column, colIndex) => {
              const isDecision = HR_DECISION_COLUMNS.includes(column.id)
              const isLastColumn = colIndex === columns.length - 1

              return (
                <div
                  key={column.id}
                  className={cn(
                    "flex flex-col rounded-xl",
                    "min-w-[200px]",
                    columns.length <= 6 && "flex-1"
                  )}
                >
                  {/* Column Header */}
                  <div className={cn("mb-3 rounded-xl overflow-visible", isLastColumn && onAddCustomColumn && "group relative")}>
                    <div
                      className="flex items-center justify-between px-3.5 py-2.5 rounded-xl"
                      style={{ background: `linear-gradient(135deg, ${column.colorFrom}, ${column.colorTo})` }}
                    >
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-white text-sm">{column.title}</h3>
                        {isDecision && column.count > 0 ? (
                          <Badge className="bg-white text-red-600 font-bold text-xs px-1.5 h-5 min-w-5 justify-center animate-pulse">
                            {column.count}
                          </Badge>
                        ) : (
                          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-white/20 text-white text-[11px] font-bold">
                            {column.count}
                          </span>
                        )}
                      </div>
                      <ColumnColorPicker
                        colorFrom={column.colorFrom}
                        colorTo={column.colorTo}
                        onColorChange={(from, to) => handleColorChange(column.id, from, to)}
                        title={column.title}
                        onTitleChange={(t) => handleTitleChange(column.id, t)}
                      />
                    </div>
                    {/* Plus button — right edge of last column header, visible on hover */}
                    {isLastColumn && onAddCustomColumn && (
                      <button
                        type="button"
                        className="absolute right-[-14px] top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-background border border-border shadow-sm hover:bg-muted flex items-center justify-center transition-all opacity-0 group-hover:opacity-100"
                        onClick={() => setAddColOpen(true)}
                      >
                        <Plus className="w-4 h-4 text-muted-foreground" />
                      </button>
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
      <Dialog open={addColOpen} onOpenChange={setAddColOpen}>
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
            <Button variant="outline" onClick={() => setAddColOpen(false)}>Отмена</Button>
            <Button onClick={handleAddColumn} disabled={!newColName.trim()}>Добавить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
