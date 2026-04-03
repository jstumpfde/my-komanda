"use client"

import { CandidateCard, type Candidate } from "./candidate-card"
import { ListView } from "./list-view"
import { FunnelView } from "./funnel-view"
import { TilesView } from "./tiles-view"
import { ColumnColorPicker } from "./column-color-picker"
import type { CardDisplaySettings } from "./card-settings"
import { LayoutGrid, List, TrendingDown, Grid3X3 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
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
}

const VIEW_BUTTONS: { mode: ViewMode; icon: React.ElementType; label: string }[] = [
  { mode: "funnel", icon: TrendingDown, label: "Воронка" },
  { mode: "list", icon: List, label: "Список" },
  { mode: "kanban", icon: LayoutGrid, label: "Канбан" },
  { mode: "tiles", icon: Grid3X3, label: "Плитки" },
]

export function KanbanBoard({ settings, viewMode, onViewModeChange, columns = [], onColumnsChange, onOpenProfile, onAction, hideViewSwitcher }: KanbanBoardProps) {
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
        <div className="overflow-x-auto pb-4 -mx-4 px-4 sm:mx-0 sm:px-0 snap-x snap-mandatory md:snap-none">
          <div className="flex gap-3">
            {columns.map((column) => {
              const isDecision = HR_DECISION_COLUMNS.includes(column.id)

              return (
                <div
                  key={column.id}
                  className="flex flex-col flex-1 min-w-[180px] rounded-xl snap-start"
                >
                  {/* Column Header */}
                  <div className="mb-3 rounded-xl overflow-hidden">
                    <div
                      className="flex items-center justify-between px-3.5 py-2.5"
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
