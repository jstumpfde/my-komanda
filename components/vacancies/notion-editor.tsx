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
  ChevronLeft, ChevronRight, Mic, Highlighter,
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
  { type: "text" as BlockType, icon: <Type className="w-4 h-4" />, inlineIcon: <Type className="w-[17px] h-[17px]" />, label: "Текст", desc: "Обычный абзац" },
  { type: "image" as BlockType, icon: <ImageIcon className="w-4 h-4" />, inlineIcon: <ImageIcon className="w-[17px] h-[17px]" />, label: "Фото", desc: "Изображение" },
  { type: "video" as BlockType, icon: <Video className="w-4 h-4" />, inlineIcon: <Video className="w-[17px] h-[17px]" />, label: "Видео", desc: "Embed или загрузка" },
  { type: "audio" as BlockType, icon: <Music className="w-4 h-4" />, inlineIcon: <Mic className="w-[17px] h-[17px]" />, label: "Аудио", desc: "Аудиофайл" },
  { type: "file" as BlockType, icon: <FileText className="w-4 h-4" />, inlineIcon: <FileText className="w-[17px] h-[17px]" />, label: "Файл", desc: "PDF, DOC и др." },
  { type: "info" as BlockType, icon: <Info className="w-4 h-4" />, inlineIcon: <Info className="w-[17px] h-[17px]" />, label: "Инфо", desc: "Блок с иконкой" },
  { type: "button" as BlockType, icon: <MousePointerClick className="w-4 h-4" />, inlineIcon: <MousePointerClick className="w-[17px] h-[17px]" />, label: "Кнопка", desc: "Кнопка-ссылка" },
  { type: "task" as BlockType, icon: <CheckSquare className="w-4 h-4" />, inlineIcon: <CheckSquare className="w-[17px] h-[17px]" />, label: "Задание", desc: "Вопросы кандидату" },
]

// ─── Main component ────────────────────────────────────────────────────────

export function NotionEditor({ demo, onBack, onUpdate }: NotionEditorProps) {
  const [activeLessonId, setActiveLessonId] = useState(demo.lessons[0]?.id || "")
  const [previewMode, setPreviewMode] = useState(false)
  const [previewIdx, setPreviewIdx] = useState(0)
  const [renamingLessonId, setRenamingLessonId] = useState<string | null>(null)
  const [copiedLesson, setCopiedLesson] = useState<Lesson | null>(null)
  const [contextMenuLessonId, setContextMenuLessonId] = useState<string | null>(null)
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
                <DropdownMenu
                  key={lesson.id}
                  open={contextMenuLessonId === lesson.id}
                  onOpenChange={(v) => { if (!v) setContextMenuLessonId(null) }}
                >
                  <div
                    draggable={!isRenaming}
                    onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; setDragLessonIdx(i) }}
                    onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDragOverLessonIdx(i) }}
                    onDragEnd={() => { setDragLessonIdx(null); setDragOverLessonIdx(null) }}
                    onDrop={(e) => { e.preventDefault(); dropLesson(i) }}
                    onClick={() => { if (!isRenaming) switchLesson(lesson.id) }}
                    onContextMenu={(e) => { e.preventDefault(); setContextMenuLessonId(lesson.id) }}
                    className={cn(
                      "flex items-center gap-1.5 pl-1 pr-2 py-1.5 rounded-lg cursor-pointer group transition-all text-sm select-none",
                      isActive ? "bg-primary text-primary-foreground" : "hover:bg-muted/60 text-foreground",
                      dragLessonIdx === i && "opacity-30",
                      dragOverLessonIdx === i && dragLessonIdx !== i && "ring-2 ring-primary/50 bg-primary/5"
                    )}
                  >
                    <GripVertical className={cn("w-3 h-3 flex-shrink-0 cursor-grab active:cursor-grabbing", isActive ? "text-primary-foreground/40" : "text-muted-foreground/30 group-hover:text-muted-foreground/60")} />
                    <span className="text-xl flex-shrink-0 leading-none">{lesson.emoji}</span>
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
                  </div>
                  <DropdownMenuTrigger className="sr-only" />
                  <DropdownMenuContent align="start" className="w-44">
                    <DropdownMenuItem onClick={() => { setContextMenuLessonId(null); setRenamingLessonId(lesson.id) }}>
                      <Pencil className="w-3.5 h-3.5 mr-2" />Переименовать
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => { setContextMenuLessonId(null); setCopiedLesson(lesson); toast.success("Скопировано") }}>
                      <Copy className="w-3.5 h-3.5 mr-2" />Копировать
                    </DropdownMenuItem>
                    <DropdownMenuItem disabled={!copiedLesson} onClick={() => { setContextMenuLessonId(null); pasteLesson() }}>
                      <ClipboardPaste className="w-3.5 h-3.5 mr-2" />Вставить
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => { setContextMenuLessonId(null); duplicateLesson(i) }}>
                      <Copy className="w-3.5 h-3.5 mr-2" />Дублировать
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => { setContextMenuLessonId(null); moveLessonDir(i, -1) }} disabled={i === 0}>
                      <ArrowUp className="w-3.5 h-3.5 mr-2" />Переместить вверх
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => { setContextMenuLessonId(null); moveLessonDir(i, 1) }} disabled={i === demo.lessons.length - 1}>
                      <ArrowDown className="w-3.5 h-3.5 mr-2" />Переместить вниз
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => { setContextMenuLessonId(null); setDeleteConfirmId(lesson.id) }} className="text-destructive focus:text-destructive">
                      <Trash2 className="w-3.5 h-3.5 mr-2" />Удалить
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
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
  const [slashMenu, setSlashMenu] = useState<{ blockIdx: number; x: number; y: number; yTop: number; upward: boolean; query: string } | null>(null)
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)
  const [floatingToolbar, setFloatingToolbar] = useState<{ x: number; y: number } | null>(null)
  const [floatingBlockId, setFloatingBlockId] = useState<string | null>(null)
  const [floatingInInfoBlock, setFloatingInInfoBlock] = useState(false)
  const [showForeColors, setShowForeColors] = useState(false)
  const [showBgColors, setShowBgColors] = useState(false)
  const [currentTextColor, setCurrentTextColor] = useState("#000000")
  const editorAreaRef = useRef<HTMLDivElement>(null)

  const FORE_COLORS = ["#000000", "#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#8b5cf6", "#6b7280"]
  const BG_COLORS = ["#fde047", "#fb923c", "#f87171", "#86efac", "#93c5fd", "#c4b5fd", "#f9a8d4", "transparent"]

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
      const anchorEl = sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode?.parentElement
      setFloatingInInfoBlock(!!anchorEl?.closest("[data-main-editor]"))
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
    if (cmd === "foreColor" && value) setCurrentTextColor(value)
    setShowForeColors(false)
    setShowBgColors(false)
  }

  const toggleBlock = (tag: string) => {
    try {
      const cur = document.queryCommandValue("formatBlock").toLowerCase()
      execFmt("formatBlock", cur === tag ? "p" : tag)
    } catch {
      execFmt("formatBlock", tag)
    }
  }

  const currentBlock = () => {
    try { return document.queryCommandValue("formatBlock").toLowerCase() } catch { return "" }
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
          {/* Foreground color */}
          <div className="relative">
            <button
              className="w-7 h-7 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="Цвет текста"
              onMouseDown={(e) => { e.preventDefault(); setShowForeColors(v => !v); setShowBgColors(false) }}
            >
              <span className="flex flex-col items-center leading-none">
                <span className="text-sm font-bold">A</span>
                <span style={{ height: "3px", width: "14px", background: currentTextColor, borderRadius: "1px", marginTop: "1px" }} />
              </span>
            </button>
            {showForeColors && (
              <div className="absolute bottom-full mb-1 left-0 z-50 bg-popover border border-border rounded-lg shadow-lg p-1.5 flex gap-1" onMouseDown={e => e.preventDefault()}>
                {FORE_COLORS.map(c => (
                  <button key={c} onMouseDown={(e) => { e.preventDefault(); execFmt("foreColor", c) }}
                    className="w-5 h-5 rounded-full border border-border shadow-sm hover:scale-110 transition-transform"
                    style={{ background: c }} title={c} />
                ))}
              </div>
            )}
          </div>
          {/* Background color */}
          <div className="relative">
            <button
              className="w-7 h-7 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              title="Цвет фона"
              onMouseDown={(e) => { e.preventDefault(); setShowBgColors(v => !v); setShowForeColors(false) }}
            >
              <Highlighter className="w-3.5 h-3.5" />
            </button>
            {showBgColors && (
              <div className="absolute bottom-full mb-1 left-0 z-50 bg-popover border border-border rounded-lg shadow-lg p-1.5 flex gap-1" onMouseDown={e => e.preventDefault()}>
                {BG_COLORS.map(c => (
                  <button key={c} onMouseDown={(e) => { e.preventDefault(); execFmt("hiliteColor", c) }}
                    className="w-5 h-5 rounded-full border border-border shadow-sm hover:scale-110 transition-transform"
                    style={{ background: c === "transparent" ? "repeating-conic-gradient(#ccc 0% 25%, white 0% 50%) 0 0 / 8px 8px" : c }}
                    title={c === "transparent" ? "Без фона" : c} />
                ))}
              </div>
            )}
          </div>
          {!floatingInInfoBlock && <>
            <div className="w-px h-4 bg-border mx-0.5" />
            <button className={cn("w-7 h-7 rounded flex items-center justify-center transition-colors", currentBlock() === "h1" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted")} title="Заголовок 1" onMouseDown={(e) => { e.preventDefault(); toggleBlock("h1") }}><Heading1 className="w-3.5 h-3.5" /></button>
            <button className={cn("w-7 h-7 rounded flex items-center justify-center transition-colors", currentBlock() === "h2" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted")} title="Заголовок 2" onMouseDown={(e) => { e.preventDefault(); toggleBlock("h2") }}><Heading2 className="w-3.5 h-3.5" /></button>
            <button className={cn("w-7 h-7 rounded flex items-center justify-center transition-colors", currentBlock() === "h3" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted")} title="Заголовок 3" onMouseDown={(e) => { e.preventDefault(); toggleBlock("h3") }}><Heading3 className="w-3.5 h-3.5" /></button>
            <div className="w-px h-4 bg-border mx-0.5" />
            <FmtBtn icon={ListIcon} tip="Маркированный список" cmd={() => execFmt("insertUnorderedList")} />
            <FmtBtn icon={ListOrdered} tip="Нумерованный список" cmd={() => execFmt("insertOrderedList")} />
          </>}
          <div className="w-px h-4 bg-border mx-0.5" />
          <FmtBtn icon={AlignLeft} tip="Влево" cmd={() => execFmt("justifyLeft")} />
          <FmtBtn icon={AlignCenter} tip="По центру" cmd={() => execFmt("justifyCenter")} />
          <FmtBtn icon={AlignRight} tip="Вправо" cmd={() => execFmt("justifyRight")} />
        </div>
      )}

      {/* Lesson title */}
      <div className="flex items-center gap-3 mb-8 group/title">
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
              onSlashTrigger={(x, y, yTop, upward, query) => setSlashMenu({ blockIdx: idx + 1, x, y, yTop, upward, query })}
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
          style={slashMenu.upward
            ? { left: slashMenu.x, top: slashMenu.yTop, transform: "translateY(-100%)" }
            : { left: slashMenu.x, top: slashMenu.y }}
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
  onSlashTrigger: (x: number, y: number, yTop: number, upward: boolean, query: string) => void
}

function NotionBlock({ block, idx, totalBlocks, isHovered, isDragging, isDragOver, onMouseEnter, onMouseLeave, onDragStart, onDragOver, onDragEnd, onDrop, onUpdate, onRemove, onMoveUp, onMoveDown, onDuplicate, onInsertBelow, onSlashTrigger }: NotionBlockProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const mouseDownPos = useRef<{ x: number; y: number } | null>(null)
  const isDragStarted = useRef(false)


  // Set innerHTML when block changes
  useEffect(() => {
    if (editorRef.current && block.type === "text") {
      if (editorRef.current.innerHTML !== block.content) {
        editorRef.current.innerHTML = block.content || ""
      }
    }
  }, [block.id])

  const syncContent = useCallback(() => {
    if (editorRef.current && block.type === "text") {
      onUpdate({ content: editorRef.current.innerHTML })
    }
  }, [onUpdate, block.type])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "/") {
      // Show slash menu
      const rect = (e.target as HTMLElement).getBoundingClientRect()
      const container = (e.target as HTMLElement).closest("[data-notion-area]")
      const cr = container?.getBoundingClientRect() || { left: 0, top: 0 }
      const spaceBelow = window.innerHeight - rect.bottom
      const upward = spaceBelow < 300
      const yBottom = rect.bottom - cr.top + 4   // distance from container top to bottom of trigger
      const yTop = rect.top - cr.top - 4          // distance from container top to top of trigger
      onSlashTrigger(rect.left - cr.left, yBottom, yTop, upward, "")
    }
    if (e.key === "Enter" && block.type === "text") {
      e.preventDefault()
      if (e.shiftKey) {
        // Shift+Enter — абзацный отступ (двойной br)
        document.execCommand("insertHTML", false, "<br><br>")
      } else {
        // Enter — мягкий перенос строки
        document.execCommand("insertHTML", false, "<br>")
      }
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
        "relative group/block",
        isDragging && "opacity-30",
        isDragOver && "ring-1 ring-primary/40 ring-offset-1 rounded-lg"
      )}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onMouseDown={(e) => {
        // Track mousedown position to distinguish click/select from drag
        mouseDownPos.current = { x: e.clientX, y: e.clientY }
        isDragStarted.current = false
      }}
      onDragOver={(e) => {
        // Only handle dragOver if a real HTML drag is happening (isDragStarted)
        if (isDragStarted.current) onDragOver(e)
        else e.stopPropagation()
      }}
      onDrop={onDrop}
      data-block-id={block.id}
    >
      {/* Action bar — горизонтальная, вверху справа, внутри блока, при наведении */}
      <div className={cn(
        "flex items-center gap-0.5 mb-0.5 ml-auto",
        "bg-background/95 backdrop-blur-sm border border-border rounded-md shadow-sm px-0.5 py-0.5 w-fit",
        "transition-all duration-100",
        isHovered ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
      )}>
        <button
          onClick={onDuplicate}
          title="Дублировать блок"
          className="w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <Copy className="w-3 h-3" />
        </button>
        <button
          title="Перетащить"
          className="w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-grab active:cursor-grabbing"
          draggable
          onDragStart={() => { isDragStarted.current = true; onDragStart() }}
          onDragEnd={() => { isDragStarted.current = false; onDragEnd() }}
        >
          <GripVertical className="w-3 h-3" />
        </button>
        <button
          onClick={onMoveUp}
          disabled={idx === 0}
          title="Вверх"
          className="w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-25 disabled:cursor-not-allowed"
        >
          <ArrowUp className="w-3 h-3" />
        </button>
        <button
          onClick={onMoveDown}
          disabled={idx === totalBlocks - 1}
          title="Вниз"
          className="w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-25 disabled:cursor-not-allowed"
        >
          <ArrowDown className="w-3 h-3" />
        </button>
        <div className="w-px h-3 bg-border mx-0.5" />
        <button
          onClick={onRemove}
          title="Удалить блок"
          className="w-5 h-5 rounded flex items-center justify-center text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-colors"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>

      {/* Block content */}
      <div className="min-w-0" data-notion-area>
        {block.type === "text" ? (
          <NotionTextBlock
            block={block}
            editorRef={editorRef}
            isHovered={isHovered}
            onSync={syncContent}
            onUpdate={onUpdate}
            onKeyDown={handleKeyDown}
          />
        ) : (
          <NotionMediaBlock block={block} onUpdate={onUpdate} onRemove={onRemove} />
        )}
      </div>
    </div>
  )
}

// ─── Emoji & tag insertion helpers ────────────────────────────────────────

// ─── LessonIconPicker: жёсткие массивы по категориям ──────────────────────
const QUICK = ["📝","✅","📊","💡","🎯","💼","🏆","🔑","⚠️"]
const CATEGORIES: Record<string, string[]> = {
  "😊 Смайлы": ["😀","😊","😄","😁","😆","😅","🤣","😂","🙂","🙃","😉","😌","😍","🥰","😎","🤗","🤔","🧐","🤓","😏","😒","🙄","😬","😔","😪","😷","🤒","🤕","🥺","😢","😭","😤","😠","😡","🤬","😈","💀","😺","😸","😻","😾","🫠","😵","🤯","🥳"],
  "✅ Символы": ["✅","❌","⚠️","ℹ️","❓","❗","🔴","🟡","🟢","🔵","⭐","🌟","💫","✨","🏆","🥇","🥈","🥉","🎯","💡","🔑","🔒","🔓","🛡","💎","🎁","🏅","📍","🔖","🏷️","🔗","🔔","➕","➖","✖️","➗","♾️","🔼","🔽","▶️","⏸️","⏹️","⏺️","🔃","🔀"],
  "👋 Жесты": ["👋","✋","🖐️","🖖","👌","✌️","🤞","👍","👎","✊","👊","👏","🙌","🫶","🤝","🙏","💪","👆","👇","👈","👉","☝️","🤜","🤛","💅","✍️","👀","🧠","👤","👥","🫂","🤲","👐","🤳","🦾","🫵","🤌","🤏","🤟","🤘","🤙","❤️","💙","💚","💛"],
  "💼 Работа": ["💼","📝","📊","📈","📉","💰","💳","🏦","🤝","📌","📎","✂️","📅","📋","📁","💡","🔑","🖥️","💻","⌨️","📱","☎️","📞","📠","📤","📥","📦","📧","✏️","🖊️","📓","📒","📕","📗","📘","📙","📚","📖","🗓️","📇","🗄️","🏢","🏭","🗂️","🔐"],
  "👤 Люди": ["👶","👦","👧","🧑","👨","👩","👴","👵","👮","💂","👷","🤴","👸","🧙","🦸","🦹","👼","🎅","🥷","💆","💇","🧖","🏋️","🧘","🏊","🚴","🤸","🙏","🧠","🕵️","🧑‍💼","🧑‍🎓","🧑‍🏫","🧑‍⚕️","🧑‍🍳","🧑‍🔬","🧑‍🎨","🧑‍✈️","🧑‍🚀","🧑‍🚒","🧑‍⚖️","🧑‍🌾","🧑‍🔧","🧑‍🏭"],
  "🚀 Транспорт": ["🚀","🛸","✈️","🚁","🚢","🚂","🚄","🚇","🚌","🏎️","🚗","🚕","🛻","🚚","🚲","🛵","🏍️","🛴","⛵","🚤","🛥️","🚑","🚒","🚓","🚐","⛽","🚧","⚓","🗺️","🧭","🏔️","🌋","🏕️","🏖️","🏜️","🏝️","🏟️","🏛️","🏗️","🛩️","💺","🛶","🛹","🚦","🚥"],
  "🌸 Природа": ["🌸","🌺","🌻","🌹","🌷","💐","🌿","🍀","🌱","🌲","🌴","🌵","🍃","🍂","🍁","🌾","🍄","🌊","🌙","☀️","🌈","❄️","🔥","⚡","🌍","🌎","🌏","🐱","🐶","🦊","🐻","🐼","🦁","🐯","🐧","🦋","🐝","🦄","🦅","🐠","🦀","🐙","🐳","🐬","🦒"],
  "⚽ Спорт": ["⚽","🏓","🎾","🏀","🏈","⚾","🎱","🏐","🏉","🥏","🏸","🏒","🏑","🥍","🏏","🪃","🥅","⛳","🪁","🏹","🎣","🤿","🥊","🥋","🎽","🛹","🛷","⛸️","🥌","🎿","⛷️","🏂","🪂","🏋️","🤸","🤼","🤺","🏇","🏊","🚴","🧘","🏄","🚣","🤽","🧗","🏌️","🎯","🎳","🏆","🥇","🥈","🥉"],
}

const QUICK_TAGS = [
  { tag: "{{имя}}", label: "Имя кандидата" },
  { tag: "{{отчество}}", label: "Отчество кандидата" },
  { tag: "{{фамилия}}", label: "Фамилия кандидата" },
  { tag: "{{должность}}", label: "Должность" },
  { tag: "{{компания}}", label: "Компания" },
  { tag: "{{город}}", label: "Город" },
  { tag: "{{дата}}", label: "Дата" },
]

function insertAtCursor(editorRef: React.RefObject<HTMLDivElement | null>, text: string, onSync: () => void) {
  const el = editorRef.current
  if (!el) return
  el.focus()
  const sel = window.getSelection()
  if (sel && sel.rangeCount > 0) {
    const range = sel.getRangeAt(0)
    range.deleteContents()
    const node = document.createTextNode(text)
    range.insertNode(node)
    range.setStartAfter(node)
    range.setEndAfter(node)
    sel.removeAllRanges()
    sel.addRange(range)
  } else {
    document.execCommand("insertText", false, text)
  }
  onSync()
}

// ─── Text block (Notion-style) ─────────────────────────────────────────────

interface NotionTextBlockProps {
  block: Block
  editorRef: React.RefObject<HTMLDivElement | null>
  isHovered: boolean
  onSync: () => void
  onUpdate: (patch: Partial<Block>) => void
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void
}

function NotionTextBlock({ block, editorRef, isHovered, onSync, onKeyDown }: NotionTextBlockProps) {
  const [showEmoji, setShowEmoji] = useState(false)
  const [showTags, setShowTags] = useState(false)
  const [tagsOpenUpward, setTagsOpenUpward] = useState(false)
  const [emojiPos, setEmojiPos] = useState<React.CSSProperties>({})
  const emojiBtnRef = useRef<HTMLButtonElement>(null)
  const tagsBtnRef = useRef<HTMLButtonElement>(null)
  const emojiSearchRef = useRef<HTMLInputElement>(null)
  const savedRangeRef = useRef<Range | null>(null)

  // Save selection before popup opens (so we don't lose cursor)
  const saveSelection = () => {
    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0) {
      savedRangeRef.current = sel.getRangeAt(0).cloneRange()
    }
  }

  // Restore saved selection before inserting
  const restoreSelectionAndInsert = (text: string) => {
    const el = editorRef.current
    if (!el) return
    el.focus()
    if (savedRangeRef.current) {
      const sel = window.getSelection()
      if (sel) {
        sel.removeAllRanges()
        sel.addRange(savedRangeRef.current)
      }
    }
    insertAtCursor(editorRef, text, onSync)
    setShowEmoji(false)
    setShowTags(false)
  }

  // Close popups on outside click
  useEffect(() => {
    if (!showEmoji && !showTags) return
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest("[data-text-popup]")) {
        setShowEmoji(false)
        setShowTags(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [showEmoji, showTags])

  return (
    <div className="relative group/textblock">
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        data-placeholder="Введите текст или / для команды..."
        className={cn(
          "outline-none min-h-[1.5em] text-base leading-relaxed text-foreground",
          "empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/30",
          "[&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mt-4 [&_h1]:mb-2",
          "[&_h2]:text-xl [&_h2]:font-bold [&_h2]:mt-3 [&_h2]:mb-1",
          "[&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mt-2 [&_h3]:mb-1",
          "[&_p]:text-base [&_p]:leading-relaxed",
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

      {/* Emoji & tag buttons — bottom-right, on hover */}
      <div className={cn(
        "absolute bottom-0.5 right-0 flex items-center gap-0.5 z-10",
        "transition-opacity duration-100",
        isHovered || showEmoji || showTags ? "opacity-100" : "opacity-0 pointer-events-none"
      )}>
        {/* Emoji button */}
        <div className="relative" data-text-popup>
          <button
            ref={emojiBtnRef}
            onMouseDown={(e) => {
              e.preventDefault()
              saveSelection()
              setShowTags(false)
              if (!showEmoji && emojiBtnRef.current) {
                const rect = emojiBtnRef.current.getBoundingClientRect()
                const spaceBelow = window.innerHeight - rect.bottom - 8
                const spaceAbove = rect.top - 8
                if (spaceBelow >= 300 || spaceBelow >= spaceAbove) {
                  setEmojiPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
                } else {
                  setEmojiPos({ bottom: window.innerHeight - rect.top + 4, right: window.innerWidth - rect.right })
                }
              }
              setShowEmoji((v) => !v)
            }}
            title="Вставить эмодзи"
            className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors text-sm"
          >
            😊
          </button>
          <InlineEmojiPicker
            isOpen={showEmoji}
            positionStyle={emojiPos}
            searchRef={emojiSearchRef}
            onSelect={(e) => { restoreSelectionAndInsert(e); setShowEmoji(false) }}
          />
        </div>

        {/* Tag button */}
        <div className="relative" data-text-popup>
          <button
            ref={tagsBtnRef}
            onMouseDown={(e) => {
              e.preventDefault()
              saveSelection()
              setShowEmoji(false)
              if (!showTags && tagsBtnRef.current) {
                const rect = tagsBtnRef.current.getBoundingClientRect()
                setTagsOpenUpward(window.innerHeight - rect.bottom < 300)
              }
              setShowTags((v) => !v)
            }}
            title="Вставить переменную"
            className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors text-xs font-bold"
          >
            #
          </button>
          {showTags && (
            <div
              data-text-popup
              className={cn(
                "absolute right-0 z-50 bg-popover border border-border rounded-xl shadow-xl overflow-hidden w-52",
                tagsOpenUpward ? "bottom-full mb-1" : "top-full mt-1"
              )}
            >
              <div className="px-3 py-1.5 border-b border-border">
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Переменные</span>
              </div>
              <div className="p-1">
                {QUICK_TAGS.map((t) => (
                  <button
                    key={t.tag}
                    onMouseDown={(ev) => { ev.preventDefault(); restoreSelectionAndInsert(t.tag) }}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left hover:bg-muted transition-colors"
                  >
                    <span className="font-mono text-[11px] text-primary bg-primary/10 rounded px-1 py-0.5 shrink-0">{t.tag}</span>
                    <span className="text-xs text-muted-foreground truncate">{t.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Video embed helper ────────────────────────────────────────────────────

function detectVideoService(url: string): { service: string; embedUrl: string } | null {
  if (!url) return null
  // YouTube
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/)
  if (yt) return { service: "YouTube", embedUrl: `https://www.youtube.com/embed/${yt[1]}?rel=0` }
  // RuTube
  const rt = url.match(/rutube\.ru\/video\/([a-f0-9]+)/)
  if (rt) return { service: "RuTube", embedUrl: `https://rutube.ru/play/embed/${rt[1]}` }
  // VK video
  const vk = url.match(/vk\.com\/video(-?\d+_\d+)/)
  if (vk) return { service: "VK", embedUrl: `https://vk.com/video_ext.php?oid=${vk[1].split("_")[0]}&id=${vk[1].split("_")[1]}&hd=2` }
  // VK clip
  const vkc = url.match(/vk\.com\/clip(-?\d+_\d+)/)
  if (vkc) return { service: "VK", embedUrl: `https://vk.com/video_ext.php?oid=${vkc[1].split("_")[0]}&id=${vkc[1].split("_")[1]}&hd=2` }
  return null
}

// ─── Layout picker ─────────────────────────────────────────────────────────

const LAYOUTS = [
  { value: "full", label: "Во всю ширину", icon: "▬" },
  { value: "image-left", label: "Слева", icon: "◧" },
  { value: "image-right", label: "Справа", icon: "◨" },
] as const

function LayoutPicker({ value, onChange, prefix = "image" }: {
  value: string
  onChange: (v: string) => void
  prefix?: string
}) {
  const items = LAYOUTS.map(l => ({ ...l, value: l.value.replace("image", prefix) }))
  return (
    <div className="flex gap-1.5 items-center">
      <span className="text-xs text-muted-foreground shrink-0">Расположение:</span>
      {items.map(l => (
        <button
          key={l.value}
          title={l.label}
          onClick={() => onChange(l.value)}
          className={cn(
            "flex items-center gap-1 px-2 py-1 rounded-md border text-xs font-mono transition-colors",
            value === l.value
              ? "border-primary bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
          )}
        >
          <span className="text-base leading-none">{l.icon}</span>
        </button>
      ))}
    </div>
  )
}

// ─── Mini rich-text editor (captions & side text) ─────────────────────────

const MINI_FORE = ["#000000","#ef4444","#f97316","#eab308","#22c55e","#3b82f6","#8b5cf6","#6b7280"]
const MINI_BG   = ["#fde047","#fb923c","#f87171","#86efac","#93c5fd","#c4b5fd","#f9a8d4","transparent"]

interface MiniRichEditorProps {
  html: string
  onChange: (html: string) => void
  placeholder?: string
  /** single-line: blocks Enter, enforces maxLength on plain text */
  singleLine?: boolean
  maxLength?: number
  /** max-height for scrollable multi-line mode */
  maxHeight?: number
  className?: string
}

function MiniRichEditor({ html, onChange, placeholder, singleLine, maxLength, maxHeight, className }: MiniRichEditorProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [toolbar, setToolbar] = useState<{ x: number; y: number; upward: boolean } | null>(null)
  const [showFore, setShowFore] = useState(false)
  const [showBg,   setShowBg]   = useState(false)
  const [fgColor,  setFgColor]  = useState("#000000")
  const [showMiniEmoji, setShowMiniEmoji] = useState(false)
  const [miniEmojiPos, setMiniEmojiPos] = useState<React.CSSProperties>({})
  const miniEmojiSearchRef = useRef<HTMLInputElement>(null)
  const miniEmojiBtnRef = useRef<HTMLButtonElement>(null)
  const savedRangeMiniRef = useRef<Range | null>(null)

  // Keep DOM in sync when html prop changes from outside (initial load / undo)
  const lastHtmlRef = useRef(html)
  useEffect(() => {
    if (ref.current && html !== lastHtmlRef.current && ref.current.innerHTML !== html) {
      ref.current.innerHTML = html
      lastHtmlRef.current = html
    }
  }, [html])

  useEffect(() => {
    if (!showMiniEmoji) return
    const handler = (e: MouseEvent) => {
      if (miniEmojiBtnRef.current?.contains(e.target as Node)) return
      setShowMiniEmoji(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [showMiniEmoji])

  const exec = (cmd: string, val?: string) => {
    ref.current?.focus()
    document.execCommand(cmd, false, val)
    if (cmd === "foreColor" && val) setFgColor(val)
    setShowFore(false); setShowBg(false)
  }

  const sync = () => {
    if (!ref.current) return
    const next = ref.current.innerHTML
    lastHtmlRef.current = next
    onChange(next)
  }

  const handleSelChange = () => {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || !sel.toString().trim() || !ref.current) {
      setToolbar(null); return
    }
    // Only show toolbar when selection is inside our editor
    if (!ref.current.contains(sel.anchorNode)) { setToolbar(null); return }
    const range = sel.getRangeAt(0)
    const rr = range.getBoundingClientRect()
    const cr = ref.current.getBoundingClientRect()
    const upward = (rr.top - cr.top) > 44
    setToolbar({ x: rr.left - cr.left + rr.width / 2, y: upward ? rr.top - cr.top - 44 : rr.bottom - cr.top + 6, upward })
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (singleLine && e.key === "Enter") { e.preventDefault(); return }
    if (maxLength && !singleLine) {
      // Allow control keys
      if (e.ctrlKey || e.metaKey || e.key.length > 1) return
      const text = ref.current?.innerText || ""
      if (text.length >= maxLength) e.preventDefault()
    }
  }

  const handleInput = () => {
    if (singleLine && maxLength && ref.current) {
      // Strip newlines in single-line mode
      const text = ref.current.innerText.replace(/\n/g, "")
      if ((ref.current.innerText.length > maxLength) || ref.current.innerText.includes("\n")) {
        // Clamp: truncate to maxLength characters by restoring truncated value
        const clamped = text.slice(0, maxLength)
        ref.current.innerText = clamped
        // Move cursor to end
        const sel = window.getSelection()
        const range = document.createRange()
        if (ref.current.childNodes.length > 0) {
          const lastNode = ref.current.childNodes[ref.current.childNodes.length - 1]
          range.setStartAfter(lastNode)
        } else {
          range.setStart(ref.current, 0)
        }
        range.collapse(true)
        sel?.removeAllRanges()
        sel?.addRange(range)
      }
    }
    sync()
  }

  const wrapperCls = cn(
    "relative text-xs text-muted-foreground italic",
    "outline-none min-h-[1.2em]",
    "empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/30 empty:before:not-italic",
    "border-b border-border/40 pb-0.5 focus:border-primary/40",
    "[&_strong]:font-semibold [&_em]:italic [&_u]:underline [&_s]:line-through",
    // Multi-line only: headings and paragraph styles
    !singleLine && "[&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mt-4 [&_h1]:mb-2",
    !singleLine && "[&_h2]:text-xl [&_h2]:font-bold [&_h2]:mt-3 [&_h2]:mb-1",
    !singleLine && "[&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mt-2 [&_h3]:mb-1",
    !singleLine && "[&_p]:text-base [&_p]:leading-relaxed",
    // Single-line: force heading tags back to caption size
    singleLine && "[&_h1]:text-xs [&_h1]:font-normal [&_h1]:m-0 [&_h2]:text-xs [&_h2]:font-normal [&_h2]:m-0 [&_h3]:text-xs [&_h3]:font-normal [&_h3]:m-0",
    className
  )

  // For single-line captions: lock font size and weight so execCommand can't make them huge
  const inlineStyle: React.CSSProperties = singleLine
    ? { fontSize: "12px", fontWeight: "normal", ...(maxHeight ? { maxHeight, overflowY: "auto" } : {}) }
    : (maxHeight ? { maxHeight, overflowY: "auto" } : {})

  return (
    <div className="relative">
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder || ""}
        className={wrapperCls}
        style={inlineStyle}
        onBlur={sync}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onMouseUp={handleSelChange}
        onKeyUp={handleSelChange}
      />
      {toolbar && (
        <div
          className="absolute z-50 flex items-center gap-0.5 bg-popover border border-border rounded-lg shadow-lg px-1.5 py-1 pointer-events-auto"
          style={{ left: toolbar.x, top: toolbar.y, transform: "translateX(-50%)" }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <button className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" title="Жирный" onMouseDown={(e) => { e.preventDefault(); exec("bold") }}><Bold className="w-3 h-3" /></button>
          <button className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" title="Курсив" onMouseDown={(e) => { e.preventDefault(); exec("italic") }}><Italic className="w-3 h-3" /></button>
          <button className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" title="Подчёркнутый" onMouseDown={(e) => { e.preventDefault(); exec("underline") }}><Underline className="w-3 h-3" /></button>
          <button className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" title="Зачёркнутый" onMouseDown={(e) => { e.preventDefault(); exec("strikeThrough") }}><Strikethrough className="w-3 h-3" /></button>
          <div className="w-px h-3.5 bg-border mx-0.5" />
          {/* Foreground */}
          <div className="relative">
            <button className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" title="Цвет текста"
              onMouseDown={(e) => { e.preventDefault(); setShowFore(v => !v); setShowBg(false) }}>
              <span className="flex flex-col items-center leading-none">
                <span className="text-[11px] font-bold">A</span>
                <span style={{ height: "2px", width: "12px", background: fgColor, borderRadius: "1px", marginTop: "1px" }} />
              </span>
            </button>
            {showFore && (
              <div className={cn("absolute z-50 bg-popover border border-border rounded-lg shadow-lg p-1.5 flex gap-1", toolbar.upward ? "top-full mt-1" : "bottom-full mb-1")} onMouseDown={e => e.preventDefault()}>
                {MINI_FORE.map(c => <button key={c} onMouseDown={(e) => { e.preventDefault(); exec("foreColor", c) }} className="w-4 h-4 rounded-full border border-border hover:scale-110 transition-transform" style={{ background: c }} />)}
              </div>
            )}
          </div>
          {/* Background */}
          <div className="relative">
            <button className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" title="Цвет фона"
              onMouseDown={(e) => { e.preventDefault(); setShowBg(v => !v); setShowFore(false) }}>
              <Highlighter className="w-3 h-3" />
            </button>
            {showBg && (
              <div className={cn("absolute z-50 bg-popover border border-border rounded-lg shadow-lg p-1.5 flex gap-1", toolbar.upward ? "top-full mt-1" : "bottom-full mb-1")} onMouseDown={e => e.preventDefault()}>
                {MINI_BG.map(c => <button key={c} onMouseDown={(e) => { e.preventDefault(); exec("hiliteColor", c) }} className="w-4 h-4 rounded-full border border-border hover:scale-110 transition-transform" style={{ background: c === "transparent" ? "repeating-conic-gradient(#ccc 0% 25%, white 0% 50%) 0 0 / 6px 6px" : c }} />)}
              </div>
            )}
          </div>
          <div className="w-px h-3.5 bg-border mx-0.5" />
          <button className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" title="Влево" onMouseDown={(e) => { e.preventDefault(); exec("justifyLeft") }}><AlignLeft className="w-3 h-3" /></button>
          <button className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" title="По центру" onMouseDown={(e) => { e.preventDefault(); exec("justifyCenter") }}><AlignCenter className="w-3 h-3" /></button>
          <button className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" title="Вправо" onMouseDown={(e) => { e.preventDefault(); exec("justifyRight") }}><AlignRight className="w-3 h-3" /></button>
          <div className="w-px h-3.5 bg-border mx-0.5" />
          <button
            ref={miniEmojiBtnRef}
            className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors text-sm"
            title="Вставить эмодзи"
            onMouseDown={(e) => {
              e.preventDefault()
              // save selection before picker opens
              const sel = window.getSelection()
              if (sel && sel.rangeCount > 0) savedRangeMiniRef.current = sel.getRangeAt(0).cloneRange()
              if (miniEmojiBtnRef.current) {
                const rect = miniEmojiBtnRef.current.getBoundingClientRect()
                const spaceBelow = window.innerHeight - rect.bottom - 8
                const spaceAbove = rect.top - 8
                if (spaceBelow >= 300 || spaceBelow >= spaceAbove) {
                  setMiniEmojiPos({ top: rect.bottom + 4, left: Math.min(rect.left, window.innerWidth - (9 * 37 + 16) - 8) })
                } else {
                  setMiniEmojiPos({ bottom: window.innerHeight - rect.top + 4, left: Math.min(rect.left, window.innerWidth - (9 * 37 + 16) - 8) })
                }
              }
              setShowMiniEmoji(v => !v)
            }}
          >😊</button>
        </div>
      )}
      <InlineEmojiPicker
        isOpen={showMiniEmoji}
        positionStyle={miniEmojiPos}
        searchRef={miniEmojiSearchRef}
        onSelect={(emoji) => {
          setShowMiniEmoji(false)
          if (!ref.current) return
          ref.current.focus()
          if (savedRangeMiniRef.current) {
            const sel = window.getSelection()
            if (sel) { sel.removeAllRanges(); sel.addRange(savedRangeMiniRef.current) }
          }
          insertAtCursor(ref, emoji, sync)
        }}
      />
    </div>
  )
}

// ─── Upload or URL picker ──────────────────────────────────────────────────

function SourcePicker({
  onFile,
  onUrl,
  accept,
  urlPlaceholder,
  urlHint,
  fileLabel = "Загрузить с устройства",
}: {
  onFile: (dataUrl: string, fileName: string) => void
  onUrl: (url: string) => void
  accept: string
  urlPlaceholder: string
  urlHint?: string
  fileLabel?: string
}) {
  const [mode, setMode] = useState<"choose" | "file" | "url">("choose")
  const [urlDraft, setUrlDraft] = useState("")
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    // Video and audio files are too large for base64 / localStorage —
    // use a blob URL instead (valid for the current session only)
    if (file.type.startsWith("video/") || file.type.startsWith("audio/")) {
      const blobUrl = URL.createObjectURL(file)
      onFile(blobUrl, file.name)
      return
    }
    const reader = new FileReader()
    reader.onload = () => onFile(reader.result as string, file.name)
    reader.readAsDataURL(file)
  }

  if (mode === "choose") {
    return (
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => { setMode("file"); setTimeout(() => fileRef.current?.click(), 50) }}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border hover:border-primary/50 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />{fileLabel}
        </button>
        <button
          onClick={() => setMode("url")}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border hover:border-primary/50 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <Link2 className="w-3.5 h-3.5" />Вставить ссылку
        </button>
        <input ref={fileRef} type="file" accept={accept} className="hidden" onChange={handleFile} />
      </div>
    )
  }

  if (mode === "file") {
    return (
      <div className="flex flex-col items-start gap-2">
        <button
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-2 px-4 py-3 rounded-xl border-2 border-dashed border-border hover:border-primary/50 text-sm text-muted-foreground hover:text-foreground transition-colors w-full justify-center"
        >
          <Plus className="w-4 h-4" /> {fileLabel}
        </button>
        <button onClick={() => setMode("choose")} className="text-xs text-muted-foreground hover:text-foreground">← Назад</button>
        <input ref={fileRef} type="file" accept={accept} className="hidden" onChange={handleFile} />
      </div>
    )
  }

  // url mode
  return (
    <div className="space-y-1.5">
      <div className="flex gap-2">
        <Input
          autoFocus
          className="text-sm flex-1"
          placeholder={urlPlaceholder}
          value={urlDraft}
          onChange={(e) => setUrlDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && urlDraft.trim()) onUrl(urlDraft.trim()) }}
        />
        <Button size="sm" variant="outline" onClick={() => { if (urlDraft.trim()) onUrl(urlDraft.trim()) }}>Добавить</Button>
      </div>
      {urlHint && <p className="text-[11px] text-muted-foreground">{urlHint}</p>}
      <button onClick={() => setMode("choose")} className="text-xs text-muted-foreground hover:text-foreground">← Назад</button>
    </div>
  )
}

// ─── Task editor block ─────────────────────────────────────────────────────

const TASK_QTYPES: { type: import("@/lib/course-types").QuestionAnswerType; icon: string; label: string; desc: string }[] = [
  { type: "short",    icon: "T",   label: "Короткий текст",       desc: "Одна строка" },
  { type: "long",     icon: "≡",   label: "Длинный текст",        desc: "Абзац" },
  { type: "yesno",    icon: "⊙",   label: "Да / Нет",             desc: "Один из двух" },
  { type: "single",   icon: "◉",   label: "Один из списка",       desc: "Радио" },
  { type: "multiple", icon: "☑",   label: "Несколько",            desc: "Чекбоксы" },
  { type: "sort",     icon: "↕",   label: "Сортировка",           desc: "Порядок" },
]

// Пересчёт баллов: 100 / n, равномерно
function distributePoints(questions: import("@/lib/course-types").Question[]): import("@/lib/course-types").Question[] {
  const n = questions.length
  if (n === 0) return questions
  const base = Math.floor(100 / n)
  const rem = 100 - base * n
  return questions.map((q, i) => ({ ...q, points: base + (i < rem ? 1 : 0) }))
}

function TaskEditorBlock({ block, onUpdate }: { block: Block; onUpdate: (patch: Partial<Block>) => void }) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null)
  // null = нет пикера, "add" = добавляем новый, qi = меняем тип существующего
  const [typePicker, setTypePicker] = useState<"add" | number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (expandedIdx !== null) inputRef.current?.focus()
  }, [expandedIdx])

  const updateQ = (qi: number, patch: Partial<import("@/lib/course-types").Question>) => {
    const nq = [...block.questions]; nq[qi] = { ...nq[qi], ...patch }; onUpdate({ questions: nq })
  }
  const moveQ = (qi: number, dir: -1 | 1) => {
    const t = qi + dir; if (t < 0 || t >= block.questions.length) return
    const nq = [...block.questions];[nq[qi], nq[t]] = [nq[t], nq[qi]]
    onUpdate({ questions: nq }); setExpandedIdx(t)
  }

  // Добавить вопрос выбранного типа
  const addQuestion = (type: import("@/lib/course-types").QuestionAnswerType) => {
    const newQ: import("@/lib/course-types").Question = {
      id: `q-${Date.now()}`, text: "", answerType: type, required: false,
      options: (type === "single" || type === "multiple" || type === "sort") ? ["", ""] : [],
    }
    const nq = distributePoints([...block.questions, newQ])
    onUpdate({ questions: nq })
    setTypePicker(null)
    setTimeout(() => setExpandedIdx(nq.length - 1), 0)
  }

  const removeQuestion = (qi: number) => {
    const nq = distributePoints(block.questions.filter((_, j) => j !== qi))
    onUpdate({ questions: nq })
    if (expandedIdx === qi) setExpandedIdx(null)
    else if (expandedIdx !== null && expandedIdx > qi) setExpandedIdx(expandedIdx - 1)
  }

  const qTypeInfo = (type: import("@/lib/course-types").QuestionAnswerType) =>
    TASK_QTYPES.find((t) => t.type === type)

  const totalPoints = block.questions.reduce((s, q) => s + (q.points ?? 0), 0)

  return (
    <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <CheckSquare className="w-4 h-4" /><span>Задание и вопросы</span>
        </div>
        {totalPoints > 0 && (
          <span className="text-xs text-amber-600 bg-amber-500/10 px-2 py-0.5 rounded font-medium">
            Итого: {totalPoints} б.
          </span>
        )}
      </div>

      {/* Заголовок */}
      <Input
        placeholder="Заголовок задания..."
        value={block.taskTitle || ""}
        onChange={(e) => onUpdate({ taskTitle: e.target.value })}
        className="text-sm font-medium"
      />
      {/* Описание */}
      <textarea
        className="w-full text-sm bg-background border border-border rounded-lg p-2 outline-none resize-none min-h-[52px]"
        value={block.taskDescription}
        onChange={(e) => onUpdate({ taskDescription: e.target.value })}
        placeholder="Описание задания..."
      />

      {/* Вопросы */}
      <div className="space-y-2">
        {block.questions.map((q, qi) => {
          const isExpanded = expandedIdx === qi
          const hasOptions = q.answerType === "single" || q.answerType === "multiple" || q.answerType === "sort"
          const isText = q.answerType === "short" || q.answerType === "long" || q.answerType === "text"
          const points = q.points ?? 0
          const typeInfo = qTypeInfo(q.answerType)
          return (
            <div
              key={q.id}
              className={cn(
                "bg-background rounded-lg border transition-all",
                isExpanded ? "border-primary/40 shadow-sm" : "border-border"
              )}
            >
              {/* ── Заголовок карточки ── */}
              <div
                className="flex items-center gap-1.5 px-2.5 py-2 cursor-pointer select-none"
                onClick={() => { setExpandedIdx(isExpanded ? null : qi); setTypePicker(null) }}
              >
                <div className="flex flex-col gap-0.5 text-muted-foreground/30 shrink-0" onClick={(e) => e.stopPropagation()}>
                  <button className="hover:text-muted-foreground disabled:opacity-20" onClick={() => moveQ(qi, -1)} disabled={qi === 0}><ArrowUp className="w-3 h-3" /></button>
                  <button className="hover:text-muted-foreground disabled:opacity-20" onClick={() => moveQ(qi, 1)} disabled={qi === block.questions.length - 1}><ArrowDown className="w-3 h-3" /></button>
                </div>
                <span className="text-xs font-bold text-muted-foreground w-5 shrink-0">{qi + 1}.</span>
                <span className={cn("flex-1 text-sm truncate", q.text ? "text-foreground" : "text-muted-foreground/50 italic")}>
                  {q.text || "Вопрос"}
                </span>
                {typeInfo && (
                  <span className="text-[11px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0 font-mono">
                    {typeInfo.icon}
                  </span>
                )}
                {points > 0 && (
                  <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 font-medium shrink-0">{points}б</span>
                )}
                <button
                  title={q.required ? "Обязательный" : "Не обязательный"}
                  onClick={(e) => { e.stopPropagation(); updateQ(qi, { required: !q.required }) }}
                  className={cn("shrink-0 w-5 h-5 rounded flex items-center justify-center text-sm font-bold transition-colors",
                    q.required ? "text-destructive" : "text-muted-foreground/25 hover:text-muted-foreground")}
                >*</button>
                <button className="text-muted-foreground/40 hover:text-destructive shrink-0"
                  onClick={(e) => { e.stopPropagation(); removeQuestion(qi) }}
                ><X className="w-3.5 h-3.5" /></button>
                <ChevronRight className={cn("w-3.5 h-3.5 text-muted-foreground/40 shrink-0 transition-transform", isExpanded && "rotate-90")} />
              </div>

              {/* ── Расширенные настройки ── */}
              {isExpanded && (
                <div className="px-3 pb-3 space-y-3 border-t border-border/60 pt-3">

                  {/* Текст вопроса */}
                  <input
                    ref={inputRef}
                    className="w-full text-sm bg-muted/30 border border-border rounded-lg px-3 py-1.5 outline-none focus:border-primary/50"
                    value={q.text}
                    onChange={(e) => updateQ(qi, { text: e.target.value })}
                    onKeyDown={(e) => { if (e.key === "Escape") setExpandedIdx(null) }}
                    placeholder="Введите текст вопроса..."
                  />

                  {/* Выбор типа — кнопка + раскрывающийся пикер */}
                  <div className="space-y-1.5">
                    <button
                      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => setTypePicker(typePicker === qi ? null : qi)}
                    >
                      <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-[11px]">{typeInfo?.icon}</span>
                      <span>{typeInfo?.label}</span>
                      <ChevronRight className={cn("w-3 h-3 transition-transform", typePicker === qi && "rotate-90")} />
                    </button>
                    {typePicker === qi && (
                      <div className="grid grid-cols-3 gap-1.5 pt-1">
                        {TASK_QTYPES.map(({ type, icon, label, desc }) => (
                          <button
                            key={type}
                            onClick={() => {
                              updateQ(qi, {
                                answerType: type,
                                options: (type === "single" || type === "multiple" || type === "sort") && q.options.length === 0 ? ["", ""] : q.options,
                                aiCriteria: type === "short" || type === "long" ? q.aiCriteria : undefined,
                              })
                              setTypePicker(null)
                            }}
                            className={cn(
                              "flex flex-col items-center gap-0.5 px-2 py-2 rounded-lg border text-center transition-all",
                              q.answerType === type
                                ? "bg-primary/10 border-primary text-primary"
                                : "border-border hover:border-primary/40 hover:bg-muted/50"
                            )}
                          >
                            <span className="text-base font-mono leading-none">{icon}</span>
                            <span className="text-[10px] font-medium leading-tight">{label}</span>
                            <span className="text-[9px] text-muted-foreground leading-none">{desc}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* ── Короткий/длинный текст → ИИ-проверка ── */}
                  {isText && (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-muted-foreground font-medium">🤖 ИИ-проверка</span>
                        <span className="text-[10px] text-muted-foreground/50">необязательно</span>
                      </div>
                      <textarea
                        className="w-full text-xs bg-muted/30 border border-border rounded-lg px-2.5 py-1.5 outline-none focus:border-primary/50 resize-none min-h-[52px]"
                        value={q.aiCriteria || ""}
                        onChange={(e) => updateQ(qi, { aiCriteria: e.target.value })}
                        placeholder="Критерий для ИИ: например «Кандидат должен упомянуть опыт продаж более 2 лет»"
                      />
                      {q.aiCriteria && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">Баллы:</span>
                          <input type="number" min={0} max={999}
                            className="w-16 text-xs border border-border rounded px-2 py-0.5 outline-none bg-background focus:border-primary/50 text-center"
                            value={points}
                            onChange={(e) => { const v = parseInt(e.target.value); updateQ(qi, { points: isNaN(v) || v < 0 ? 0 : v }) }}
                          />
                          <button className="text-[11px] text-primary/60 hover:text-primary underline underline-offset-2"
                            onClick={() => onUpdate({ questions: distributePoints(block.questions) })}
                          >÷{block.questions.length}</button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── Варианты (single / multiple / sort) ── */}
                  {hasOptions && (
                    <div className="space-y-1.5">
                      {q.options.map((opt, oi) => {
                        const isCorrectSingle = q.answerType === "single" && q.correctOptions?.[0] === oi
                        const isCorrectMulti = q.answerType === "multiple" && (q.correctOptions?.includes(oi) ?? false)
                        return (
                          <div key={oi} className="flex items-center gap-1.5">
                            {q.answerType === "sort" && (
                              <span className="text-xs text-muted-foreground w-4 shrink-0 text-center">{oi + 1}.</span>
                            )}
                            <input
                              className={cn(
                                "flex-1 text-xs border rounded px-2 py-1.5 outline-none focus:border-primary/50",
                                (isCorrectSingle || isCorrectMulti) ? "bg-green-500/5 border-green-400/50" : "bg-muted/30 border-border"
                              )}
                              value={opt}
                              onChange={(e) => { const no = [...q.options]; no[oi] = e.target.value; updateQ(qi, { options: no }) }}
                              placeholder={`Вариант ${oi + 1}...`}
                            />
                            {q.answerType === "single" && (
                              <button
                                title={isCorrectSingle ? "Правильный ответ" : "Отметить как правильный"}
                                onClick={() => updateQ(qi, { correctOptions: isCorrectSingle ? [] : [oi] })}
                                className={cn(
                                  "shrink-0 px-2 py-1 rounded text-[11px] font-medium border transition-all",
                                  isCorrectSingle ? "bg-green-500 border-green-500 text-white" : "border-border text-muted-foreground/40 hover:border-green-400 hover:text-green-600"
                                )}
                              >✓</button>
                            )}
                            {q.answerType === "multiple" && (
                              <button
                                title={isCorrectMulti ? "Правильный (снять)" : "Отметить как правильный"}
                                onClick={() => {
                                  const cur = q.correctOptions || []
                                  updateQ(qi, { correctOptions: cur.includes(oi) ? cur.filter((x) => x !== oi) : [...cur, oi] })
                                }}
                                className={cn(
                                  "shrink-0 px-2 py-1 rounded text-[11px] font-medium border transition-all",
                                  isCorrectMulti ? "bg-green-500 border-green-500 text-white" : "border-border text-muted-foreground/40 hover:border-green-400 hover:text-green-600"
                                )}
                              >✓</button>
                            )}
                            <button className="text-muted-foreground/40 hover:text-destructive shrink-0"
                              onClick={() => {
                                const newOpts = q.options.filter((_, j) => j !== oi)
                                const newCorrect = q.correctOptions?.filter((c) => c !== oi).map((c) => c > oi ? c - 1 : c)
                                updateQ(qi, { options: newOpts, correctOptions: newCorrect })
                              }}
                            ><X className="w-3 h-3" /></button>
                          </div>
                        )
                      })}
                      <button className="text-xs text-primary/70 hover:text-primary flex items-center gap-1"
                        onClick={() => updateQ(qi, { options: [...q.options, ""] })}
                      >
                        <Plus className="w-3 h-3" />{q.answerType === "sort" ? "Добавить пункт" : "Добавить вариант"}
                      </button>
                      {q.answerType === "sort" && q.options.length > 0 && (
                        <p className="text-[11px] text-muted-foreground/50">Текущий порядок считается правильным</p>
                      )}
                    </div>
                  )}

                  {/* ── Да/Нет: правильный ── */}
                  {q.answerType === "yesno" && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Правильный:</span>
                      {(["yes", "no"] as const).map((v) => (
                        <button key={v}
                          onClick={() => updateQ(qi, { correctYesNo: q.correctYesNo === v ? undefined : v })}
                          className={cn(
                            "px-3 py-1 rounded text-xs font-medium border transition-all",
                            q.correctYesNo === v
                              ? v === "yes" ? "bg-green-500 border-green-500 text-white" : "bg-destructive border-destructive text-white"
                              : "border-border text-muted-foreground hover:border-primary/40"
                          )}
                        >{v === "yes" ? "Да" : "Нет"}</button>
                      ))}
                    </div>
                  )}

                  {/* ── Баллы (не для текстовых без aiCriteria) ── */}
                  {!isText && (
                    <div className="flex items-center gap-2 pt-0.5 border-t border-border/40">
                      <span className="text-xs text-muted-foreground">Баллы:</span>
                      <input type="number" min={0} max={999}
                        className="w-16 text-xs border border-border rounded px-2 py-0.5 outline-none bg-background focus:border-primary/50 text-center"
                        value={points}
                        onChange={(e) => { const v = parseInt(e.target.value); updateQ(qi, { points: isNaN(v) || v < 0 ? 0 : v }) }}
                      />
                      <button className="text-[11px] text-primary/60 hover:text-primary underline underline-offset-2"
                        onClick={() => onUpdate({ questions: distributePoints(block.questions) })}
                        title="Распределить 100 баллов равномерно"
                      >÷{block.questions.length}</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {/* ── Кнопка добавить / пикер типа ── */}
        {typePicker === "add" ? (
          <div className="border border-dashed border-primary/40 rounded-lg p-3 space-y-2 bg-background">
            <p className="text-xs text-muted-foreground font-medium">Выберите тип вопроса:</p>
            <div className="grid grid-cols-3 gap-2">
              {TASK_QTYPES.map(({ type, icon, label, desc }) => (
                <button
                  key={type}
                  onClick={() => addQuestion(type)}
                  className="flex flex-col items-center gap-1 px-2 py-3 rounded-xl border border-border hover:border-primary/50 hover:bg-primary/5 transition-all group"
                >
                  <span className="text-xl font-mono leading-none group-hover:scale-110 transition-transform">{icon}</span>
                  <span className="text-[11px] font-medium text-foreground leading-tight">{label}</span>
                  <span className="text-[10px] text-muted-foreground leading-none">{desc}</span>
                </button>
              ))}
            </div>
            <button className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setTypePicker(null)}
            >Отмена</button>
          </div>
        ) : (
          <Button variant="ghost" size="sm" className="text-xs h-7 text-muted-foreground"
            onClick={() => setTypePicker("add")}
          >
            <Plus className="w-3 h-3 mr-1" />Добавить вопрос
          </Button>
        )}
      </div>
    </div>
  )
}

// ─── Media / other block types ─────────────────────────────────────────────

function NotionMediaBlock({ block, onUpdate, onRemove }: { block: Block; onUpdate: (patch: Partial<Block>) => void; onRemove: () => void }) {
  const meta = BLOCK_TYPE_META.find((m) => m.type === block.type)
  const imgRef = useRef<HTMLImageElement>(null)
  const [imgHeight, setImgHeight] = useState<number>(256)
  const videoContainerRef = useRef<HTMLDivElement>(null)
  const [videoHeight, setVideoHeight] = useState<number>(400)
  useEffect(() => {
    const el = videoContainerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setVideoHeight(el.offsetHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const audioContainerRef = useRef<HTMLDivElement>(null)
  const [audioHeight, setAudioHeight] = useState<number>(54)
  useEffect(() => {
    const el = audioContainerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setAudioHeight(el.offsetHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const fileContainerRef = useRef<HTMLDivElement>(null)
  const [fileHeight, setFileHeight] = useState<number>(64)
  useEffect(() => {
    const el = fileContainerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setFileHeight(el.offsetHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  switch (block.type) {
    case "image": {
      const layout = block.imageLayout || "full"
      const isSet = !!block.imageUrl
      const isSide = layout === "image-left" || layout === "image-right"
      return (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <ImageIcon className="w-4 h-4" /><span>Изображение</span>
            </div>
            {isSet && (
              <button onClick={() => onUpdate({ imageUrl: "" })} className="text-xs text-muted-foreground hover:text-destructive transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <LayoutPicker value={layout} onChange={(v) => onUpdate({ imageLayout: v as Block["imageLayout"] })} prefix="image" />
          {isSet ? (
            <div className={cn("flex gap-3", isSide ? (layout === "image-left" ? "flex-row" : "flex-row-reverse") : "flex-col")}>
              <div className={cn("flex flex-col gap-1", isSide ? "w-1/2 shrink-0" : "w-full")}>
                <MiniRichEditor
                  html={block.imageTitleTop || ""}
                  onChange={(v) => onUpdate({ imageTitleTop: v })}
                  placeholder="Подпись сверху..."
                  singleLine
                  maxLength={42}
                  className="mb-1"
                />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  ref={imgRef}
                  src={block.imageUrl}
                  alt=""
                  className="rounded-lg object-contain w-full max-h-64 bg-muted/30"
                  onLoad={() => setImgHeight(imgRef.current?.offsetHeight ?? 256)}
                />
                <MiniRichEditor
                  html={block.imageCaption || ""}
                  onChange={(v) => onUpdate({ imageCaption: v })}
                  placeholder="Подпись снизу..."
                  singleLine
                  maxLength={42}
                  className="mt-1"
                />
              </div>
              {/* Текст справа/слева при боковом layout */}
              {isSide && (
                <MiniRichEditor
                  html={block.content || ""}
                  onChange={(v) => onUpdate({ content: v })}
                  placeholder="Текст рядом с изображением..."
                  maxHeight={imgHeight}
                  className="flex-1 text-sm not-italic"
                />
              )}
            </div>
          ) : (
            <SourcePicker
              accept="image/*"
              urlPlaceholder="https://example.com/photo.jpg"
              fileLabel="Загрузить изображение"
              onFile={(dataUrl) => onUpdate({ imageUrl: dataUrl })}
              onUrl={(url) => onUpdate({ imageUrl: url })}
            />
          )}
        </div>
      )
    }

    case "video": {
      const layout = (block.videoLayout || "full") as string
      const isSet = !!block.videoUrl
      const embed = isSet ? detectVideoService(block.videoUrl) : null
      const isSide = layout === "video-left" || layout === "video-right"
      return (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Video className="w-4 h-4" /><span>Видео</span>
              {embed && <span className="text-[10px] font-normal bg-primary/10 text-primary rounded px-1.5 py-0.5">{embed.service}</span>}
            </div>
            {isSet && (
              <button onClick={() => onUpdate({ videoUrl: "" })} className="text-xs text-muted-foreground hover:text-destructive transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <LayoutPicker value={layout} onChange={(v) => onUpdate({ videoLayout: v.replace("image", "video") as Block["videoLayout"] })} prefix="video" />
          {isSet ? (
            <div className={cn("flex gap-3", isSide ? (layout === "video-left" ? "flex-row" : "flex-row-reverse") : "flex-col")}>
              <div className={cn("flex flex-col gap-1", isSide ? "w-1/2 shrink-0" : "w-full")}>
                <MiniRichEditor
                  html={block.videoTitleTop || ""}
                  onChange={(v) => onUpdate({ videoTitleTop: v })}
                  placeholder="Подпись сверху..."
                  singleLine
                  maxLength={42}
                  className="mb-1"
                />
                <div ref={videoContainerRef} className="rounded-lg bg-black aspect-video overflow-hidden">
                  {embed ? (
                    <iframe
                      src={embed.embedUrl}
                      className="w-full h-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      title="video"
                    />
                  ) : (
                    <video src={block.videoUrl} controls className="w-full h-full object-contain" />
                  )}
                </div>
                <MiniRichEditor
                  html={block.videoCaption || ""}
                  onChange={(v) => onUpdate({ videoCaption: v })}
                  placeholder="Подпись снизу..."
                  singleLine
                  maxLength={42}
                  className="mt-1"
                />
              </div>
              {isSide && (
                <MiniRichEditor
                  html={block.content || ""}
                  onChange={(v) => onUpdate({ content: v })}
                  placeholder="Текст рядом с видео..."
                  maxHeight={videoHeight}
                  className="flex-1 text-sm not-italic"
                />
              )}
            </div>
          ) : (
            <SourcePicker
              accept="video/*"
              urlPlaceholder="https://youtube.com/watch?v=... или другой сервис"
              urlHint="Поддерживаются: YouTube, RuTube, VK, прямые ссылки на видеофайлы"
              fileLabel="Загрузить видео"
              onFile={(dataUrl, fileName) => onUpdate({ videoUrl: dataUrl, fileName })}
              onUrl={(url) => onUpdate({ videoUrl: url })}
            />
          )}
        </div>
      )
    }

    case "audio": {
      const layout = block.audioLayout || "full"
      const isSet = !!block.audioUrl
      const isSide = layout === "audio-left" || layout === "audio-right"
      return (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Music className="w-4 h-4" /><span>Аудио</span>
            </div>
            {isSet && (
              <button onClick={() => onUpdate({ audioUrl: "", audioTitle: "" })} className="text-xs text-muted-foreground hover:text-destructive transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <LayoutPicker value={layout} onChange={(v) => onUpdate({ audioLayout: v.replace("image", "audio") as Block["audioLayout"] })} prefix="audio" />
          {isSet ? (
            <div className={cn("flex gap-3", isSide ? (layout === "audio-left" ? "flex-row" : "flex-row-reverse") : "flex-col")}>
              <div className={cn("flex flex-col gap-1", isSide ? "w-1/2 shrink-0" : "w-full")}>
                <MiniRichEditor
                  html={block.audioTitleTop || ""}
                  onChange={(v) => onUpdate({ audioTitleTop: v })}
                  placeholder="Подпись сверху..."
                  singleLine
                  maxLength={42}
                  className="mb-1"
                />
                {block.audioTitle && <p className="text-xs font-medium text-foreground">{block.audioTitle}</p>}
                <div ref={audioContainerRef}>
                  <audio src={block.audioUrl} controls className="w-full" />
                </div>
                <MiniRichEditor
                  html={block.audioCaption || ""}
                  onChange={(v) => onUpdate({ audioCaption: v })}
                  placeholder="Подпись снизу..."
                  singleLine
                  maxLength={42}
                  className="mt-1"
                />
              </div>
              {isSide && (
                <MiniRichEditor
                  html={block.content || ""}
                  onChange={(v) => onUpdate({ content: v })}
                  placeholder="Текст рядом с аудио..."
                  maxHeight={audioHeight}
                  className="flex-1 text-sm not-italic"
                />
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <Input
                placeholder="Название аудио (необязательно)"
                value={block.audioTitle}
                onChange={(e) => onUpdate({ audioTitle: e.target.value })}
                className="text-sm h-8"
              />
              <SourcePicker
                accept="audio/*"
                urlPlaceholder="https://example.com/audio.mp3"
                fileLabel="Загрузить аудио"
                onFile={(dataUrl, fileName) => onUpdate({ audioUrl: dataUrl, audioTitle: block.audioTitle || fileName })}
                onUrl={(url) => onUpdate({ audioUrl: url })}
              />
            </div>
          )}
        </div>
      )
    }

    case "file": {
      const layout = block.fileLayout || "full"
      const isSet = !!block.fileUrl
      const isSide = layout === "file-left" || layout === "file-right"
      return (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <FileText className="w-4 h-4" /><span>Файл</span>
            </div>
            {isSet && (
              <button onClick={() => onUpdate({ fileUrl: "", fileName: "" })} className="text-xs text-muted-foreground hover:text-destructive transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <LayoutPicker value={layout} onChange={(v) => onUpdate({ fileLayout: v.replace("image", "file") as Block["fileLayout"] })} prefix="file" />
          {isSet ? (
            <div className={cn("flex gap-3", isSide ? (layout === "file-left" ? "flex-row" : "flex-row-reverse") : "flex-col")}>
              <div className={cn("flex flex-col gap-1", isSide ? "w-1/2 shrink-0" : "w-full")}>
                <MiniRichEditor
                  html={block.fileTitleTop || ""}
                  onChange={(v) => onUpdate({ fileTitleTop: v })}
                  placeholder="Подпись сверху..."
                  singleLine
                  maxLength={42}
                  className="mb-1"
                />
                <div ref={fileContainerRef} className="flex items-center gap-3 p-3 bg-background rounded-lg border border-border">
                  <FileText className="w-8 h-8 text-primary shrink-0" />
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="relative">
                      <input
                        className="w-full text-sm font-medium bg-transparent outline-none border-b border-transparent hover:border-border focus:border-primary transition-colors pr-10 truncate"
                        value={block.fileName || ""}
                        maxLength={80}
                        placeholder="Название файла..."
                        onChange={(e) => onUpdate({ fileName: e.target.value })}
                      />
                      <span className={cn(
                        "absolute right-0 top-0 text-[10px] tabular-nums transition-colors",
                        (block.fileName?.length ?? 0) >= 72 ? (block.fileName?.length ?? 0) >= 80 ? "text-destructive" : "text-amber-500" : "text-muted-foreground/40"
                      )}>
                        {block.fileName?.length ?? 0}/80
                      </span>
                    </div>
                    <a href={block.fileUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">Открыть</a>
                  </div>
                </div>
                <MiniRichEditor
                  html={block.fileCaption || ""}
                  onChange={(v) => onUpdate({ fileCaption: v })}
                  placeholder="Подпись снизу..."
                  singleLine
                  maxLength={42}
                  className="mt-1"
                />
              </div>
              {isSide && (
                <MiniRichEditor
                  html={block.content || ""}
                  onChange={(v) => onUpdate({ content: v })}
                  placeholder="Текст рядом с файлом..."
                  maxHeight={fileHeight}
                  className="flex-1 text-sm not-italic"
                />
              )}
            </div>
          ) : (
            <SourcePicker
              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip"
              urlPlaceholder="https://docs.google.com/... или Яндекс Документы"
              urlHint="Поддерживаются: Google Docs, Яндекс Документы, OneDrive, прямые ссылки"
              fileLabel="Загрузить файл"
              onFile={(dataUrl, fileName) => onUpdate({ fileUrl: dataUrl, fileName })}
              onUrl={(url) => onUpdate({ fileUrl: url, fileName: block.fileName || url.split("/").pop() || "Документ" })}
            />
          )}
        </div>
      )
    }

    case "info":
      return <InfoBlock block={block} onUpdate={onUpdate} />

    case "button": {
      const btnColor = block.buttonColor || ""
      const isPrimary = block.buttonVariant === "primary"
      const previewStyle = btnColor
        ? isPrimary
          ? { backgroundColor: btnColor, borderColor: btnColor, color: "#fff" }
          : { borderColor: btnColor, color: btnColor }
        : {}
      return (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <MousePointerClick className="w-4 h-4" /><span>Кнопка</span>
          </div>

          {/* Текст + ссылка */}
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Текст кнопки" value={block.buttonText} onChange={(e) => onUpdate({ buttonText: e.target.value })} className="text-sm" />
            <Input placeholder="https://..." value={block.buttonUrl} onChange={(e) => onUpdate({ buttonUrl: e.target.value })} className="text-sm" />
          </div>

          {/* Стиль: основная / контурная */}
          <div className="flex items-center gap-2">
            <Button variant={isPrimary ? "default" : "outline"} size="sm" className="text-xs" onClick={() => onUpdate({ buttonVariant: "primary" })}>Основная</Button>
            <Button variant={!isPrimary ? "default" : "outline"} size="sm" className="text-xs" onClick={() => onUpdate({ buttonVariant: "outline" })}>Контурная</Button>
          </div>

          {/* Иконка ДО текста */}
          <div>
            <p className="text-xs text-muted-foreground mb-1.5">Иконка слева</p>
            <div className="flex flex-wrap gap-1.5">
              {BUTTON_ICONS_BEFORE.map(({ symbol, label }) => (
                <button
                  key={`before-${label}`}
                  title={label}
                  onClick={() => onUpdate({ buttonIconBefore: symbol })}
                  className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center text-sm border transition-all",
                    (block.buttonIconBefore ?? "") === symbol
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:border-primary/50 hover:bg-muted"
                  )}
                >
                  {symbol || "∅"}
                </button>
              ))}
            </div>
          </div>

          {/* Иконка ПОСЛЕ текста */}
          <div>
            <p className="text-xs text-muted-foreground mb-1.5">Иконка справа</p>
            <div className="flex flex-wrap gap-1.5">
              {BUTTON_ICONS_AFTER.map(({ symbol, label }) => (
                <button
                  key={`after-${label}`}
                  title={label}
                  onClick={() => onUpdate({ buttonIconAfter: symbol })}
                  className={cn(
                    "w-8 h-8 rounded-lg flex items-center justify-center text-sm border transition-all",
                    (block.buttonIconAfter ?? "") === symbol
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:border-primary/50 hover:bg-muted"
                  )}
                >
                  {symbol || "∅"}
                </button>
              ))}
            </div>
          </div>

          {/* Цвет */}
          <div>
            <p className="text-xs text-muted-foreground mb-1.5">Цвет</p>
            <div className="flex flex-wrap gap-1.5">
              {BUTTON_PRESET_COLORS.map(({ hex, label }) => (
                <button
                  key={hex}
                  title={label}
                  onClick={() => onUpdate({ buttonColor: btnColor === hex ? "" : hex })}
                  className={cn(
                    "w-7 h-7 rounded-full border-2 transition-all",
                    btnColor === hex ? "border-foreground/60 scale-110" : "border-transparent hover:scale-105"
                  )}
                  style={{ backgroundColor: hex }}
                />
              ))}
              {btnColor && (
                <button
                  title="Сбросить цвет"
                  onClick={() => onUpdate({ buttonColor: "" })}
                  className="w-7 h-7 rounded-full border-2 border-border flex items-center justify-center text-muted-foreground hover:text-destructive hover:border-destructive transition-all text-xs"
                >✕</button>
              )}
            </div>
          </div>

          {/* Превью */}
          <div className="flex justify-center pt-1">
            <button
              className={cn(
                "inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                isPrimary
                  ? btnColor ? "text-white" : "bg-primary text-primary-foreground"
                  : btnColor ? "bg-transparent border" : "border border-border"
              )}
              style={previewStyle}
            >
              {block.buttonIconBefore && <span>{block.buttonIconBefore}</span>}
              {block.buttonText || "Кнопка"}
              {block.buttonIconAfter && <span>{block.buttonIconAfter}</span>}
            </button>
          </div>
        </div>
      )
    }

    case "task":
      return <TaskEditorBlock block={block} onUpdate={onUpdate} />

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
        "flex items-center gap-1 bg-background border border-border rounded-lg shadow-sm px-1.5 py-1",
        "transition-all duration-100",
        visible ? "opacity-100 scale-100 pointer-events-auto" : "opacity-0 scale-95 pointer-events-none"
      )}>
        {SLASH_ITEMS.map((item) => (
          <button
            key={item.type}
            title={item.label}
            onClick={() => onAdd(item.type)}
            className="w-[29px] h-[29px] rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
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

/* ──── InlineEmojiPicker: пикер для вставки эмодзи в текст ──── */
function InlineEmojiPicker({ onSelect, positionStyle, isOpen, searchRef }: {
  onSelect: (e: string) => void
  positionStyle: React.CSSProperties
  isOpen: boolean
  searchRef: React.RefObject<HTMLInputElement>
}) {
  const [activeCategory, setActiveCategory] = useState(Object.keys(CATEGORIES)[0])
  const [search, setSearch] = useState("")

  useEffect(() => { if (isOpen) { setSearch(""); setActiveCategory(Object.keys(CATEGORIES)[0]) } }, [isOpen])
  useEffect(() => { if (isOpen) setTimeout(() => searchRef.current?.focus(), 50) }, [isOpen])

  const searchResults = search.trim()
    ? Object.values(CATEGORIES).flat().filter((e) => {
        const q = search.toLowerCase()
        return (EMOJI_NAMES[e] || "").toLowerCase().includes(q) || e.includes(q)
      })
    : null
  const displayEmojis = searchResults ?? CATEGORIES[activeCategory] ?? []
  const PICKER_WIDTH = 9 * 37 + 16

  if (!isOpen) return null
  return (
    <div
      style={{ ...positionStyle, width: PICKER_WIDTH, maxHeight: 480, zIndex: 9999 }}
      className="fixed bg-popover border border-border rounded-xl shadow-xl p-2 flex flex-col gap-1"
    >
      <input ref={searchRef} value={search} onChange={(e) => setSearch(e.target.value)}
        placeholder="Поиск эмодзи..."
        className="w-full text-xs border border-border rounded-lg px-2.5 py-1.5 outline-none focus:border-primary/50 bg-muted/30 placeholder:text-muted-foreground/50" />
      {!search && (
        <div className="grid grid-cols-9 gap-0 pb-1 border-b border-border">
          {QUICK.map((e) => (
            <button key={e} onMouseDown={(ev) => { ev.preventDefault(); onSelect(e) }}
              className="w-[37px] h-[37px] text-[1.44rem] flex items-center justify-center rounded hover:bg-muted transition-colors leading-none">{e}</button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-9 gap-0 overflow-y-auto flex-1 min-h-0">
        {displayEmojis.length > 0
          ? displayEmojis.map((e, i) => (
              <button key={i} onMouseDown={(ev) => { ev.preventDefault(); onSelect(e) }}
                title={EMOJI_NAMES[e] || e}
                className="w-[37px] h-[37px] text-[1.44rem] flex items-center justify-center rounded hover:bg-muted transition-colors leading-none">{e}</button>
            ))
          : <p className="col-span-9 text-xs text-muted-foreground text-center py-4">Ничего не найдено</p>
        }
      </div>
      {!search && (
        <div className="flex flex-wrap gap-1 border-t border-border pt-1">
          {Object.keys(CATEGORIES).map((cat) => (
            <button key={cat} onMouseDown={(ev) => { ev.preventDefault(); setActiveCategory(cat) }}
              className={cn("text-xs px-2 py-1 rounded-lg transition-all",
                activeCategory === cat ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground")}>{cat}</button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── InfoBlock ──────────────────────────────────────────────────────────────

const INFO_ICONS: { symbol: string; label: string }[] = [
  { symbol: "✓", label: "Галочка" },
  { symbol: "?", label: "Вопрос" },
  { symbol: "✗", label: "Крест" },
  { symbol: "!", label: "Восклицание" },
  { symbol: "i", label: "Информация" },
  { symbol: "△", label: "Предупреждение" },
  { symbol: "★", label: "Звезда" },
  { symbol: "♥", label: "Сердце" },
  { symbol: "→", label: "Стрелка" },
  { symbol: "↑", label: "Вверх" },
  { symbol: "☎", label: "Телефон" },
  { symbol: "✉", label: "Письмо" },
]

const INFO_PRESET_COLORS = [
  { hex: "#ef4444", label: "Красный" },
  { hex: "#f97316", label: "Оранжевый" },
  { hex: "#eab308", label: "Жёлтый" },
  { hex: "#22c55e", label: "Зелёный" },
  { hex: "#3b82f6", label: "Синий" },
  { hex: "#6b7280", label: "Серый" },
]

// ─── Button block constants ─────────────────────────────────────────────────

const BUTTON_PRESET_COLORS = [
  { hex: "#3b82f6", label: "Синий" },
  { hex: "#ef4444", label: "Красный" },
  { hex: "#22c55e", label: "Зелёный" },
  { hex: "#f97316", label: "Оранжевый" },
  { hex: "#8b5cf6", label: "Фиолетовый" },
  { hex: "#000000", label: "Чёрный" },
]

const BUTTON_ICONS_BEFORE = [
  { symbol: "", label: "Нет" },
  { symbol: "←", label: "Стрелка влево" },
  { symbol: "↑", label: "Стрелка вверх" },
  { symbol: "▶", label: "Воспроизвести" },
  { symbol: "✓", label: "Галочка" },
  { symbol: "★", label: "Звезда" },
  { symbol: "📎", label: "Скрепка" },
  { symbol: "📥", label: "Загрузить" },
]

const BUTTON_ICONS_AFTER = [
  { symbol: "", label: "Нет" },
  { symbol: "→", label: "Стрелка вправо" },
  { symbol: "↓", label: "Стрелка вниз" },
  { symbol: "↗", label: "Открыть" },
  { symbol: "⬇", label: "Скачать" },
  { symbol: "✓", label: "Галочка" },
  { symbol: "+", label: "Плюс" },
  { symbol: "▶", label: "Воспроизвести" },
]


function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return { h: 0, s: 0, l: Math.round(l * 100) }
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) h = ((b - r) / d + 2) / 6
  else h = ((r - g) / d + 4) / 6
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) }
}

function hslToHex(h: number, s: number, l: number): string {
  const sl = s / 100, ll = l / 100
  const a = sl * Math.min(ll, 1 - ll)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    const color = ll - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)
    return Math.round(255 * color).toString(16).padStart(2, "0")
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

function InfoBlock({ block, onUpdate }: { block: Block; onUpdate: (patch: Partial<Block>) => void }) {
  const [showSettings, setShowSettings] = useState(false)
  const [showEmoji, setShowEmoji] = useState(false)
  const [showTags, setShowTags] = useState(false)
  const [tagsOpenUpward, setTagsOpenUpward] = useState(false)
  const [emojiPos, setEmojiPos] = useState<React.CSSProperties>({})
  const settingsRef = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const emojiBtnRef = useRef<HTMLButtonElement>(null)
  const tagsBtnRef = useRef<HTMLButtonElement>(null)
  const emojiSearchRef = useRef<HTMLInputElement>(null)
  const savedRangeRef = useRef<Range | null>(null)
  // отслеживаем id блока чтобы сбросить DOM только при смене блока
  const blockIdRef = useRef(block.id)

  // derive color: use infoColor if set, else map infoStyle to preset
  const styleColorMap: Record<string, string> = {
    info: "#3b82f6", success: "#22c55e", warning: "#f97316", error: "#ef4444",
  }
  const activeColor = block.infoColor || styleColorMap[block.infoStyle] || "#3b82f6"
  const activeIcon = block.infoIcon || "i"

  const initHsl = hexToHsl(activeColor)
  const [hue, setHue] = useState(initHsl.h)
  const [lightness, setLightness] = useState(initHsl.l)

  // Синхронизируем слайдеры при внешнем изменении цвета
  useEffect(() => {
    const h = hexToHsl(activeColor)
    setHue(h.h)
    setLightness(h.l)
  }, [activeColor])

  // Инициализируем innerHTML только при первом монте или смене блока.
  // Дальше React НЕ трогает DOM — выделение и курсор не сбрасываются.
  useEffect(() => {
    if (!contentRef.current) return
    if (blockIdRef.current !== block.id) {
      blockIdRef.current = block.id
      contentRef.current.innerHTML = block.content || ""
    }
  }, [block.id, block.content])

  useEffect(() => {
    if (contentRef.current && contentRef.current.innerHTML === "") {
      contentRef.current.innerHTML = block.content || ""
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // close on outside click
  useEffect(() => {
    if (!showSettings) return
    const handler = (e: MouseEvent) => {
      if (
        settingsRef.current && !settingsRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) setShowSettings(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [showSettings])

  const applyColor = (hex: string) => {
    onUpdate({ infoColor: hex })
  }

  const applySliders = (h: number, l: number) => {
    onUpdate({ infoColor: hslToHex(h, 70, l) })
  }

  const syncContent = () => {
    if (contentRef.current) {
      onUpdate({ content: contentRef.current.innerHTML })
    }
  }

  const saveSelection = () => {
    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0) savedRangeRef.current = sel.getRangeAt(0).cloneRange()
  }

  const insertAndSync = (text: string) => {
    if (!contentRef.current) return
    contentRef.current.focus()
    if (savedRangeRef.current) {
      const sel = window.getSelection()
      if (sel) { sel.removeAllRanges(); sel.addRange(savedRangeRef.current) }
    }
    insertAtCursor(contentRef, text, syncContent)
    setShowEmoji(false)
    setShowTags(false)
  }

  // Закрытие emoji/tags попапов по клику вне
  useEffect(() => {
    if (!showEmoji && !showTags) return
    const handler = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest("[data-info-popup]")) {
        setShowEmoji(false)
        setShowTags(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [showEmoji, showTags])

  const cardStyle: React.CSSProperties = {
    borderLeft: `4px solid ${activeColor}`,
    background: `${activeColor}1A`,
    borderRadius: "8px",
    padding: "16px",
  }

  return (
    <div className="relative flex gap-3 items-center" style={cardStyle}>
      {/* Иконка слева — символ 24px цвета акцента, без кружка, по центру высоты */}
      <div
        className="flex-shrink-0 flex items-center justify-center font-bold select-none leading-none"
        style={{ fontSize: 48, color: activeColor, minWidth: 52 }}
      >
        {activeIcon}
      </div>

      {/* Текст справа */}
      <div className="flex-1 min-w-0 relative">
        <div
          ref={contentRef}
          contentEditable
          suppressContentEditableWarning
          data-main-editor="true"
          onInput={syncContent}
          className="text-base leading-relaxed outline-none empty:before:content-['Введите_текст...'] empty:before:text-muted-foreground/50 pr-14"
          style={{ direction: "ltr", unicodeBidi: "plaintext" }}
        />

        {/* Emoji & tag buttons — абсолютно справа, не добавляют высоту */}
        <div className="absolute top-0 right-0 flex items-center gap-0.5">
          {/* Emoji button */}
          <div className="relative" data-info-popup>
            <button
              ref={emojiBtnRef}
              onMouseDown={(e) => {
                e.preventDefault()
                saveSelection()
                setShowTags(false)
                if (!showEmoji && emojiBtnRef.current) {
                  const rect = emojiBtnRef.current.getBoundingClientRect()
                  const spaceBelow = window.innerHeight - rect.bottom - 8
                  const spaceAbove = rect.top - 8
                  if (spaceBelow >= 300 || spaceBelow >= spaceAbove) {
                    setEmojiPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
                  } else {
                    setEmojiPos({ bottom: window.innerHeight - rect.top + 4, right: window.innerWidth - rect.right })
                  }
                }
                setShowEmoji((v) => !v)
              }}
              title="Вставить эмодзи"
              className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-black/10 transition-colors text-sm"
            >😊</button>
            <InlineEmojiPicker
              isOpen={showEmoji}
              positionStyle={emojiPos}
              searchRef={emojiSearchRef}
              onSelect={(e) => { insertAndSync(e); setShowEmoji(false) }}
            />
          </div>
          {/* Tag button */}
          <div className="relative" data-info-popup>
            <button
              ref={tagsBtnRef}
              onMouseDown={(e) => {
                e.preventDefault()
                saveSelection()
                setShowEmoji(false)
                if (!showTags && tagsBtnRef.current) {
                  const rect = tagsBtnRef.current.getBoundingClientRect()
                  setTagsOpenUpward(window.innerHeight - rect.bottom < 300)
                }
                setShowTags((v) => !v)
              }}
              title="Вставить переменную"
              className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-black/10 transition-colors text-xs font-bold"
            >#</button>
            {showTags && (
              <div
                data-info-popup
                className="fixed z-[200] bg-popover border border-border rounded-xl shadow-xl overflow-hidden w-52"
                style={tagsBtnRef.current ? (() => {
                  const r = tagsBtnRef.current!.getBoundingClientRect()
                  return tagsOpenUpward
                    ? { bottom: window.innerHeight - r.top + 4, right: window.innerWidth - r.right }
                    : { top: r.bottom + 4, right: window.innerWidth - r.right }
                })() : {}}
              >
                <div className="px-3 py-1.5 border-b border-border">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Переменные</span>
                </div>
                <div className="p-1">
                  {QUICK_TAGS.map((t) => (
                    <button key={t.tag} onMouseDown={(ev) => { ev.preventDefault(); insertAndSync(t.tag) }}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left hover:bg-muted transition-colors">
                      <span className="font-mono text-[11px] text-primary bg-primary/10 rounded px-1 py-0.5 shrink-0">{t.tag}</span>
                      <span className="text-xs text-muted-foreground truncate">{t.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Кнопка ⋮ настроек */}
      <button
        ref={btnRef}
        onClick={() => setShowSettings((v) => !v)}
        className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded hover:bg-black/10 transition-colors text-foreground/50"
        title="Настройки"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>

      {/* Попап настроек */}
      {showSettings && (
        <div
          ref={settingsRef}
          className="absolute right-0 top-8 z-50 bg-popover border border-border rounded-xl shadow-xl p-3 w-[272px]"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* Выбор иконки */}
          <p className="text-xs font-medium text-muted-foreground mb-2">Иконка</p>
          <div className="grid grid-cols-6 gap-1.5 mb-3">
            {INFO_ICONS.map(({ symbol, label }) => (
              <button
                key={symbol}
                title={label}
                onClick={() => onUpdate({ infoIcon: symbol })}
                className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-all hover:scale-105"
                style={
                  activeIcon === symbol
                    ? { backgroundColor: activeColor, color: "#fff" }
                    : { backgroundColor: activeColor + "22", color: activeColor }
                }
              >
                {symbol}
              </button>
            ))}
          </div>

          {/* Пресеты цветов */}
          <p className="text-xs font-medium text-muted-foreground mb-2">Цвет</p>
          <div className="flex gap-1.5 mb-3">
            {INFO_PRESET_COLORS.map(({ hex, label }) => (
              <button
                key={hex}
                title={label}
                onClick={() => applyColor(hex)}
                className={cn(
                  "w-8 h-8 rounded-full transition-all hover:scale-105 flex-shrink-0",
                  activeColor.toLowerCase() === hex
                    ? "ring-2 ring-offset-2 ring-foreground/50 scale-110"
                    : ""
                )}
                style={{ backgroundColor: hex }}
              />
            ))}
          </div>

          {/* Шкала Оттенок */}
          <p className="text-xs text-muted-foreground mb-1">Оттенок</p>
          <div className="relative h-4 mb-3">
            <div
              className="absolute inset-0 rounded-full"
              style={{ background: "linear-gradient(to right,hsl(0,70%,55%),hsl(30,70%,55%),hsl(60,70%,55%),hsl(120,70%,55%),hsl(180,70%,55%),hsl(240,70%,55%),hsl(300,70%,55%),hsl(360,70%,55%))" }}
            />
            <input
              type="range" min={0} max={360} value={hue}
              onChange={(e) => { const h = Number(e.target.value); setHue(h); applySliders(h, lightness) }}
              className="absolute inset-0 w-full opacity-0 cursor-pointer"
            />
            <div
              className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-white shadow pointer-events-none"
              style={{ left: `calc(${hue / 360 * 100}% - 8px)`, backgroundColor: hslToHex(hue, 70, lightness) }}
            />
          </div>

          {/* Шкала Яркость */}
          <p className="text-xs text-muted-foreground mb-1">Яркость</p>
          <div className="relative h-4">
            <div
              className="absolute inset-0 rounded-full"
              style={{ background: `linear-gradient(to right,hsl(${hue},70%,20%),hsl(${hue},70%,50%),hsl(${hue},70%,80%))` }}
            />
            <input
              type="range" min={20} max={75} value={lightness}
              onChange={(e) => { const l = Number(e.target.value); setLightness(l); applySliders(hue, l) }}
              className="absolute inset-0 w-full opacity-0 cursor-pointer"
            />
            <div
              className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-white shadow pointer-events-none"
              style={{ left: `calc(${(lightness - 20) / 55 * 100}% - 8px)`, backgroundColor: hslToHex(hue, 70, lightness) }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// Имена эмодзи для поиска (русские + английские ключевые слова)
const EMOJI_NAMES: Record<string, string> = {
  "😀":"улыбка радость смех","😊":"улыбка счастье","😄":"смех радость","😎":"крутой очки","🤩":"восторг звезда","😍":"влюблён сердце","🥳":"праздник вечеринка","😌":"спокойствие покой","🤔":"думаю размышление","😅":"нервный пот смех","😂":"смех слёзы","🥰":"любовь обнимашки","😇":"ангел добро","😜":"язык шутка","🤗":"обнимашки радость","😏":"усмешка хитрость","😴":"сон усталость","🤓":"очки умный","😆":"смех","😋":"вкусно язык","🤨":"скептик бровь","😐":"нейтральный","😑":"раздражение","🥴":"пьяный","😬":"нервы скрежет","🙃":"перевёрнутый иронично","😪":"сонный усталость",
  "✅":"галочка да ок верно","❌":"крест нет отмена","⚠️":"предупреждение осторожно","ℹ️":"информация","❓":"вопрос","❗":"восклицание важно","🔴":"красный круг","🟡":"жёлтый круг","🟢":"зелёный круг","🔵":"синий круг","💜":"сердце фиолетовый","🔗":"ссылка цепочка","🔔":"колокол уведомление","🔕":"без звука","💫":"звезда блеск","✨":"блеск магия","🏆":"кубок победа","🎯":"цель мишень","💡":"идея лампочка","🔒":"замок безопасность","💎":"бриллиант","🎁":"подарок","🎀":"бант","🏅":"медаль",
  "👋":"привет рука","👍":"лайк хорошо","👎":"дизлайк плохо","🙌":"аплодисменты","🤝":"рукопожатие","🙏":"спасибо просьба","💪":"сила мышца","✌️":"победа два мир","🤞":"удача крест пальцы","👏":"хлопки аплодисменты","🫶":"сердце руки","🤜":"кулак удар","🤛":"кулак удар","☝️":"один указание","👆":"вверх","👇":"вниз","👈":"влево","👉":"вправо","🤙":"позвони","🖐":"стоп рука","✋":"стоп рука","🤚":"рука","🖖":"вулкан","🤘":"рок","🤟":"ай лав ю","🖕":"средний",
  "💼":"работа портфель","📝":"заметка ручка","📊":"диаграмма","📈":"рост график","📉":"падение график","💰":"деньги мешок","💳":"карта оплата","🏦":"банк","📌":"булавка закреплено","📎":"скрепка","✂️":"ножницы","📅":"календарь дата","📋":"список буфер","📁":"папка","🔑":"ключ доступ","🖥":"компьютер монитор","⌨️":"клавиатура","🖨":"принтер","📱":"телефон мобильный","☎️":"телефон","📞":"звонок","📠":"факс","🗂":"вкладки","🗃":"картотека","🗄":"шкаф",
  "👤":"человек профиль","👥":"люди группа","🧠":"мозг","👶":"ребёнок","👧":"девочка","👦":"мальчик","👩":"женщина","👨":"мужчина","👴":"дед","👵":"бабушка","🧑":"человек","👮":"полиция","💂":"охрана","🧑‍💼":"менеджер","👷":"строитель","🧑‍🔬":"учёный","🧑‍🎓":"студент","🧑‍🏫":"учитель","🧑‍⚕️":"врач","🧑‍🍳":"повар","🧑‍🎨":"художник","🧑‍✈️":"пилот","👸":"принцесса","🤴":"принц","🦸":"герой","🦹":"злодей",
  "🚀":"ракета","✈️":"самолёт","🚗":"машина автомобиль","🚕":"такси","🚌":"автобус","🚎":"троллейбус","🏎":"гонка","🚂":"поезд","🚢":"корабль","🛸":"нло тарелка","🚁":"вертолёт","🛵":"скутер","🚲":"велосипед","🛴":"самокат","🏍":"мотоцикл","⛵":"яхта парус","🛥":"лодка","🚤":"катер","🛺":"рикша","🚐":"микроавтобус","🚑":"скорая помощь","🚒":"пожарная","🚓":"полиция","🛻":"пикап","🚚":"грузовик","🚛":"фура",
  "🌸":"цветок сакура","🌺":"цветок","🌻":"подсолнух","🌿":"трава листья","🍀":"клевер удача","🌊":"волна море","🏔":"гора","🌙":"луна ночь","⭐":"звезда","☀️":"солнце","🌈":"радуга","❄️":"снег зима","🔥":"огонь жар","⚡":"молния","🌍":"земля мир","🌲":"дерево лес","🌴":"пальма","🌵":"кактус","🍄":"гриб","🌾":"колос поле","🍂":"осень листья","🍁":"клён осень","🌰":"каштан","🐚":"ракушка","🪸":"коралл","🪨":"камень",
  "🐱":"кот кошка","🐶":"собака пёс","🦊":"лиса","🐻":"медведь","🐼":"панда","🦁":"лев","🐯":"тигр","🐸":"лягушка","🐧":"пингвин","🦋":"бабочка","🐝":"пчела","🦄":"единорог","🦅":"орёл","🐠":"рыба","🦀":"краб","🐙":"осьминог","🐄":"корова","🐷":"свинья","🐔":"курица","🦆":"утка","🐺":"волк","🦝":"енот","🦨":"скунс","🦡":"барсук","🐿":"белка","🦔":"ёж",
  "⚽":"футбол мяч","🏓":"падел теннис настольный","🎾":"теннис ракетка","🏀":"баскетбол","🏈":"американский футбол","⚾":"бейсбол","🎱":"бильярд","🏐":"волейбол","🏉":"регби","🥏":"фрисби","🏸":"бадминтон","🏒":"хоккей","🥊":"бокс перчатки","🥋":"единоборства","🎿":"лыжи","⛷️":"лыжник","🏂":"сноуборд","🏋️":"штанга зал","🤸":"гимнастика","🏊":"плавание","🚴":"велосипед спорт","🧘":"йога медитация","🏄":"сёрфинг","🤽":"водное поло","🎯":"дартс цель","🎳":"боулинг","🏆":"кубок победа","🥇":"золото первое место","🥈":"серебро","🥉":"бронза",
}

function EmojiBtn({ current, onSelect }: { current: string; onSelect: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const [activeCategory, setActiveCategory] = useState(Object.keys(CATEGORIES)[0])
  const [search, setSearch] = useState("")
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; availH: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const PICKER_WIDTH = 9 * 37 + 16

  // Результаты поиска — по всем эмодзи всех категорий
  const searchResults = search.trim()
    ? Object.values(CATEGORIES).flat().filter((e) => {
        const q = search.toLowerCase()
        return (EMOJI_NAMES[e] || "").toLowerCase().includes(q) || e.includes(q)
      })
    : null

  const displayEmojis = searchResults ?? CATEGORIES[activeCategory] ?? []

  const openPicker = () => {
    if (!btnRef.current) return
    const rect = btnRef.current.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom - 8
    const spaceAbove = rect.top - 8
    const left = Math.min(rect.left, window.innerWidth - PICKER_WIDTH - 8)
    if (spaceBelow >= 300 || spaceBelow >= spaceAbove) {
      setPos({ top: rect.bottom + 4, left, availH: spaceBelow })
    } else {
      setPos({ bottom: window.innerHeight - rect.top + 4, left, availH: spaceAbove })
    }
    setSearch("")
    setOpen(true)
  }

  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 50)
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (btnRef.current && !btnRef.current.contains(target)) {
        const picker = document.getElementById("lesson-emoji-picker")
        if (!picker || !picker.contains(target)) setOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  return (
    <>
      <button
        ref={btnRef}
        onClick={openPicker}
        className="text-[1.44rem] leading-none hover:opacity-70 transition-opacity flex-shrink-0 cursor-pointer"
        title="Сменить эмодзи"
      >
        {current || "📝"}
      </button>

      {open && pos && typeof document !== "undefined" && (
        <div
          id="lesson-emoji-picker"
          style={{ position: "fixed", top: pos.top, bottom: pos.bottom, left: pos.left, width: PICKER_WIDTH, zIndex: 9999, maxHeight: Math.min(560, pos.availH) }}
          className="bg-popover border border-border rounded-xl shadow-xl p-2 flex flex-col gap-1"
        >
          {/* Поиск */}
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск эмодзи..."
            className="w-full text-xs border border-border rounded-lg px-2.5 py-1.5 outline-none focus:border-primary/50 bg-muted/30 placeholder:text-muted-foreground/50"
          />

          {/* Быстрый доступ — скрываем при поиске */}
          {!search && (
            <div className="grid grid-cols-9 gap-0 pb-1 border-b border-border">
              {QUICK.map((e) => (
                <button key={e} onClick={() => { onSelect(e); setOpen(false) }}
                  className={cn("w-[37px] h-[37px] text-[1.44rem] flex items-center justify-center rounded transition-colors leading-none",
                    current === e ? "bg-primary/10 ring-1 ring-primary" : "hover:bg-muted")}
                >{e}</button>
              ))}
            </div>
          )}

          {/* Сетка эмодзи */}
          <div className="grid grid-cols-9 gap-0 overflow-y-auto flex-1 min-h-0">
            {displayEmojis.length > 0
              ? displayEmojis.map((e, i) => (
                  <button key={i} onClick={() => { onSelect(e); setOpen(false) }}
                    title={EMOJI_NAMES[e] || e}
                    className={cn("w-[37px] h-[37px] text-[1.44rem] flex items-center justify-center rounded hover:bg-muted transition-colors leading-none",
                      current === e && "bg-primary/10 ring-1 ring-primary")}
                  >{e}</button>
                ))
              : <p className="col-span-9 text-xs text-muted-foreground text-center py-4">Ничего не найдено</p>
            }
          </div>

          {/* Категории в 2 ряда */}
          {!search && (
            <div className="flex flex-wrap gap-1 border-t border-border pt-1">
              {Object.keys(CATEGORIES).map((cat) => (
                <button key={cat} onClick={() => setActiveCategory(cat)}
                  className={cn("text-xs px-2 py-1 rounded-lg transition-all",
                    activeCategory === cat ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground")}
                >{cat}</button>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  )
}


// ─── Task preview (interactive, candidate view) ────────────────────────────

function TaskPreviewBlock({ block }: { block: Block }) {
  const [yesno, setYesno] = useState<Record<string, "yes" | "no" | null>>({})
  const [single, setSingle] = useState<Record<string, number | null>>({})
  const [multi, setMulti] = useState<Record<string, Set<number>>>({})
  const [sortItems, setSortItems] = useState<Record<string, string[]>>(() => {
    const init: Record<string, string[]> = {}
    block.questions.forEach((q) => { if (q.answerType === "sort") init[q.id] = [...q.options] })
    return init
  })
  const [dragSortId, setDragSortId] = useState<string | null>(null)
  const [dragSortIdx, setDragSortIdx] = useState<number | null>(null)

  const moveSort = (qid: string, from: number, to: number) => {
    setSortItems((prev) => {
      const arr = [...(prev[qid] || [])]
      const [item] = arr.splice(from, 1)
      arr.splice(to, 0, item)
      return { ...prev, [qid]: arr }
    })
  }

  return (
    <div className="rounded-xl border border-border p-5 space-y-6">
      {block.taskTitle?.trim() && (
        <h3 className="text-base font-semibold">{block.taskTitle}</h3>
      )}
      {block.taskDescription?.trim() && (
        <p className="text-sm text-muted-foreground -mt-4">{block.taskDescription}</p>
      )}
      {block.questions.map((q, i) => (
        <div key={q.id} className="space-y-2.5">
          {/* Вопрос */}
          <p className="text-sm font-medium">
            {i + 1}. {q.text}
            {q.required && <span className="text-destructive ml-0.5">*</span>}
          </p>

          {/* Короткий текст */}
          {q.answerType === "short" && (
            <input
              className="w-full border border-border rounded-lg px-3 h-9 text-sm bg-background outline-none focus:border-primary/50 placeholder:text-muted-foreground/40"
              placeholder="Ваш ответ..."
            />
          )}

          {/* Длинный текст */}
          {q.answerType === "long" && (
            <textarea
              rows={3}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background outline-none focus:border-primary/50 resize-y placeholder:text-muted-foreground/40"
              placeholder="Развёрнутый ответ..."
            />
          )}

          {/* Да/Нет — нейтральные цвета, без подсказки правильного */}
          {q.answerType === "yesno" && (
            <div className="flex gap-2">
              {(["yes", "no"] as const).map((v) => {
                const isSelected = yesno[q.id] === v
                return (
                  <button
                    key={v}
                    onClick={() => setYesno((p) => ({ ...p, [q.id]: p[q.id] === v ? null : v }))}
                    className={cn(
                      "px-8 py-2 rounded-lg text-sm font-medium border transition-all",
                      isSelected
                        ? "bg-primary border-primary text-primary-foreground"
                        : "border-border hover:border-primary/50 bg-background"
                    )}
                  >{v === "yes" ? "Да" : "Нет"}</button>
                )
              })}
            </div>
          )}

          {/* Один из списка — нейтральное radio */}
          {q.answerType === "single" && q.options.length > 0 && (
            <div className="space-y-2">
              {q.options.map((opt, oi) => {
                const isSelected = single[q.id] === oi
                return (
                  <label key={oi} className="flex items-center gap-2.5 cursor-pointer group">
                    <div
                      onClick={() => setSingle((p) => ({ ...p, [q.id]: oi }))}
                      className={cn(
                        "w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-all",
                        isSelected ? "border-primary" : "border-border group-hover:border-primary/50"
                      )}
                    >
                      {isSelected && <div className="w-2 h-2 rounded-full bg-primary" />}
                    </div>
                    <span className="text-sm">{opt}</span>
                  </label>
                )
              })}
            </div>
          )}

          {/* Несколько из списка — нейтральные чекбоксы */}
          {q.answerType === "multiple" && q.options.length > 0 && (
            <div className="space-y-2">
              {q.options.map((opt, oi) => {
                const checked = multi[q.id]?.has(oi)
                return (
                  <label key={oi} className="flex items-center gap-2.5 cursor-pointer group">
                    <div
                      onClick={() => setMulti((p) => {
                        const s = new Set(p[q.id] || [])
                        checked ? s.delete(oi) : s.add(oi)
                        return { ...p, [q.id]: s }
                      })}
                      className={cn(
                        "w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-all",
                        checked ? "border-primary bg-primary" : "border-border group-hover:border-primary/50"
                      )}
                    >
                      {checked && <span className="text-primary-foreground text-[10px] leading-none">✓</span>}
                    </div>
                    <span className="text-sm">{opt}</span>
                  </label>
                )
              })}
            </div>
          )}

          {/* Расставить по порядку */}
          {q.answerType === "sort" && (
            <div className="space-y-1.5">
              {(sortItems[q.id] || q.options).map((item, oi) => (
                <div
                  key={`${q.id}-${oi}`}
                  draggable
                  onDragStart={() => { setDragSortId(q.id); setDragSortIdx(oi) }}
                  onDragOver={(e) => { e.preventDefault() }}
                  onDrop={() => {
                    if (dragSortId === q.id && dragSortIdx !== null && dragSortIdx !== oi)
                      moveSort(q.id, dragSortIdx, oi)
                    setDragSortId(null); setDragSortIdx(null)
                  }}
                  className="flex items-center gap-2 border border-border rounded-lg px-3 py-2 bg-background cursor-grab active:cursor-grabbing hover:border-primary/40 transition-colors"
                >
                  <GripVertical className="w-4 h-4 text-muted-foreground/40 shrink-0" />
                  <span className="text-sm flex-1">{item}</span>
                  <div className="flex gap-1 sm:hidden">
                    <button onClick={() => oi > 0 && moveSort(q.id, oi, oi - 1)} className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted">
                      <ArrowUp className="w-3 h-3" />
                    </button>
                    <button onClick={() => oi < (sortItems[q.id] || q.options).length - 1 && moveSort(q.id, oi, oi + 1)} className="w-6 h-6 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted">
                      <ArrowDown className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Разделитель между вопросами (кроме последнего) */}
          {i < block.questions.length - 1 && (
            <div className="border-b border-border/40 pt-2" />
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Preview block (candidate view) ───────────────────────────────────────

function SimplePreviewBlock({ block }: { block: Block }) {
  switch (block.type) {
    case "text": {
      const html = block.content?.trim()
      if (!html || html === "<br>") return null
      return <div className="prose prose-sm max-w-none dark:prose-invert" dangerouslySetInnerHTML={{ __html: block.content }} />
    }
    case "image": {
      if (!block.imageUrl) return null
      const layout = block.imageLayout || "full"
      const isSide = layout === "image-left" || layout === "image-right"
      return (
        <div className={cn("flex gap-3", isSide ? (layout === "image-left" ? "flex-row" : "flex-row-reverse") : "flex-col")}>
          <div className={cn("flex flex-col min-w-0", isSide ? "w-1/2 shrink-0" : "w-full")}>
            {block.imageTitleTop && <div className="text-xs text-muted-foreground italic leading-snug mb-1 truncate max-w-full" dangerouslySetInnerHTML={{ __html: block.imageTitleTop }} />}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={block.imageUrl} alt="" className="rounded-xl w-full h-48 object-cover" />
            {block.imageCaption && <div className="text-xs text-muted-foreground italic leading-snug mt-1 truncate max-w-full" dangerouslySetInnerHTML={{ __html: block.imageCaption }} />}
          </div>
          {isSide && block.content && (
            <div className="flex-1 text-sm leading-relaxed overflow-y-auto prose prose-sm max-w-none dark:prose-invert" style={{ maxHeight: "12rem" }} dangerouslySetInnerHTML={{ __html: block.content }} />
          )}
        </div>
      )
    }
    case "video": {
      if (!block.videoUrl) return null
      const layout = (block.videoLayout || "full") as string
      const isSide = layout === "video-left" || layout === "video-right"
      const embed = detectVideoService(block.videoUrl)
      return (
        <div className={cn("flex gap-3", isSide ? (layout === "video-left" ? "flex-row" : "flex-row-reverse") : "flex-col")}>
          <div className={cn("flex flex-col min-w-0", isSide ? "w-1/2 shrink-0" : "w-full")}>
            {block.videoTitleTop && <div className="text-xs text-muted-foreground italic leading-snug mb-1 truncate max-w-full" dangerouslySetInnerHTML={{ __html: block.videoTitleTop }} />}
            <div className="aspect-video rounded-xl bg-black overflow-hidden">
              {embed ? (
                <iframe src={embed.embedUrl} className="w-full h-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen title="video" />
              ) : (
                <video src={block.videoUrl} controls className="w-full h-full object-contain" />
              )}
            </div>
            {block.videoCaption && <div className="text-xs text-muted-foreground italic leading-snug mt-1 truncate max-w-full" dangerouslySetInnerHTML={{ __html: block.videoCaption }} />}
          </div>
          {isSide && block.content && (
            <div className="flex-1 text-sm leading-relaxed prose prose-sm max-w-none dark:prose-invert" dangerouslySetInnerHTML={{ __html: block.content }} />
          )}
        </div>
      )
    }
    case "audio": {
      if (!block.audioUrl) return null
      const layout = block.audioLayout || "full"
      const isSide = layout === "audio-left" || layout === "audio-right"
      return (
        <div className={cn("flex gap-3 items-start", isSide ? (layout === "audio-left" ? "flex-row" : "flex-row-reverse") : "flex-col")}>
          <div className={cn("flex flex-col", isSide ? "w-1/2 shrink-0" : "w-full")}>
            {block.audioTitleTop && <p className="text-xs text-muted-foreground italic leading-snug mb-1">{block.audioTitleTop}</p>}
            {block.audioTitle && <p className="text-xs font-medium text-foreground">{block.audioTitle}</p>}
            <audio src={block.audioUrl} controls className="w-full" />
            {block.audioCaption && <p className="text-xs text-muted-foreground italic leading-snug mt-1">{block.audioCaption}</p>}
          </div>
          {isSide && block.content && (
            <p className="flex-1 text-sm leading-relaxed whitespace-pre-wrap">{block.content}</p>
          )}
        </div>
      )
    }
    case "file": {
      if (!block.fileUrl) return null
      const layout = block.fileLayout || "full"
      const isSide = layout === "file-left" || layout === "file-right"
      return (
        <div className={cn("flex gap-3 items-start", isSide ? (layout === "file-left" ? "flex-row" : "flex-row-reverse") : "flex-col")}>
          <div className={cn("flex flex-col gap-1.5", isSide ? "w-1/2 shrink-0" : "w-full")}>
            {block.fileTitleTop && <p className="text-xs text-muted-foreground leading-snug">{block.fileTitleTop}</p>}
            <div className="flex items-center gap-3 p-3 bg-muted/30 rounded-xl border border-border">
              <FileText className="w-7 h-7 text-primary shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{block.fileName || "Файл"}</p>
                <a href={block.fileUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">Открыть</a>
              </div>
            </div>
            {block.fileCaption && <p className="text-xs text-muted-foreground leading-snug">{block.fileCaption}</p>}
          </div>
          {isSide && block.content && (
            <p className="flex-1 text-sm leading-relaxed whitespace-pre-wrap">{block.content}</p>
          )}
        </div>
      )
    }
    case "info": {
      if (!block.content?.trim()) return null
      const styleColorMap: Record<string, string> = {
        info: "#3b82f6", success: "#22c55e", warning: "#f97316", error: "#ef4444",
      }
      const color = block.infoColor || styleColorMap[block.infoStyle] || "#3b82f6"
      const icon = block.infoIcon || "i"
      return (
        <div
          className="flex gap-3 items-start"
          style={{ borderLeft: `4px solid ${color}`, background: `${color}1A`, borderRadius: "8px", padding: "16px" }}
        >
          <div
            className="flex-shrink-0 flex items-center justify-center font-bold select-none leading-none mt-0.5"
            style={{ fontSize: 48, color, minWidth: 52 }}
          >
            {icon}
          </div>
          <div
            className="flex-1 min-w-0 text-base leading-relaxed"
            dangerouslySetInnerHTML={{ __html: block.content }}
          />
        </div>
      )
    }
    case "button": {
      if (!block.buttonText?.trim() && !block.buttonUrl?.trim()) return null
      const btnColor = block.buttonColor || ""
      const isPrimary = block.buttonVariant === "primary"
      const previewStyle: React.CSSProperties = btnColor
        ? isPrimary
          ? { backgroundColor: btnColor, borderColor: btnColor, color: "#fff" }
          : { borderColor: btnColor, color: btnColor }
        : {}
      return (
        <div className="flex justify-center">
          <a
            href={block.buttonUrl || "#"}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all",
              isPrimary
                ? btnColor ? "text-white" : "bg-primary text-primary-foreground hover:bg-primary/90"
                : btnColor ? "bg-transparent border hover:bg-muted/50" : "border border-border hover:bg-muted/50"
            )}
            style={previewStyle}
          >
            {block.buttonIconBefore && <span>{block.buttonIconBefore}</span>}
            {block.buttonText || "Кнопка"}
            {block.buttonIconAfter && <span>{block.buttonIconAfter}</span>}
          </a>
        </div>
      )
    }
    case "task":
      if (!block.taskTitle?.trim() && !block.taskDescription?.trim() && block.questions.length === 0) return null
      return <TaskPreviewBlock block={block} />
    default:
      return null
  }
}
