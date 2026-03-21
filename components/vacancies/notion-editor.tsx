"use client"

import { useState, useRef, useEffect, useCallback, useId } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import {
  GripVertical, Plus, Save, Eye, Sparkles, BookOpen, X, MoreHorizontal, Pencil, ClipboardPaste,
  Copy, Trash2, ArrowUp, ArrowDown,
  Bold, Italic, Underline, Strikethrough, AlignLeft, AlignCenter, AlignRight,
  Heading1, Heading2, Heading3, List as ListIcon, ListOrdered, Link2, Hash, Smile,
  Type, ImageIcon, Video, Music, FileText, Info, MousePointerClick, CheckSquare,
  ChevronLeft, ChevronRight, Mic,
} from "lucide-react"
import { toast } from "sonner"
import type { Demo, Block, BlockType, Lesson } from "@/lib/course-types"
import { VARIABLES, BLOCK_TYPE_META, createBlock } from "@/lib/course-types"

// ─── Types ─────────────────────────────────────────────────────────────────

interface NotionEditorProps {
  demo: Demo
  onBack: () => void
  onUpdate: (demo: Demo) => void
}

// ─── Slash command menu ────────────────────────────────────────────────────

const SLASH_ITEMS = [
  { type: "text" as BlockType, icon: <Type className="w-4 h-4" />, inlineIcon: <Type className="w-3.5 h-3.5" />, label: "Текст", desc: "Обычный абзац" },
  { type: "image" as BlockType, icon: <ImageIcon className="w-4 h-4" />, inlineIcon: <ImageIcon className="w-3.5 h-3.5" />, label: "Фото", desc: "Изображение" },
  { type: "video" as BlockType, icon: <Video className="w-4 h-4" />, inlineIcon: <Video className="w-3.5 h-3.5" />, label: "Видео", desc: "Embed или загрузка" },
  { type: "audio" as BlockType, icon: <Music className="w-4 h-4" />, inlineIcon: <Mic className="w-3.5 h-3.5" />, label: "Аудио", desc: "Аудиофайл" },
  { type: "file" as BlockType, icon: <FileText className="w-4 h-4" />, inlineIcon: <FileText className="w-3.5 h-3.5" />, label: "Файл", desc: "PDF, DOC и др." },
  { type: "info" as BlockType, icon: <Info className="w-4 h-4" />, inlineIcon: <Info className="w-3.5 h-3.5" />, label: "Инфо", desc: "Блок с иконкой" },
  { type: "button" as BlockType, icon: <MousePointerClick className="w-4 h-4" />, inlineIcon: <MousePointerClick className="w-3.5 h-3.5" />, label: "Кнопка", desc: "Кнопка-ссылка" },
  { type: "task" as BlockType, icon: <CheckSquare className="w-4 h-4" />, inlineIcon: <CheckSquare className="w-3.5 h-3.5" />, label: "Задание", desc: "Вопросы кандидату" },
]

// ─── Main component ────────────────────────────────────────────────────────

export function NotionEditor({ demo, onBack, onUpdate }: NotionEditorProps) {
  const [activeLessonId, setActiveLessonId] = useState(demo.lessons[0]?.id || "")
  const [previewMode, setPreviewMode] = useState(false)
  const [previewIdx, setPreviewIdx] = useState(0)
  const [renamingLessonId, setRenamingLessonId] = useState<string | null>(null)
  const [copiedLesson, setCopiedLesson] = useState<Lesson | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "idle">("saved")
  const [dragLessonIdx, setDragLessonIdx] = useState<number | null>(null)
  const [dragOverLessonIdx, setDragOverLessonIdx] = useState<number | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const activeLesson = demo.lessons.find((l) => l.id === activeLessonId)

  // Save helper
  const save = useCallback((lessons: Lesson[]) => {
    setSaveStatus("saving")
    onUpdate({ ...demo, lessons, updatedAt: new Date() })
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setSaveStatus("saved"), 800)
  }, [demo, onUpdate])

  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current) }, [])

  // Lesson ops
  const updateLesson = (lessonId: string, patch: Partial<Lesson>) =>
    save(demo.lessons.map((l) => l.id === lessonId ? { ...l, ...patch } : l))

  const switchLesson = (id: string) => setActiveLessonId(id)

  const addLesson = () => {
    const l: Lesson = { id: `les-${Date.now()}`, emoji: "📝", title: "Новый урок", blocks: [createBlock("text")] }
    save([...demo.lessons, l])
    setActiveLessonId(l.id)
  }

  const duplicateLesson = (idx: number) => {
    const orig = demo.lessons[idx]; const ts = Date.now()
    const copy: Lesson = { ...orig, id: `les-${ts}`, title: `${orig.title} (копия)`, blocks: orig.blocks.map((b) => ({ ...b, id: `${b.id}-c${ts}` })) }
    const nl = [...demo.lessons]; nl.splice(idx + 1, 0, copy)
    save(nl); setActiveLessonId(copy.id); toast.success("Урок дублирован")
  }

  const moveLessonDir = (idx: number, dir: -1 | 1) => {
    const t = idx + dir; if (t < 0 || t >= demo.lessons.length) return
    const nl = [...demo.lessons];[nl[idx], nl[t]] = [nl[t], nl[idx]]; save(nl)
  }

  const pasteLesson = () => {
    if (!copiedLesson) return; const ts = Date.now()
    const pasted: Lesson = { ...copiedLesson, id: `les-${ts}`, title: `${copiedLesson.title} (вставлен)`, blocks: copiedLesson.blocks.map((b) => ({ ...b, id: `${b.id}-p${ts}` })) }
    save([...demo.lessons, pasted]); setActiveLessonId(pasted.id); toast.success("Урок вставлен")
  }

  const deleteLesson = (id: string) => {
    const nl = demo.lessons.filter((l) => l.id !== id)
    save(nl); if (activeLessonId === id) setActiveLessonId(nl[0]?.id || ""); setDeleteConfirmId(null); toast("Урок удалён")
  }

  const dropLesson = (target: number) => {
    if (dragLessonIdx === null || dragLessonIdx === target) return
    const nl = [...demo.lessons]; const [m] = nl.splice(dragLessonIdx, 1); nl.splice(target, 0, m)
    save(nl); setDragLessonIdx(null); setDragOverLessonIdx(null)
  }

  // Block ops
  const updateBlock = (blockId: string, patch: Partial<Block>) => {
    if (!activeLesson) return
    updateLesson(activeLessonId, { blocks: activeLesson.blocks.map((b) => b.id === blockId ? { ...b, ...patch } : b) })
  }

  const insertBlock = (idx: number, type: BlockType) => {
    if (!activeLesson) return
    const nb = [...activeLesson.blocks]; nb.splice(idx, 0, createBlock(type))
    updateLesson(activeLessonId, { blocks: nb })
  }

  const appendBlock = (type: BlockType) => {
    if (!activeLesson) return
    updateLesson(activeLessonId, { blocks: [...activeLesson.blocks, createBlock(type)] })
  }

  const removeBlock = (id: string) => {
    if (!activeLesson) return
    updateLesson(activeLessonId, { blocks: activeLesson.blocks.filter((b) => b.id !== id) })
  }

  const moveBlock = (idx: number, dir: -1 | 1) => {
    if (!activeLesson) return
    const t = idx + dir; if (t < 0 || t >= activeLesson.blocks.length) return
    const nb = [...activeLesson.blocks];[nb[idx], nb[t]] = [nb[t], nb[idx]]
    updateLesson(activeLessonId, { blocks: nb })
  }

  const duplicateBlock = (idx: number) => {
    if (!activeLesson) return
    const orig = activeLesson.blocks[idx]; const ts = Date.now()
    const copy: Block = { ...orig, id: `blk-${ts}-${Math.random().toString(36).slice(2, 5)}`, questions: orig.questions.map((q) => ({ ...q, id: `q-${ts}-${Math.random().toString(36).slice(2, 4)}`, options: [...q.options] })) }
    const nb = [...activeLesson.blocks]; nb.splice(idx + 1, 0, copy)
    updateLesson(activeLessonId, { blocks: nb }); toast.success("Блок дублирован")
  }

  // ─── Preview ─────────────────────────────────────────────────────────────

  if (previewMode) {
    const lesson = demo.lessons[previewIdx]
    if (!lesson) { setPreviewMode(false); return null }
    const pct = ((previewIdx + 1) / demo.lessons.length) * 100
    return (
      <div className="max-w-2xl mx-auto py-6 px-4">
        <div className="flex items-center justify-between mb-4">
          <Button variant="ghost" size="sm" onClick={() => setPreviewMode(false)} className="gap-1.5 text-xs">
            <X className="w-3.5 h-3.5" />Закрыть превью
          </Button>
          <Badge variant="outline" className="text-[10px]">Предпросмотр для кандидата</Badge>
        </div>
        <div className="flex items-center gap-3 mb-5">
          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-xs font-medium text-muted-foreground">{previewIdx + 1} / {demo.lessons.length}</span>
        </div>
        <div className="bg-card rounded-2xl border shadow-sm p-8 sm:p-10">
          <div className="text-center mb-8">
            <span className="text-5xl block mb-3">{lesson.emoji}</span>
            <h1 className="text-2xl font-bold">{lesson.title}</h1>
          </div>
          <div className="space-y-5">
            {lesson.blocks.map((block) => (
              <SimplePreviewBlock key={block.id} block={block} />
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between mt-5">
          <Button variant="outline" disabled={previewIdx === 0} onClick={() => setPreviewIdx(previewIdx - 1)}>
            <ChevronLeft className="w-4 h-4 mr-1" />Назад
          </Button>
          {previewIdx < demo.lessons.length - 1 ? (
            <Button onClick={() => setPreviewIdx(previewIdx + 1)}>
              Далее<ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={() => setPreviewMode(false)}>Завершить ✓</Button>
          )}
        </div>
      </div>
    )
  }

  // ─── Editor layout ────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 180px)" }}>
      {/* Top bar */}
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div>
            <span className="text-xs font-medium">{demo.title}</span>
            <Badge variant="outline" className={cn("ml-2 text-[10px]", demo.status === "published" ? "bg-emerald-500/10 text-emerald-700 border-emerald-200" : "bg-amber-500/10 text-amber-700 border-amber-200")}>
              {demo.status === "published" ? "Опубликована" : "Черновик"}
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={cn("text-[11px] mr-1 transition-colors", saveStatus === "saving" ? "text-amber-500" : "text-muted-foreground/40")}>
            {saveStatus === "saving" ? "Сохранение..." : "✓ Сохранено"}
          </span>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8" onClick={() => { setSaveStatus("saved"); toast.success("Сохранено") }}>
            <Save className="w-3.5 h-3.5" />Сохранить
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8">
            <BookOpen className="w-3.5 h-3.5" />Библиотека
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8">
            <Sparkles className="w-3.5 h-3.5" />AI
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs h-8" onClick={() => { setPreviewIdx(0); setPreviewMode(true) }}>
            <Eye className="w-3.5 h-3.5" />Превью
          </Button>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="flex gap-4 flex-1 min-h-0">

        {/* LEFT — Lesson list */}
        <div className="w-[260px] flex-shrink-0 border border-border rounded-xl bg-card overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border">
            <h4 className="text-sm font-semibold text-foreground">Уроки</h4>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs px-2">
                  <Plus className="w-3 h-3" />Урок
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={addLesson}><Plus className="w-3.5 h-3.5 mr-2" />Новый пустой урок</DropdownMenuItem>
                <DropdownMenuItem disabled={!copiedLesson} onClick={pasteLesson}><ClipboardPaste className="w-3.5 h-3.5 mr-2" />Вставить скопированный</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="flex-1 overflow-y-auto px-1.5 py-1">
            {demo.lessons.map((lesson, i) => {
              const isActive = activeLessonId === lesson.id
              const isRenaming = renamingLessonId === lesson.id
              return (
                <div
                  key={lesson.id}
                  draggable={!isRenaming}
                  onDragStart={() => setDragLessonIdx(i)}
                  onDragOver={(e) => { e.preventDefault(); setDragOverLessonIdx(i) }}
                  onDragEnd={() => { setDragLessonIdx(null); setDragOverLessonIdx(null) }}
                  onDrop={() => dropLesson(i)}
                  onClick={() => { if (!isRenaming) switchLesson(lesson.id) }}
                  className={cn(
                    "flex items-center gap-1.5 pl-1 pr-0.5 py-1.5 rounded-lg cursor-pointer group transition-all text-sm",
                    isActive ? "bg-primary text-primary-foreground" : "hover:bg-muted/60 text-foreground",
                    dragLessonIdx === i && "opacity-30",
                    dragOverLessonIdx === i && dragLessonIdx !== i && "ring-1 ring-primary/50 bg-primary/5"
                  )}
                >
                  <GripVertical className={cn("w-3 h-3 flex-shrink-0 cursor-move", isActive ? "text-primary-foreground/40" : "text-muted-foreground/20 group-hover:text-muted-foreground/50")} />
                  <span className="text-sm flex-shrink-0">{lesson.emoji}</span>
                  {isRenaming ? (
                    <input
                      autoFocus
                      className="flex-1 text-xs font-medium bg-transparent border-b border-primary-foreground/40 outline-none min-w-0"
                      value={lesson.title}
                      onChange={(e) => updateLesson(lesson.id, { title: e.target.value })}
                      onBlur={() => setRenamingLessonId(null)}
                      onKeyDown={(e) => { if (e.key === "Enter") setRenamingLessonId(null) }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <span className="flex-1 truncate text-[12px] font-medium">{lesson.title}</span>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        className={cn(
                          "opacity-0 group-hover:opacity-100 p-0.5 rounded transition-opacity flex-shrink-0",
                          isActive ? "text-primary-foreground/70 hover:bg-primary-foreground/20" : "text-muted-foreground/50 hover:bg-muted"
                        )}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreHorizontal className="w-3.5 h-3.5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setRenamingLessonId(lesson.id) }}>
                        <Pencil className="w-3.5 h-3.5 mr-2" />Переименовать
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setCopiedLesson(lesson); toast.success("Скопировано") }}>
                        <Copy className="w-3.5 h-3.5 mr-2" />Копировать
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); duplicateLesson(i) }}>
                        <Copy className="w-3.5 h-3.5 mr-2" />Дублировать
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); moveLessonDir(i, -1) }} disabled={i === 0}>
                        <ArrowUp className="w-3.5 h-3.5 mr-2" />Переместить вверх
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); moveLessonDir(i, 1) }} disabled={i === demo.lessons.length - 1}>
                        <ArrowDown className="w-3.5 h-3.5 mr-2" />Переместить вниз
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(lesson.id) }} className="text-destructive focus:text-destructive">
                        <Trash2 className="w-3.5 h-3.5 mr-2" />Удалить
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )
            })}
          </div>
        </div>

        {/* RIGHT — Notion-style block editor */}
        <div className="flex-1 min-w-0 overflow-y-auto">
          {activeLesson ? (
            <NotionLessonEditor
              key={activeLessonId}
              lesson={activeLesson}
              onUpdateLesson={(patch) => updateLesson(activeLessonId, patch)}
              onUpdateBlock={updateBlock}
              onInsertBlock={insertBlock}
              onAppendBlock={appendBlock}
              onRemoveBlock={removeBlock}
              onMoveBlock={moveBlock}
              onDuplicateBlock={duplicateBlock}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground/40 text-sm">
              Выберите урок слева
            </div>
          )}
        </div>
      </div>

      {/* Delete confirm dialog */}
      <Dialog open={!!deleteConfirmId} onOpenChange={(open) => { if (!open) setDeleteConfirmId(null) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Удалить урок?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Урок и все его блоки будут удалены. Это нельзя отменить.</p>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" size="sm" onClick={() => setDeleteConfirmId(null)}>Отмена</Button>
            <Button variant="destructive" size="sm" onClick={() => deleteConfirmId && deleteLesson(deleteConfirmId)}>Удалить</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Notion lesson editor (right pane) ─────────────────────────────────────

interface NotionLessonEditorProps {
  lesson: Lesson
  onUpdateLesson: (patch: Partial<Lesson>) => void
  onUpdateBlock: (blockId: string, patch: Partial<Block>) => void
  onInsertBlock: (idx: number, type: BlockType) => void
  onAppendBlock: (type: BlockType) => void
  onRemoveBlock: (id: string) => void
  onMoveBlock: (idx: number, dir: -1 | 1) => void
  onDuplicateBlock: (idx: number) => void
}

function NotionLessonEditor({ lesson, onUpdateLesson, onUpdateBlock, onInsertBlock, onAppendBlock, onRemoveBlock, onMoveBlock, onDuplicateBlock }: NotionLessonEditorProps) {
  const [slashMenu, setSlashMenu] = useState<{ blockIdx: number; x: number; y: number; query: string } | null>(null)
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)
  const [floatingToolbar, setFloatingToolbar] = useState<{ x: number; y: number } | null>(null)
  const [floatingBlockId, setFloatingBlockId] = useState<string | null>(null)
  const editorAreaRef = useRef<HTMLDivElement>(null)

  // Close slash menu on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest("[data-slash-menu]")) setSlashMenu(null)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  // Floating selection toolbar
  useEffect(() => {
    const handler = () => {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || !sel.toString().trim()) {
        setFloatingToolbar(null)
        return
      }
      const range = sel.getRangeAt(0)
      const rect = range.getBoundingClientRect()
      const container = editorAreaRef.current
      if (!container) return
      const cr = container.getBoundingClientRect()
      setFloatingToolbar({ x: rect.left - cr.left + rect.width / 2, y: rect.top - cr.top - 44 })
    }
    document.addEventListener("mouseup", handler)
    document.addEventListener("keyup", handler)
    return () => { document.removeEventListener("mouseup", handler); document.removeEventListener("keyup", handler) }
  }, [])

  const handleDrop = (target: number) => {
    if (dragIdx === null || dragIdx === target) return
    // Reorder by calling move repeatedly — simpler approach: just emit moves
    // We'll handle it via onMoveBlock as a series
    if (dragIdx < target) {
      for (let i = dragIdx; i < target; i++) onMoveBlock(i, 1)
    } else {
      for (let i = dragIdx; i > target; i--) onMoveBlock(i, -1)
    }
    setDragIdx(null); setDragOverIdx(null)
  }

  const execFmt = (cmd: string, value?: string) => {
    document.execCommand(cmd, false, value)
  }

  return (
    <div ref={editorAreaRef} className="relative max-w-3xl mx-auto py-6 px-2">
      {/* Floating toolbar */}
      {floatingToolbar && (
        <div
          className="absolute z-50 flex items-center gap-0.5 bg-popover border border-border rounded-lg shadow-lg px-1.5 py-1 pointer-events-auto"
          style={{ left: floatingToolbar.x, top: floatingToolbar.y, transform: "translateX(-50%)" }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <FmtBtn icon={Bold} tip="Жирный" cmd={() => execFmt("bold")} />
          <FmtBtn icon={Italic} tip="Курсив" cmd={() => execFmt("italic")} />
          <FmtBtn icon={Underline} tip="Подчёркнутый" cmd={() => execFmt("underline")} />
          <FmtBtn icon={Strikethrough} tip="Зачёркнутый" cmd={() => execFmt("strikeThrough")} />
          <div className="w-px h-4 bg-border mx-0.5" />
          <FmtBtn icon={Heading1} tip="Заголовок 1" cmd={() => execFmt("formatBlock", "h1")} />
          <FmtBtn icon={Heading2} tip="Заголовок 2" cmd={() => execFmt("formatBlock", "h2")} />
          <FmtBtn icon={Heading3} tip="Заголовок 3" cmd={() => execFmt("formatBlock", "h3")} />
          <div className="w-px h-4 bg-border mx-0.5" />
          <FmtBtn icon={ListIcon} tip="Маркированный список" cmd={() => execFmt("insertUnorderedList")} />
          <FmtBtn icon={ListOrdered} tip="Нумерованный список" cmd={() => execFmt("insertOrderedList")} />
          <div className="w-px h-4 bg-border mx-0.5" />
          <FmtBtn icon={AlignLeft} tip="Влево" cmd={() => execFmt("justifyLeft")} />
          <FmtBtn icon={AlignCenter} tip="По центру" cmd={() => execFmt("justifyCenter")} />
          <FmtBtn icon={AlignRight} tip="Вправо" cmd={() => execFmt("justifyRight")} />
        </div>
      )}

      {/* Lesson title */}
      <div className="flex items-start gap-3 mb-8 group/title">
        <EmojiBtn current={lesson.emoji} onSelect={(v) => onUpdateLesson({ emoji: v })} />
        <input
          className="flex-1 text-3xl font-bold bg-transparent outline-none text-foreground placeholder:text-muted-foreground/30 leading-tight pt-0.5"
          value={lesson.title}
          onChange={(e) => onUpdateLesson({ title: e.target.value })}
          placeholder="Название урока"
        />
      </div>

      {/* Blocks */}
      <div className="space-y-0">
        {/* Inline bar перед первым блоком */}
        <InlineBetweenBar onAdd={(type) => onInsertBlock(0, type)} />

        {lesson.blocks.map((block, idx) => (
          <div key={block.id}>
            <NotionBlock
              block={block}
              idx={idx}
              totalBlocks={lesson.blocks.length}
              isHovered={hoveredIdx === idx}
              isDragging={dragIdx === idx}
              isDragOver={dragOverIdx === idx && dragIdx !== idx}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
              onDragStart={() => setDragIdx(idx)}
              onDragOver={(e) => { e.preventDefault(); setDragOverIdx(idx) }}
              onDragEnd={() => { setDragIdx(null); setDragOverIdx(null) }}
              onDrop={() => handleDrop(idx)}
              onUpdate={(patch) => onUpdateBlock(block.id, patch)}
              onRemove={() => onRemoveBlock(block.id)}
              onMoveUp={() => onMoveBlock(idx, -1)}
              onMoveDown={() => onMoveBlock(idx, 1)}
              onDuplicate={() => onDuplicateBlock(idx)}
              onInsertBelow={(type) => onInsertBlock(idx + 1, type)}
              onSlashTrigger={(x, y, query) => setSlashMenu({ blockIdx: idx + 1, x, y, query })}
            />
            {/* Inline bar после каждого блока */}
            <InlineBetweenBar onAdd={(type) => onInsertBlock(idx + 1, type)} />
          </div>
        ))}

        {/* Empty state */}
        {lesson.blocks.length === 0 && (
          <div
            className="py-8 px-4 text-sm text-muted-foreground/40 text-center border border-dashed border-border rounded-xl cursor-text"
            onClick={() => onAppendBlock("text")}
          >
            Нажмите для добавления текста или введите / для выбора блока
          </div>
        )}
      </div>

      {/* Slash command menu */}
      {slashMenu && (
        <div
          data-slash-menu
          className="absolute z-50 w-56 bg-popover border border-border rounded-xl shadow-xl overflow-hidden"
          style={{ left: slashMenu.x, top: slashMenu.y }}
        >
          <div className="px-3 py-1.5 border-b border-border">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Тип блока</span>
          </div>
          <div className="p-1">
            {SLASH_ITEMS.filter((item) =>
              !slashMenu.query || item.label.toLowerCase().includes(slashMenu.query.toLowerCase())
            ).map((item) => (
              <button
                key={item.type}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left hover:bg-muted transition-colors group"
                onMouseDown={(e) => {
                  e.preventDefault()
                  onInsertBlock(slashMenu.blockIdx, item.type)
                  setSlashMenu(null)
                }}
              >
                <span className="w-7 h-7 rounded-lg bg-muted group-hover:bg-background flex items-center justify-center text-muted-foreground flex-shrink-0">
                  {item.icon}
                </span>
                <div>
                  <div className="text-sm font-medium text-foreground">{item.label}</div>
                  <div className="text-[11px] text-muted-foreground">{item.desc}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Individual Notion block ───────────────────────────────────────────────

interface NotionBlockProps {
  block: Block
  idx: number
  totalBlocks: number
  isHovered: boolean
  isDragging: boolean
  isDragOver: boolean
  onMouseEnter: () => void
  onMouseLeave: () => void
  onDragStart: () => void
  onDragOver: (e: React.DragEvent) => void
  onDragEnd: () => void
  onDrop: () => void
  onUpdate: (patch: Partial<Block>) => void
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onDuplicate: () => void
  onInsertBelow: (type: BlockType) => void
  onSlashTrigger: (x: number, y: number, query: string) => void
}

function NotionBlock({ block, idx, totalBlocks, isHovered, isDragging, isDragOver, onMouseEnter, onMouseLeave, onDragStart, onDragOver, onDragEnd, onDrop, onUpdate, onRemove, onMoveUp, onMoveDown, onDuplicate, onInsertBelow, onSlashTrigger }: NotionBlockProps) {
  const editorRef = useRef<HTMLDivElement>(null)

  // Set innerHTML when block changes
  useEffect(() => {
    if (editorRef.current && block.type === "text") {
      if (editorRef.current.innerHTML !== block.content) {
        editorRef.current.innerHTML = block.content || ""
      }
    }
  }, [block.id])

  const syncContent = useCallback(() => {
    if (editorRef.current) {
      onUpdate({ content: editorRef.current.innerHTML })
    }
  }, [onUpdate])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "/") {
      // Show slash menu
      const rect = (e.target as HTMLElement).getBoundingClientRect()
      const container = (e.target as HTMLElement).closest("[data-notion-area]")
      const cr = container?.getBoundingClientRect() || { left: 0, top: 0 }
      onSlashTrigger(rect.left - cr.left, rect.bottom - cr.top + 4, "")
    }
    if (e.key === "Enter" && !e.shiftKey && block.type === "text") {
      // Insert new text block below
      e.preventDefault()
      syncContent()
      onInsertBelow("text")
    }
    if (e.key === "Backspace" && block.type === "text" && editorRef.current) {
      const html = editorRef.current.innerHTML
      if (html === "" || html === "<br>") {
        e.preventDefault()
        onRemove()
      }
    }
  }

  return (
    <div
      className={cn(
        "relative group/block flex items-start gap-0",
        isDragging && "opacity-30",
        isDragOver && "ring-1 ring-primary/40 ring-offset-1 rounded-lg"
      )}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDrop={onDrop}
      data-block-id={block.id}
    >
      {/* Block content */}
      <div className="flex-1 min-w-0 py-0.5" data-notion-area>
        {block.type === "text" ? (
          <NotionTextBlock
            block={block}
            editorRef={editorRef}
            onSync={syncContent}
            onUpdate={onUpdate}
            onKeyDown={handleKeyDown}
          />
        ) : (
          <NotionMediaBlock block={block} onUpdate={onUpdate} onRemove={onRemove} />
        )}
      </div>

      {/* Right action bar (appears on hover) */}
      <div className={cn(
        "absolute -right-2 top-1/2 -translate-y-1/2 translate-x-full flex items-center gap-0.5 transition-all duration-100 bg-background border border-border rounded-lg shadow-sm px-0.5 py-0.5 z-10",
        isHovered ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
      )}>
        {/* Копировать */}
        <button
          onClick={onDuplicate}
          title="Дублировать блок"
          className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <Copy className="w-3.5 h-3.5" />
        </button>

        {/* Drag handle */}
        <button
          title="Перетащить"
          className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-grab active:cursor-grabbing"
          onMouseDown={(e) => e.currentTarget.closest<HTMLElement>("[data-block-id]")?.setAttribute("draggable", "true")}
        >
          <GripVertical className="w-3.5 h-3.5" />
        </button>

        {/* Стрелки */}
        <button
          onClick={onMoveUp}
          disabled={idx === 0}
          title="Переместить вверх"
          className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-25 disabled:cursor-not-allowed"
        >
          <ArrowUp className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onMoveDown}
          disabled={idx === totalBlocks - 1}
          title="Переместить вниз"
          className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-25 disabled:cursor-not-allowed"
        >
          <ArrowDown className="w-3.5 h-3.5" />
        </button>

        {/* Разделитель */}
        <div className="w-px h-4 bg-border mx-0.5" />

        {/* Удалить */}
        <button
          onClick={onRemove}
          title="Удалить блок"
          className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

// ─── Text block (Notion-style) ─────────────────────────────────────────────

interface NotionTextBlockProps {
  block: Block
  editorRef: React.RefObject<HTMLDivElement | null>
  onSync: () => void
  onUpdate: (patch: Partial<Block>) => void
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void
}

function NotionTextBlock({ block, editorRef, onSync, onKeyDown }: NotionTextBlockProps) {
  return (
    <div
      ref={editorRef}
      contentEditable
      suppressContentEditableWarning
      data-placeholder="Введите текст или / для команды..."
      className={cn(
        "outline-none min-h-[1.5em] text-[15px] leading-relaxed text-foreground",
        "empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/30",
        "[&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mt-4 [&_h1]:mb-1",
        "[&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mt-3 [&_h2]:mb-1",
        "[&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mt-2",
        "[&_ul]:list-disc [&_ul]:ml-5 [&_ul]:space-y-0.5",
        "[&_ol]:list-decimal [&_ol]:ml-5 [&_ol]:space-y-0.5",
        "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2",
        "[&_strong]:font-semibold [&_em]:italic",
        "w-full px-1 py-0.5 rounded hover:bg-muted/20 focus:bg-transparent transition-colors"
      )}
      onBlur={onSync}
      onInput={onSync}
      onKeyDown={onKeyDown}
    />
  )
}

// ─── Media / other block types (simplified) ────────────────────────────────

function NotionMediaBlock({ block, onUpdate, onRemove }: { block: Block; onUpdate: (patch: Partial<Block>) => void; onRemove: () => void }) {
  const meta = BLOCK_TYPE_META.find((m) => m.type === block.type)

  switch (block.type) {
    case "image":
      return (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <ImageIcon className="w-4 h-4" /><span>Изображение</span>
          </div>
          {block.imageUrl ? (
            <div className="relative group/img">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={block.imageUrl} alt={block.imageCaption || ""} className="rounded-lg max-h-64 object-cover w-full" />
              <button onClick={() => onUpdate({ imageUrl: "" })} className="absolute top-2 right-2 bg-black/50 text-white rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover/img:opacity-100"><X className="w-3.5 h-3.5" /></button>
            </div>
          ) : (
            <MediaUrlInput placeholder="URL изображения (https://...)" value={block.imageUrl} onSave={(url) => onUpdate({ imageUrl: url })} />
          )}
          {block.imageUrl && (
            <input className="w-full text-xs text-muted-foreground bg-transparent outline-none border-b border-border/50 pb-0.5" value={block.imageCaption} onChange={(e) => onUpdate({ imageCaption: e.target.value })} placeholder="Подпись..." />
          )}
        </div>
      )

    case "video":
      return (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Video className="w-4 h-4" /><span>Видео</span>
          </div>
          {block.videoUrl ? (
            <div className="relative">
              <div className="aspect-video rounded-lg bg-black flex items-center justify-center">
                <span className="text-white/60 text-sm">▶ {block.videoUrl}</span>
              </div>
              <button onClick={() => onUpdate({ videoUrl: "" })} className="absolute top-2 right-2 bg-black/50 text-white rounded-full w-6 h-6 flex items-center justify-center"><X className="w-3.5 h-3.5" /></button>
            </div>
          ) : (
            <MediaUrlInput placeholder="YouTube / Vimeo / прямой URL видео" value={block.videoUrl} onSave={(url) => onUpdate({ videoUrl: url })} />
          )}
        </div>
      )

    case "audio":
      return (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <Music className="w-4 h-4" /><span>Аудио</span>
          </div>
          <Input placeholder="Название аудио" value={block.audioTitle} onChange={(e) => onUpdate({ audioTitle: e.target.value })} className="text-sm" />
          <MediaUrlInput placeholder="URL аудиофайла" value={block.audioUrl} onSave={(url) => onUpdate({ audioUrl: url })} />
        </div>
      )

    case "file":
      return (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <FileText className="w-4 h-4" /><span>Файл</span>
          </div>
          <Input placeholder="Название файла" value={block.fileName} onChange={(e) => onUpdate({ fileName: e.target.value })} className="text-sm" />
          <MediaUrlInput placeholder="URL файла (PDF, DOC...)" value={block.fileUrl} onSave={(url) => onUpdate({ fileUrl: url })} />
        </div>
      )

    case "info":
      return (
        <div className={cn(
          "rounded-xl border-l-4 p-4",
          block.infoStyle === "info" ? "bg-blue-50 dark:bg-blue-950/30 border-blue-400" :
            block.infoStyle === "warning" ? "bg-amber-50 dark:bg-amber-950/30 border-amber-400" :
              block.infoStyle === "success" ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-400" :
                "bg-red-50 dark:bg-red-950/30 border-red-400"
        )}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-base">{block.infoStyle === "info" ? "ℹ️" : block.infoStyle === "warning" ? "⚠️" : block.infoStyle === "success" ? "✅" : "❌"}</span>
            <div className="flex gap-1">
              {(["info", "warning", "success", "error"] as const).map((s) => (
                <button key={s} onClick={() => onUpdate({ infoStyle: s })} className={cn("w-4 h-4 rounded-full border-2", s === "info" ? "bg-blue-400" : s === "warning" ? "bg-amber-400" : s === "success" ? "bg-emerald-400" : "bg-red-400", block.infoStyle === s ? "border-foreground/60" : "border-transparent")} />
              ))}
            </div>
          </div>
          <textarea
            className="w-full text-sm bg-transparent outline-none resize-none min-h-[60px] leading-relaxed"
            value={block.content}
            onChange={(e) => onUpdate({ content: e.target.value })}
            placeholder="Текст блока..."
          />
        </div>
      )

    case "button":
      return (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <MousePointerClick className="w-4 h-4" /><span>Кнопка</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Текст кнопки" value={block.buttonText} onChange={(e) => onUpdate({ buttonText: e.target.value })} className="text-sm" />
            <Input placeholder="https://..." value={block.buttonUrl} onChange={(e) => onUpdate({ buttonUrl: e.target.value })} className="text-sm" />
          </div>
          <div className="flex items-center gap-2">
            <Button variant={block.buttonVariant === "primary" ? "default" : "outline"} size="sm" className="text-xs" onClick={() => onUpdate({ buttonVariant: "primary" })}>Основная</Button>
            <Button variant={block.buttonVariant === "outline" ? "default" : "outline"} size="sm" className="text-xs" onClick={() => onUpdate({ buttonVariant: "outline" })}>Контурная</Button>
            <div className="ml-auto">
              <Button variant={block.buttonVariant === "primary" ? "default" : "outline"} size="sm">{block.buttonText || "Кнопка"}</Button>
            </div>
          </div>
        </div>
      )

    case "task":
      return (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <CheckSquare className="w-4 h-4" /><span>Задание и вопросы</span>
          </div>
          <textarea
            className="w-full text-sm bg-background border border-border rounded-lg p-2 outline-none resize-none min-h-[60px]"
            value={block.taskDescription}
            onChange={(e) => onUpdate({ taskDescription: e.target.value })}
            placeholder="Описание задания..."
          />
          <div className="space-y-2">
            {block.questions.map((q, qi) => (
              <div key={q.id} className="flex items-center gap-2 p-2 bg-background rounded-lg border border-border">
                <span className="text-xs font-bold text-muted-foreground w-5">{qi + 1}.</span>
                <input
                  className="flex-1 text-sm bg-transparent outline-none"
                  value={q.text}
                  onChange={(e) => {
                    const nq = [...block.questions]; nq[qi] = { ...nq[qi], text: e.target.value }; onUpdate({ questions: nq })
                  }}
                  placeholder="Вопрос кандидату..."
                />
                <button
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => onUpdate({ questions: block.questions.filter((_, j) => j !== qi) })}
                ><X className="w-3.5 h-3.5" /></button>
              </div>
            ))}
            <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => {
              const nq = [...block.questions, { id: `q-${Date.now()}`, text: "", answerType: "text" as const, options: [], correctOptions: [], textMatchMode: "ai" as const, correctText: "", aiCriteria: "", weight: 1 }]
              onUpdate({ questions: nq })
            }}>
              <Plus className="w-3 h-3 mr-1" />Добавить вопрос
            </Button>
          </div>
        </div>
      )

    default:
      return (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground flex items-center gap-2">
          <span>{meta?.icon}</span><span>{meta?.label || "Блок"}</span>
        </div>
      )
  }
}

// ─── Inline between bar ────────────────────────────────────────────────────

function InlineBetweenBar({ onAdd }: { onAdd: (type: BlockType) => void }) {
  const [visible, setVisible] = useState(false)

  return (
    <div
      className="relative flex items-center group/between h-6 my-0.5"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {/* Линия */}
      <div className={cn(
        "absolute inset-x-0 top-1/2 -translate-y-1/2 h-px transition-colors duration-100",
        visible ? "bg-primary/30" : "bg-transparent group-hover/between:bg-border/60"
      )} />

      {/* Иконки по центру */}
      <div className={cn(
        "absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2",
        "flex items-center gap-0.5 bg-background border border-border rounded-lg shadow-sm px-1 py-0.5",
        "transition-all duration-100",
        visible ? "opacity-100 scale-100 pointer-events-auto" : "opacity-0 scale-95 pointer-events-none"
      )}>
        {SLASH_ITEMS.map((item) => (
          <button
            key={item.type}
            title={item.label}
            onClick={() => onAdd(item.type)}
            className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            {item.inlineIcon}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Formatting button ─────────────────────────────────────────────────────

function FmtBtn({ icon: Icon, tip, cmd }: { icon: React.ElementType; tip: string; cmd: () => void }) {
  return (
    <button
      className="w-7 h-7 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      title={tip}
      onMouseDown={(e) => { e.preventDefault(); cmd() }}
    >
      <Icon className="w-3.5 h-3.5" />
    </button>
  )
}

// ─── Emoji button ──────────────────────────────────────────────────────────

const QUICK_EMOJIS = ["👋","🚀","🏢","💰","📈","✅","🎯","⚙️","👤","📍","🎥","📝","➡️","🌟","💡","📋","🔑","💬","🏆","🎓"]

function EmojiBtn({ current, onSelect }: { current: string; onSelect: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button className="text-4xl leading-none hover:opacity-70 transition-opacity flex-shrink-0 cursor-pointer" title="Сменить эмодзи">
          {current || "📝"}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="p-2 w-48">
        <div className="flex flex-wrap gap-1">
          {QUICK_EMOJIS.map((e) => (
            <button key={e} className="w-8 h-8 text-lg flex items-center justify-center rounded hover:bg-muted transition-colors" onClick={() => { onSelect(e); setOpen(false) }}>{e}</button>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ─── Media URL input ───────────────────────────────────────────────────────

function MediaUrlInput({ placeholder, value, onSave }: { placeholder: string; value: string; onSave: (url: string) => void }) {
  const [draft, setDraft] = useState(value)
  return (
    <div className="flex gap-2">
      <Input
        className="text-sm flex-1"
        placeholder={placeholder}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") onSave(draft) }}
      />
      <Button size="sm" variant="outline" className="text-xs" onClick={() => onSave(draft)}>OK</Button>
    </div>
  )
}

// ─── Preview block (candidate view) ───────────────────────────────────────

function SimplePreviewBlock({ block }: { block: Block }) {
  switch (block.type) {
    case "text":
      return <div className="prose prose-sm max-w-none dark:prose-invert" dangerouslySetInnerHTML={{ __html: block.content || "" }} />
    case "image":
      return block.imageUrl ? (
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={block.imageUrl} alt={block.imageCaption || ""} className="rounded-xl w-full max-h-64 object-cover" />
          {block.imageCaption && <p className="text-xs text-muted-foreground text-center mt-1">{block.imageCaption}</p>}
        </div>
      ) : null
    case "video":
      return block.videoUrl ? (
        <div className="aspect-video rounded-xl bg-muted flex items-center justify-center">
          <span className="text-muted-foreground text-sm">▶ Видео</span>
        </div>
      ) : null
    case "info":
      return (
        <div className={cn("rounded-xl border-l-4 p-4", block.infoStyle === "info" ? "bg-blue-50 border-blue-400" : block.infoStyle === "warning" ? "bg-amber-50 border-amber-400" : block.infoStyle === "success" ? "bg-emerald-50 border-emerald-400" : "bg-red-50 border-red-400")}>
          <p className="text-sm whitespace-pre-line">{block.content}</p>
        </div>
      )
    case "button":
      return (
        <div className="flex justify-center">
          <Button variant={block.buttonVariant === "primary" ? "default" : "outline"} size="sm">
            {block.buttonText || "Кнопка"}
          </Button>
        </div>
      )
    case "task":
      return (
        <div className="rounded-xl border border-border p-4 space-y-3">
          <p className="text-sm font-medium">{block.taskDescription}</p>
          {block.questions.map((q, i) => (
            <div key={q.id} className="space-y-1">
              <p className="text-sm text-muted-foreground">{i + 1}. {q.text}</p>
              <div className="h-9 border border-border rounded-lg bg-muted/20 text-xs flex items-center px-3 text-muted-foreground/50">Ответ кандидата...</div>
            </div>
          ))}
        </div>
      )
    default:
      return null
  }
}
