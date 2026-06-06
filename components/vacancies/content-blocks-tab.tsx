"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Loader2, Plus, GripVertical, Pencil, Trash2, ChevronDown, Presentation, TestTube2, ClipboardList, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { useContentBlocks, type ContentBlock, type ContentType } from "@/hooks/use-content-blocks"
import { NotionEditor } from "./notion-editor"
import type { Demo, Lesson } from "@/lib/course-types"

const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  presentation: "Презентация",
  test: "Тест",
  task: "Задание",
}

const CONTENT_TYPE_ICONS: Record<ContentType, React.ReactNode> = {
  presentation: <Presentation className="w-3 h-3" />,
  test: <TestTube2 className="w-3 h-3" />,
  task: <ClipboardList className="w-3 h-3" />,
}

const CONTENT_TYPE_VARIANT: Record<ContentType, "default" | "secondary" | "outline"> = {
  presentation: "secondary",
  test: "outline",
  task: "default",
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

export function ContentBlocksTab({ vacancyId, vacancyTitle }: ContentBlocksTabProps) {
  const { blocks, loading, error, createBlock, updateBlock, deleteBlock, reorder } = useContentBlocks(vacancyId)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creatingType, setCreatingType] = useState<ContentType | null>(null)
  const [newBlockTitle, setNewBlockTitle] = useState("")
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renamingValue, setRenamingValue] = useState("")
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  // Drag-reorder
  const dragIdxRef = useRef<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)

  // Выбор первого блока по умолчанию после загрузки
  useEffect(() => {
    if (!loading && blocks.length > 0 && !selectedId) {
      setSelectedId(blocks[0].id)
    }
    // Если выбранный блок удалён — сбрасываем
    if (selectedId && !blocks.find(b => b.id === selectedId)) {
      setSelectedId(blocks.length > 0 ? blocks[0].id : null)
    }
  }, [blocks, loading, selectedId])

  const selectedBlock = blocks.find(b => b.id === selectedId) ?? null

  // Создание нового блока
  const handleCreateBlock = useCallback(async (type: ContentType) => {
    const title = newBlockTitle.trim() ||
      (type === "presentation" ? "Новая презентация" :
       type === "test" ? "Новый тест" : "Новое задание")
    const block = await createBlock(type, title)
    if (block) {
      setSelectedId(block.id)
      toast.success("Блок создан")
    } else {
      toast.error("Не удалось создать блок")
    }
    setCreatingType(null)
    setNewBlockTitle("")
  }, [createBlock, newBlockTitle])

  // Начать создание: показываем инлайн-форму имени под кнопкой типа
  const startCreating = useCallback((type: ContentType) => {
    setCreatingType(type)
    setNewBlockTitle(
      type === "presentation" ? "Новая презентация" :
      type === "test" ? "Новый тест" : "Новое задание"
    )
  }, [])

  // Переименование
  const startRenaming = useCallback((block: ContentBlock) => {
    setRenamingId(block.id)
    setRenamingValue(block.title)
  }, [])

  const commitRename = useCallback((id: string) => {
    const val = renamingValue.trim()
    if (val) updateBlock(id, { title: val })
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
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault()
    setDragOverIdx(idx)
  }
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
  if (blocks.length === 0 && !creatingType) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
          <Presentation className="w-6 h-6 text-muted-foreground" />
        </div>
        <div>
          <p className="font-medium text-foreground">Блоков контента нет</p>
          <p className="text-sm text-muted-foreground mt-1">Добавьте презентацию, тест или задание</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" className="gap-1.5">
              <Plus className="w-3.5 h-3.5" />
              Добавить блок
              <ChevronDown className="w-3 h-3 ml-0.5 opacity-70" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => startCreating("presentation")} className="gap-2">
              <Presentation className="w-4 h-4" />Презентация
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => startCreating("test")} className="gap-2">
              <TestTube2 className="w-4 h-4" />Тест
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => startCreating("task")} className="gap-2">
              <ClipboardList className="w-4 h-4" />Задание
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {/* Инлайн-форма имени нового блока */}
        {creatingType && (
          <NewBlockForm
            type={creatingType}
            value={newBlockTitle}
            onChange={setNewBlockTitle}
            onCreate={() => handleCreateBlock(creatingType)}
            onCancel={() => { setCreatingType(null); setNewBlockTitle("") }}
          />
        )}
      </div>
    )
  }

  return (
    <div className="flex gap-4 min-h-0" style={{ height: "calc(100vh - 220px)" }}>
      {/* ─── Левая панель — список блоков ─── */}
      <div className="w-60 shrink-0 flex flex-col gap-1 overflow-y-auto pr-1">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground px-1 mb-1">Блоки контента</p>

        {blocks.map((block, idx) => (
          <div
            key={block.id}
            draggable
            onDragStart={() => handleDragStart(idx)}
            onDragOver={(e) => handleDragOver(e, idx)}
            onDrop={(e) => handleDrop(e, idx)}
            onDragEnd={handleDragEnd}
            className={cn(
              "group flex items-center gap-1.5 rounded-lg px-2 py-2 cursor-pointer border transition-all select-none",
              selectedId === block.id
                ? "bg-primary/10 border-primary/30 text-foreground"
                : "border-transparent hover:bg-muted/60",
              dragOverIdx === idx && "border-primary/50 bg-primary/5"
            )}
            onClick={() => setSelectedId(block.id)}
          >
            {/* Drag handle */}
            <GripVertical className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-muted-foreground shrink-0 cursor-grab" />

            {/* Имя или поле переименования */}
            <div className="flex-1 min-w-0">
              {renamingId === block.id ? (
                <Input
                  autoFocus
                  value={renamingValue}
                  onChange={e => setRenamingValue(e.target.value)}
                  onBlur={() => commitRename(block.id)}
                  onKeyDown={e => {
                    if (e.key === "Enter") commitRename(block.id)
                    if (e.key === "Escape") setRenamingId(null)
                  }}
                  className="h-6 text-xs px-1 py-0"
                  onClick={e => e.stopPropagation()}
                />
              ) : (
                <span className="text-xs font-medium truncate block">{block.title}</span>
              )}
            </div>

            {/* Бэдж типа + действия */}
            <div className="flex items-center gap-1 shrink-0">
              <Badge
                variant={CONTENT_TYPE_VARIANT[block.contentType]}
                className="text-[9px] h-4 px-1 gap-0.5 hidden group-hover:hidden sm:flex"
              >
                {CONTENT_TYPE_ICONS[block.contentType]}
                {CONTENT_TYPE_LABELS[block.contentType]}
              </Badge>

              {/* Контекст-меню */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                  <button className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-muted transition-opacity">
                    <ChevronDown className="w-3 h-3 text-muted-foreground" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem className="gap-2 text-xs" onClick={e => { e.stopPropagation(); startRenaming(block) }}>
                    <Pencil className="w-3.5 h-3.5" />Переименовать
                  </DropdownMenuItem>
                  {/* Сменить тип */}
                  <DropdownMenu>
                    <DropdownMenuTrigger className="flex items-center gap-2 text-xs w-full px-2 py-1.5 hover:bg-accent rounded-sm cursor-default">
                      {CONTENT_TYPE_ICONS[block.contentType]}
                      <span className="flex-1 text-left">Тип: {CONTENT_TYPE_LABELS[block.contentType]}</span>
                      <ChevronDown className="w-3 h-3 opacity-50" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      {(["presentation", "test", "task"] as ContentType[]).map(ct => (
                        <DropdownMenuItem
                          key={ct}
                          className="gap-2 text-xs"
                          onClick={e => { e.stopPropagation(); updateBlock(block.id, { contentType: ct }) }}
                        >
                          {CONTENT_TYPE_ICONS[ct]}
                          {CONTENT_TYPE_LABELS[ct]}
                          {block.contentType === ct && <span className="ml-auto text-primary">✓</span>}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <DropdownMenuItem
                    className="gap-2 text-xs text-destructive focus:text-destructive"
                    onClick={e => { e.stopPropagation(); setDeleteConfirmId(block.id) }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />Удалить
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        ))}

        {/* Форма нового блока (инлайн под списком) */}
        {creatingType && (
          <NewBlockForm
            type={creatingType}
            value={newBlockTitle}
            onChange={setNewBlockTitle}
            onCreate={() => handleCreateBlock(creatingType)}
            onCancel={() => { setCreatingType(null); setNewBlockTitle("") }}
          />
        )}

        {/* Кнопка «+ Блок» */}
        {!creatingType && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1.5 text-xs mt-1 justify-start text-muted-foreground hover:text-foreground">
                <Plus className="w-3.5 h-3.5" />
                Добавить блок
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => startCreating("presentation")} className="gap-2 text-xs">
                <Presentation className="w-3.5 h-3.5" />Презентация
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => startCreating("test")} className="gap-2 text-xs">
                <TestTube2 className="w-3.5 h-3.5" />Тест
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => startCreating("task")} className="gap-2 text-xs">
                <ClipboardList className="w-3.5 h-3.5" />Задание
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
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

// ─── Инлайн-форма создания блока ───────────────────────────────────────────

interface NewBlockFormProps {
  type: ContentType
  value: string
  onChange: (v: string) => void
  onCreate: () => void
  onCancel: () => void
}

function NewBlockForm({ type, value, onChange, onCreate, onCancel }: NewBlockFormProps) {
  return (
    <div className="flex flex-col gap-1.5 p-2 border border-primary/30 rounded-lg bg-primary/5 mt-1">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
        Новый блок — {CONTENT_TYPE_LABELS[type]}
      </p>
      <Input
        autoFocus
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Enter") onCreate()
          if (e.key === "Escape") onCancel()
        }}
        placeholder="Название блока"
        className="h-7 text-xs"
      />
      <div className="flex gap-1">
        <Button size="sm" className="h-6 text-xs flex-1" onClick={onCreate}>
          Создать
        </Button>
        <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={onCancel}>
          Отмена
        </Button>
      </div>
    </div>
  )
}
