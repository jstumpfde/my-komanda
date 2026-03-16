"use client"

import { useState } from "react"
import { CandidateCard, type Candidate } from "./candidate-card"
import { ListView } from "./list-view"
import { FunnelView } from "./funnel-view"
import { ColumnColorPicker } from "./column-color-picker"
import type { CardDisplaySettings } from "./card-settings"
import { LayoutGrid, List, TrendingDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { CandidateAction } from "@/lib/column-config"

export type ViewMode = "kanban" | "list" | "funnel"

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
}

const VIEW_BUTTONS: { mode: ViewMode; icon: React.ElementType; label: string }[] = [
  { mode: "funnel", icon: TrendingDown, label: "Воронка" },
  { mode: "list", icon: List, label: "Список" },
  { mode: "kanban", icon: LayoutGrid, label: "Канбан" },
]

interface DragState {
  candidateId: string
  fromColumnId: string
}

export function KanbanBoard({ settings, viewMode, onViewModeChange, columns, onColumnsChange, onOpenProfile, onAction }: KanbanBoardProps) {
  const [dragState, setDragState] = useState<DragState | null>(null)
  const [dropTargetColumnId, setDropTargetColumnId] = useState<string | null>(null)

  const handleColorChange = (colId: string, from: string, to: string) => {
    onColumnsChange(
      columns.map((col) => (col.id === colId ? { ...col, colorFrom: from, colorTo: to } : col))
    )
  }

  const handleDragStart = (candidateId: string, fromColumnId: string) => {
    setDragState({ candidateId, fromColumnId })
  }

  const handleDragEnd = () => {
    setDragState(null)
    setDropTargetColumnId(null)
  }

  const handleColumnDragOver = (e: React.DragEvent, columnId: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
    if (dropTargetColumnId !== columnId) {
      setDropTargetColumnId(columnId)
    }
  }

  const handleColumnDragLeave = (e: React.DragEvent, columnId: string) => {
    const relatedTarget = e.relatedTarget as HTMLElement | null
    const currentTarget = e.currentTarget as HTMLElement
    if (!relatedTarget || !currentTarget.contains(relatedTarget)) {
      if (dropTargetColumnId === columnId) {
        setDropTargetColumnId(null)
      }
    }
  }

  const handleColumnDrop = (e: React.DragEvent, toColumnId: string) => {
    e.preventDefault()
    if (!dragState || dragState.fromColumnId === toColumnId) {
      handleDragEnd()
      return
    }

    const { candidateId, fromColumnId } = dragState
    const sourceColumn = columns.find((c) => c.id === fromColumnId)
    const candidate = sourceColumn?.candidates.find((c) => c.id === candidateId)
    if (!candidate) {
      handleDragEnd()
      return
    }

    const newColumns = columns.map((col) => {
      if (col.id === fromColumnId) {
        const newCandidates = col.candidates.filter((c) => c.id !== candidateId)
        return { ...col, candidates: newCandidates, count: newCandidates.length }
      }
      if (col.id === toColumnId) {
        const newCandidates = [...col.candidates, candidate]
        return { ...col, candidates: newCandidates, count: newCandidates.length }
      }
      return col
    })

    onColumnsChange(newColumns)
    handleDragEnd()
  }

  return (
    <div>
      {/* View mode switcher */}
      <div className="flex items-center gap-2 mb-5">
        <div className="flex items-center bg-muted rounded-lg p-1 gap-0.5">
          {VIEW_BUTTONS.map(({ mode, icon: Icon, label }) => (
            <Button
              key={mode}
              variant={viewMode === mode ? "default" : "ghost"}
              size="sm"
              className={cn(
                "h-7 px-3 text-xs gap-1.5 transition-all",
                viewMode === mode
                  ? "shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
              onClick={() => onViewModeChange(mode)}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </Button>
          ))}
        </div>
      </div>

      {/* Kanban View */}
      {viewMode === "kanban" && (
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-4 min-w-min">
            {columns.map((column) => {
              const isDropTarget = dropTargetColumnId === column.id && dragState && dragState.fromColumnId !== column.id

              return (
                <div
                  key={column.id}
                  className={cn(
                    "flex flex-col w-80 flex-shrink-0 rounded-xl transition-all duration-200",
                    isDropTarget && "ring-2 ring-primary/50 bg-primary/5"
                  )}
                  onDragOver={(e) => handleColumnDragOver(e, column.id)}
                  onDragLeave={(e) => handleColumnDragLeave(e, column.id)}
                  onDrop={(e) => handleColumnDrop(e, column.id)}
                >
                  {/* Column Header — gradient */}
                  <div className="mb-3 rounded-xl overflow-hidden">
                    <div
                      className="flex items-center justify-between px-3.5 py-2.5"
                      style={{ background: `linear-gradient(135deg, ${column.colorFrom}, ${column.colorTo})` }}
                    >
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-white text-sm">{column.title}</h3>
                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-white/20 text-white text-[11px] font-bold">
                          {column.count}
                        </span>
                      </div>
                      <ColumnColorPicker
                        colorFrom={column.colorFrom}
                        colorTo={column.colorTo}
                        onColorChange={(from, to) => handleColorChange(column.id, from, to)}
                      />
                    </div>
                  </div>

                  {/* Cards */}
                  <div className={cn(
                    "space-y-3 flex-1 min-h-[100px] rounded-lg p-1 transition-colors duration-200",
                    isDropTarget && "bg-primary/5"
                  )}>
                    {column.candidates.map((candidate) => (
                      <CandidateCard
                        key={candidate.id}
                        candidate={candidate}
                        settings={settings}
                        columnId={column.id}
                        isDragging={dragState?.candidateId === candidate.id}
                        onDragStart={handleDragStart}
                        onDragEnd={handleDragEnd}
                        onOpenProfile={(c) => onOpenProfile?.(c, column.id)}
                        onAction={onAction}
                      />
                    ))}
                    {column.candidates.length === 0 && (
                      <div className={cn(
                        "flex items-center justify-center h-20 rounded-lg border-2 border-dashed transition-colors duration-200",
                        isDropTarget
                          ? "border-primary/50 text-primary/70"
                          : "border-border/50 text-muted-foreground/40"
                      )}>
                        <span className="text-xs">Перетащите сюда</span>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* List View */}
      {viewMode === "list" && (
        <ListView columns={columns} settings={settings} onOpenProfile={onOpenProfile} onAction={onAction} />
      )}

      {/* Funnel View */}
      {viewMode === "funnel" && (
        <FunnelView columns={columns} />
      )}
    </div>
  )
}
