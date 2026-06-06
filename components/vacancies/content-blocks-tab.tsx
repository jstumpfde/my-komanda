"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Loader2, Plus, GripVertical, Pencil, Trash2, Sparkles, FileText, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { useContentBlocks, type ContentBlock } from "@/hooks/use-content-blocks"
import { NotionEditor } from "./notion-editor"
import type { Demo, Lesson } from "@/lib/course-types"

/** Блок «оценивается ИИ», если внутри есть формы: вопросы (task) или запись медиа от кандидата (media). */
function blockHasScoredContent(lessons: Lesson[]): boolean {
  return lessons.some(l => Array.isArray(l.blocks) && l.blocks.some(b => b.type === "task" || b.type === "media"))
}

function blockToDemo(block: ContentBlock): Demo {
  return {
    id: block.id,
    title: block.title,
    companyName: "",
    description: "",
    status: block.status,
    createdAt: new Date(block.createdAt),
    updatedAt: new Date(block.updatedAt),
    coverGradientFrom: "#6366f1",
    coverGradientTo: "#8b5cf6",
    lessons: block.lessons,
  }
}

interface ContentBlocksTabProps {
  vacancyId: string
  vacancyTitle?: string | null
}

export function ContentBlocksTab({ vacancyId }: ContentBlocksTabProps) {
  const { blocks, loading, error, createBlock, updateBlock, deleteBlock, reorder } = useContentBlocks(vacancyId)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renamingValue, setRenamingValue] = useState("")
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  // Drag-reorder
  const dragIdxRef = useRef<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)

  // Выбор первого блока после загрузки / сброс при удалении выбранного
  useEffect(() => {
    if (!loading && blocks.length > 0 && !selectedId) {
      setSelectedId(blocks[0].id)
    }
    if (selectedId && !blocks.find(b => b.id === selectedId)) {
      setSelectedId(blocks.length > 0 ? blocks[0].id : null)
    }
  }, [blocks, loading, selectedId])

  const selectedBlock = blocks.find(b => b.id === selectedId) ?? null

  // Создать блок и сразу открыть инлайн-ввод имени (тип не выбираем — свободный контент)
  const handleAddBlock = useCallback(async () => {
    setCreating(true)
    const block = await createBlock("presentation", "Новый блок")
    setCreating(false)
    if (block) {
      setSelectedId(block.id)
      setRenamingId(block.id)
      setRenamingValue("Новый блок")
    } else {
      toast.error("Не удалось создать блок")
    }
  }, [createBlock])

  const startRenaming = useCallback((block: ContentBlock) => {
    setRenamingId(block.id)
    setRenamingValue(block.title)
  }, [])

  const commitRename = useCallback((id: string) => {
    const val = renamingValue.trim()
    updateBlock(id, { title: val || "Новый блок" })
    setRenamingId(null)
  }, [renamingValue, updateBlock])

  // Обновление контента из NotionEditor
  const handleEditorUpdate = useCallback((updated: Demo) => {
    if (!selectedBlock) return
    updateBlock(selectedBlock.id, {
      lessons: updated.lessons,
      title: updated.title !== selectedBlock.title ? updated.title : undefined,
    })
  }, [selectedBlock, updateBlock])

  // Drag-and-drop reorder
  const handleDragStart = (idx: number) => { dragIdxRef.current = idx }
  const handleDragOver = (e: React.DragEvent, idx: number) => { e.preventDefault(); setDragOverIdx(idx) }
  const handleDrop = async (e: React.DragEvent, idx: number) => {
    e.preventDefault()
    const fromIdx = dragIdxRef.current
    if (fromIdx === null || fromIdx === idx) { setDragOverIdx(null); return }
    const newOrder = [...blocks]
    const [moved] = newOrder.splice(fromIdx, 1)
    newOrder.splice(idx, 0, moved)
    setDragOverIdx(null)
    dragIdxRef.current = null
    await reorder(newOrder.map(b => b.id))
  }
  const handleDragEnd = () => { dragIdxRef.current = null; setDragOverIdx(null) }

  // --- Render ---

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Загрузка...
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-20 text-destructive gap-2">
        <AlertCircle className="w-5 h-5" />
        {error}
      </div>
    )
  }

  // Пустое состояние
  if (blocks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
          <FileText className="w-6 h-6 text-muted-foreground" />
        </div>
        <div>
          <p className="font-medium text-foreground">Блоков контента нет</p>
          <p className="text-sm text-muted-foreground mt-1">Создайте блок и наполните его чем угодно — текст, видео, вопросы, задание</p>
        </div>
        <Button size="sm" className="gap-1.5" disabled={creating} onClick={handleAddBlock}>
          {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          Добавить блок
        </Button>
      </div>
    )
  }

  return (
    <div className="flex gap-4 min-h-0" style={{ height: "calc(100vh - 220px)" }}>
      {/* ─── Левая панель — список блоков ─── */}
      <div className="w-64 shrink-0 self-start max-h-full flex flex-col border border-border rounded-xl bg-card overflow-hidden">
        <div className="px-3 py-2.5 border-b border-border">
          <h4 className="text-sm font-semibold text-foreground">Блоки контента</h4>
          <p className="text-[11px] text-muted-foreground mt-0.5">По порядку показа кандидату</p>
        </div>

        <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
          {blocks.map((block, idx) => {
            const isActive = selectedId === block.id
            const isRenaming = renamingId === block.id
            const scored = blockHasScoredContent(block.lessons)
            return (
              <div
                key={block.id}
                draggable={!isRenaming}
                onDragStart={() => handleDragStart(idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDrop={(e) => handleDrop(e, idx)}
                onDragEnd={handleDragEnd}
                onClick={() => { if (!isRenaming) setSelectedId(block.id) }}
                className={cn(
                  "group flex items-center gap-1.5 rounded-lg pl-1 pr-1.5 py-2 cursor-pointer transition-colors select-none",
                  isActive ? "bg-primary text-primary-foreground" : "hover:bg-muted/60 text-foreground",
                  dragOverIdx === idx && dragIdxRef.current !== idx && "ring-2 ring-primary/40"
                )}
              >
                <GripVertical className={cn(
                  "w-3.5 h-3.5 shrink-0 cursor-grab active:cursor-grabbing",
                  isActive ? "text-primary-foreground/40" : "text-muted-foreground/30 group-hover:text-muted-foreground/60"
                )} />

                {isRenaming ? (
                  <input
                    autoFocus
                    value={renamingValue}
                    onChange={(e) => setRenamingValue(e.target.value)}
                    onFocus={(e) => e.currentTarget.select()}
                    onBlur={() => commitRename(block.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); commitRename(block.id) }
                      if (e.key === "Escape") setRenamingId(null)
                    }}
                    onClick={(e) => e.stopPropagation()}
                    placeholder="Название блока…"
                    className="flex-1 min-w-0 text-xs font-medium bg-transparent border-b border-primary-foreground/40 outline-none placeholder:opacity-50"
                  />
                ) : (
                  <span
                    className="flex-1 min-w-0 truncate text-xs font-medium"
                    onDoubleClick={(e) => { e.stopPropagation(); startRenaming(block) }}
                  >{block.title}</span>
                )}

                {/* Авто-метка «ИИ-оценка» — если внутри есть вопросы/задание/запись */}
                {scored && !isRenaming && (
                  <Badge
                    variant={isActive ? "secondary" : "outline"}
                    className="text-[9px] h-4 px-1 gap-0.5 shrink-0 group-hover:hidden"
                    title="Содержит формы (вопросы/задание/запись) — оценивает ИИ"
                  >
                    <Sparkles className="w-2.5 h-2.5" />ИИ
                  </Badge>
                )}

                {/* Действия — на ховере */}
                {!isRenaming && (
                  <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
                    <button
                      title="Переименовать"
                      onClick={(e) => { e.stopPropagation(); startRenaming(block) }}
                      className={cn("p-0.5 rounded hover:bg-black/10", isActive && "hover:bg-white/20")}
                    ><Pencil className="w-3.5 h-3.5" /></button>
                    <button
                      title="Удалить"
                      onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(block.id) }}
                      className={cn("p-0.5 rounded hover:bg-black/10", isActive ? "hover:bg-white/20" : "text-muted-foreground hover:text-destructive")}
                    ><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Добавить блок — снизу */}
        <button
          type="button"
          disabled={creating}
          onClick={handleAddBlock}
          className="w-full border-t border-dashed border-border px-2 py-2.5 flex items-center justify-center gap-1.5 text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors text-xs"
        >
          {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
          Блок
        </button>
      </div>

      {/* ─── Правая панель — редактор выбранного блока ─── */}
      <div className="flex-1 min-w-0 overflow-hidden">
        {selectedBlock ? (
          <NotionEditor
            key={selectedBlock.id}
            demo={blockToDemo(selectedBlock)}
            onBack={() => {}}
            onUpdate={handleEditorUpdate}
            hideToolbar={false}
            showSidebar={true}
            vacancyId={vacancyId}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            Выберите блок слева
          </div>
        )}
      </div>

      {/* Диалог подтверждения удаления */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={open => { if (!open) setDeleteConfirmId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить блок?</AlertDialogTitle>
            <AlertDialogDescription>
              Блок и весь его контент будут удалены. Это действие нельзя отменить.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!deleteConfirmId) return
                const ok = await deleteBlock(deleteConfirmId)
                setDeleteConfirmId(null)
                if (ok) toast.success("Блок удалён")
                else toast.error("Не удалось удалить блок")
              }}
            >
              Удалить
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
