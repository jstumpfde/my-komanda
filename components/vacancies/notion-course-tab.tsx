"use client"

import { useState, useEffect, useRef, useCallback, useId } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import {
  Plus, Trash2, GripVertical, ChevronDown,
  Type, Heading1, Heading2, Heading3,
  Image, Video, Music, Save, BookOpen,
  Check, X, AlignLeft, ToggleLeft,
  CheckSquare,
} from "lucide-react"

// ─── Типы ────────────────────────────────────────────────────

type NotionBlockType =
  | "text" | "h1" | "h2" | "h3"
  | "image" | "video" | "audio"
  | "question_yesno" | "question_single" | "question_multiple"

interface NotionBlock {
  id: string
  type: NotionBlockType
  // text / headings
  content: string
  // image / video / audio
  fileUrl?: string
  fileName?: string
  // questions
  questionText?: string
  options?: string[]          // single / multiple
  correctOptions?: number[]   // индексы правильных для multiple
  correctAnswer?: boolean     // для yesno
}

interface NotionLesson {
  id: string
  title: string
  blocks: NotionBlock[]
}

interface NotionDemo {
  id: string
  title: string
  lessons: NotionLesson[]
  updatedAt: string
}

// ─── Helpers ─────────────────────────────────────────────────

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

function emptyBlock(type: NotionBlockType): NotionBlock {
  return {
    id: uid(),
    type,
    content: "",
    questionText: "",
    options: type === "question_single" || type === "question_multiple" ? ["", ""] : [],
    correctOptions: [],
    correctAnswer: true,
  }
}

function emptyLesson(): NotionLesson {
  return { id: uid(), title: "Новый урок", blocks: [emptyBlock("text")] }
}

const STORAGE_KEY = "notion-demo-v1"

function load(): NotionDemo | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function save(demo: NotionDemo) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...demo, updatedAt: new Date().toISOString() }))
  } catch { /* ignore */ }
}

// ─── Описания типов блоков ────────────────────────────────────

const BLOCK_TYPES: { type: NotionBlockType; label: string; icon: React.ReactNode; group: string }[] = [
  { type: "text",    label: "Параграф",    icon: <AlignLeft className="w-4 h-4" />,  group: "Текст" },
  { type: "h1",     label: "Заголовок H1", icon: <Heading1 className="w-4 h-4" />,   group: "Текст" },
  { type: "h2",     label: "Заголовок H2", icon: <Heading2 className="w-4 h-4" />,   group: "Текст" },
  { type: "h3",     label: "Заголовок H3", icon: <Heading3 className="w-4 h-4" />,   group: "Текст" },
  { type: "image",  label: "Картинка",     icon: <Image className="w-4 h-4" />,       group: "Медиа" },
  { type: "video",  label: "Видео",        icon: <Video className="w-4 h-4" />,       group: "Медиа" },
  { type: "audio",  label: "Аудио",        icon: <Music className="w-4 h-4" />,       group: "Медиа" },
  { type: "question_yesno",    label: "Вопрос Да/Нет",         icon: <ToggleLeft className="w-4 h-4" />,   group: "Задания" },
  { type: "question_single",   label: "Один правильный",        icon: <CheckSquare className="w-4 h-4" />,  group: "Задания" },
  { type: "question_multiple", label: "Несколько правильных",   icon: <Check className="w-4 h-4" />,        group: "Задания" },
]

// ─── Меню добавления блока ────────────────────────────────────

function AddBlockMenu({ onAdd, onClose }: { onAdd: (t: NotionBlockType) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [onClose])

  const groups = Array.from(new Set(BLOCK_TYPES.map(b => b.group)))

  return (
    <div
      ref={ref}
      className="absolute z-50 left-6 top-7 w-52 rounded-xl border border-border bg-popover shadow-lg overflow-hidden"
    >
      {groups.map(group => (
        <div key={group}>
          <p className="px-3 pt-2 pb-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{group}</p>
          {BLOCK_TYPES.filter(b => b.group === group).map(b => (
            <button
              key={b.type}
              className="w-full flex items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-accent transition-colors text-left"
              onMouseDown={e => { e.preventDefault(); onAdd(b.type); onClose() }}
            >
              <span className="text-muted-foreground">{b.icon}</span>
              {b.label}
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}

// ─── Редактор одного блока ────────────────────────────────────

function BlockEditor({
  block,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}: {
  block: NotionBlock
  onChange: (b: NotionBlock) => void
  onDelete: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  isFirst: boolean
  isLast: boolean
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Авторесайз textarea
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${el.scrollHeight}px`
  }, [block.content])

  const textClass = {
    text: "text-sm leading-relaxed",
    h1: "text-2xl font-bold",
    h2: "text-xl font-semibold",
    h3: "text-lg font-semibold",
  }[block.type as "text" | "h1" | "h2" | "h3"]

  const isText = ["text", "h1", "h2", "h3"].includes(block.type)
  const isMedia = ["image", "video", "audio"].includes(block.type)
  const isQuestion = block.type.startsWith("question_")

  return (
    <div className="group relative flex gap-2 items-start py-0.5">
      {/* Drag handle + actions */}
      <div className="flex flex-col items-center gap-0.5 pt-1.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button
          onClick={onMoveUp}
          disabled={isFirst}
          className="p-0.5 rounded text-muted-foreground/50 hover:text-foreground disabled:opacity-20 transition-colors"
          title="Вверх"
        >
          <ChevronDown className="w-3.5 h-3.5 rotate-180" />
        </button>
        <GripVertical className="w-4 h-4 text-muted-foreground/30 cursor-grab" />
        <button
          onClick={onMoveDown}
          disabled={isLast}
          className="p-0.5 rounded text-muted-foreground/50 hover:text-foreground disabled:opacity-20 transition-colors"
          title="Вниз"
        >
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Содержимое блока */}
      <div className="flex-1 min-w-0">
        {/* Текст / заголовки */}
        {isText && (
          <textarea
            ref={textareaRef}
            value={block.content}
            onChange={e => onChange({ ...block, content: e.target.value })}
            placeholder={
              block.type === "h1" ? "Заголовок 1" :
              block.type === "h2" ? "Заголовок 2" :
              block.type === "h3" ? "Заголовок 3" :
              "Введите текст..."
            }
            rows={1}
            className={cn(
              "w-full resize-none bg-transparent border-none outline-none placeholder:text-muted-foreground/40 leading-relaxed",
              textClass
            )}
          />
        )}

        {/* Медиа */}
        {isMedia && (
          <MediaBlock block={block} onChange={onChange} />
        )}

        {/* Вопросы */}
        {isQuestion && (
          <QuestionBlock block={block} onChange={onChange} />
        )}
      </div>

      {/* Удалить */}
      <button
        onClick={onDelete}
        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded text-muted-foreground/40 hover:text-destructive shrink-0 mt-1"
        title="Удалить блок"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

// ─── Медиа-блок ───────────────────────────────────────────────

function MediaBlock({ block, onChange }: { block: NotionBlock; onChange: (b: NotionBlock) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const accept = block.type === "image" ? "image/*" : block.type === "video" ? "video/*" : "audio/*"
  const label = block.type === "image" ? "Картинка" : block.type === "video" ? "Видео" : "Аудио"
  const Icon = block.type === "image" ? Image : block.type === "video" ? Video : Music

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const url = URL.createObjectURL(file)
    onChange({ ...block, fileUrl: url, fileName: file.name })
  }

  if (block.fileUrl) {
    return (
      <div className="rounded-lg border border-border overflow-hidden bg-muted/30">
        {block.type === "image" && (
          <img src={block.fileUrl} alt={block.fileName} className="w-full max-h-72 object-contain" />
        )}
        {block.type === "video" && (
          <video src={block.fileUrl} controls className="w-full max-h-72" />
        )}
        {block.type === "audio" && (
          <div className="p-3">
            <p className="text-xs text-muted-foreground mb-2">{block.fileName}</p>
            <audio src={block.fileUrl} controls className="w-full" />
          </div>
        )}
        <div className="flex items-center justify-between px-3 py-1.5 border-t border-border/50">
          <span className="text-xs text-muted-foreground truncate max-w-[200px]">{block.fileName}</span>
          <button
            onClick={() => onChange({ ...block, fileUrl: undefined, fileName: undefined })}
            className="text-xs text-destructive/70 hover:text-destructive"
          >
            Удалить
          </button>
        </div>
      </div>
    )
  }

  // Video — URL или файл
  if (block.type === "video") {
    return (
      <div className="space-y-2">
        <Input
          placeholder="URL видео (YouTube, Vimeo или прямая ссылка)"
          value={block.content}
          onChange={e => onChange({ ...block, content: e.target.value })}
          className="h-8 text-sm"
        />
        <p className="text-[11px] text-muted-foreground">или</p>
        <button
          onClick={() => inputRef.current?.click()}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-border hover:border-primary/50 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <Icon className="w-4 h-4" /> Загрузить файл
        </button>
        <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={handleFile} />
      </div>
    )
  }

  return (
    <button
      onClick={() => inputRef.current?.click()}
      className="flex items-center gap-2 px-4 py-3 rounded-lg border border-dashed border-border hover:border-primary/50 text-sm text-muted-foreground hover:text-foreground transition-colors w-full justify-center"
    >
      <Icon className="w-4 h-4" /> Загрузить {label.toLowerCase()}
      <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={handleFile} />
    </button>
  )
}

// ─── Вопрос-блок ──────────────────────────────────────────────

function QuestionBlock({ block, onChange }: { block: NotionBlock; onChange: (b: NotionBlock) => void }) {
  const isYesNo = block.type === "question_yesno"
  const isSingle = block.type === "question_single"
  const isMultiple = block.type === "question_multiple"

  const setOption = (idx: number, val: string) => {
    const opts = [...(block.options ?? [])]
    opts[idx] = val
    onChange({ ...block, options: opts })
  }

  const addOption = () => onChange({ ...block, options: [...(block.options ?? []), ""] })

  const removeOption = (idx: number) => {
    const opts = (block.options ?? []).filter((_, i) => i !== idx)
    const correct = (block.correctOptions ?? []).filter(i => i !== idx).map(i => i > idx ? i - 1 : i)
    onChange({ ...block, options: opts, correctOptions: correct })
  }

  const toggleCorrect = (idx: number) => {
    if (isSingle) {
      onChange({ ...block, correctOptions: [idx] })
    } else {
      const prev = block.correctOptions ?? []
      const next = prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx]
      onChange({ ...block, correctOptions: next })
    }
  }

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
      {/* Тип вопроса */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
          {isYesNo ? "Да / Нет" : isSingle ? "Один правильный" : "Несколько правильных"}
        </span>
      </div>

      {/* Текст вопроса */}
      <textarea
        value={block.questionText ?? ""}
        onChange={e => onChange({ ...block, questionText: e.target.value })}
        placeholder="Текст вопроса..."
        rows={2}
        className="w-full resize-none bg-transparent border-none outline-none text-sm placeholder:text-muted-foreground/40 leading-relaxed"
      />

      {/* Да/Нет */}
      {isYesNo && (
        <div className="flex gap-2">
          {[true, false].map(val => (
            <button
              key={String(val)}
              onClick={() => onChange({ ...block, correctAnswer: val })}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors",
                block.correctAnswer === val
                  ? val
                    ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400"
                    : "border-red-400 bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400"
                  : "border-border text-muted-foreground hover:border-primary/40"
              )}
            >
              {val ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
              {val ? "Да" : "Нет"}
              {block.correctAnswer === val && <span className="text-[10px] ml-1">✓ правильный</span>}
            </button>
          ))}
        </div>
      )}

      {/* Варианты ответов */}
      {(isSingle || isMultiple) && (
        <div className="space-y-1.5">
          {(block.options ?? []).map((opt, idx) => {
            const isCorrect = (block.correctOptions ?? []).includes(idx)
            return (
              <div key={idx} className="flex items-center gap-2">
                {/* Чекбокс/радио правильности */}
                <button
                  onClick={() => toggleCorrect(idx)}
                  title={isCorrect ? "Убрать из правильных" : "Отметить правильным"}
                  className={cn(
                    "shrink-0 w-5 h-5 flex items-center justify-center transition-colors",
                    isSingle ? "rounded-full border-2" : "rounded border-2",
                    isCorrect
                      ? "border-emerald-500 bg-emerald-500 text-white"
                      : "border-muted-foreground/30 hover:border-emerald-400"
                  )}
                >
                  {isCorrect && <Check className="w-3 h-3" />}
                </button>

                <input
                  type="text"
                  value={opt}
                  onChange={e => setOption(idx, e.target.value)}
                  placeholder={`Вариант ${idx + 1}`}
                  className="flex-1 bg-transparent border-none outline-none text-sm placeholder:text-muted-foreground/40"
                />

                <button
                  onClick={() => removeOption(idx)}
                  className="shrink-0 text-muted-foreground/30 hover:text-destructive transition-colors"
                  disabled={(block.options ?? []).length <= 2}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )
          })}

          <button
            onClick={addOption}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mt-1"
          >
            <Plus className="w-3.5 h-3.5" /> Добавить вариант
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Кнопка «+» между блоками ─────────────────────────────────

function AddBetween({ onAdd }: { onAdd: (t: NotionBlockType) => void }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative flex items-center gap-2 group/add my-0.5">
      <div className="flex-1 h-px bg-border/0 group-hover/add:bg-border/60 transition-colors" />
      <button
        onClick={() => setOpen(o => !o)}
        className={cn(
          "flex items-center justify-center w-6 h-6 rounded-full border text-muted-foreground transition-all",
          open
            ? "border-primary/60 bg-primary/5 text-primary"
            : "border-border/0 group-hover/add:border-border/60 hover:border-primary/40 hover:text-primary"
        )}
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
      <div className="flex-1 h-px bg-border/0 group-hover/add:bg-border/60 transition-colors" />
      {open && <AddBlockMenu onAdd={onAdd} onClose={() => setOpen(false)} />}
    </div>
  )
}

// ─── Редактор урока ───────────────────────────────────────────

function LessonEditor({
  lesson,
  onChange,
}: {
  lesson: NotionLesson
  onChange: (l: NotionLesson) => void
}) {
  const updateBlock = useCallback((updated: NotionBlock) => {
    onChange({ ...lesson, blocks: lesson.blocks.map(b => b.id === updated.id ? updated : b) })
  }, [lesson, onChange])

  const deleteBlock = useCallback((id: string) => {
    const next = lesson.blocks.filter(b => b.id !== id)
    onChange({ ...lesson, blocks: next.length ? next : [emptyBlock("text")] })
  }, [lesson, onChange])

  const addBlockAt = useCallback((idx: number, type: NotionBlockType) => {
    const block = emptyBlock(type)
    const next = [...lesson.blocks]
    next.splice(idx, 0, block)
    onChange({ ...lesson, blocks: next })
  }, [lesson, onChange])

  const moveBlock = useCallback((idx: number, dir: -1 | 1) => {
    const next = [...lesson.blocks]
    const target = idx + dir
    if (target < 0 || target >= next.length) return
    ;[next[idx], next[target]] = [next[target], next[idx]]
    onChange({ ...lesson, blocks: next })
  }, [lesson, onChange])

  return (
    <div className="space-y-0">
      {/* Кнопка добавить блок до первого */}
      <AddBetween onAdd={type => addBlockAt(0, type)} />

      {lesson.blocks.map((block, idx) => (
        <div key={block.id}>
          <BlockEditor
            block={block}
            onChange={updateBlock}
            onDelete={() => deleteBlock(block.id)}
            onMoveUp={() => moveBlock(idx, -1)}
            onMoveDown={() => moveBlock(idx, 1)}
            isFirst={idx === 0}
            isLast={idx === lesson.blocks.length - 1}
          />
          <AddBetween onAdd={type => addBlockAt(idx + 1, type)} />
        </div>
      ))}
    </div>
  )
}

// ─── Главный компонент ────────────────────────────────────────

export function NotionCourseTab() {
  const [demo, setDemo] = useState<NotionDemo | null>(null)
  const [activeLessonId, setActiveLessonId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState<string | null>(null) // id урока с редактируемым названием
  const [dirty, setDirty] = useState(false)

  // Загрузка
  useEffect(() => {
    const loaded = load()
    if (loaded) {
      setDemo(loaded)
      setActiveLessonId(loaded.lessons[0]?.id ?? null)
    } else {
      const initial: NotionDemo = {
        id: uid(),
        title: "Демонстрация должности",
        lessons: [
          { id: uid(), title: "Введение", blocks: [emptyBlock("text")] },
        ],
        updatedAt: new Date().toISOString(),
      }
      setDemo(initial)
      setActiveLessonId(initial.lessons[0].id)
    }
  }, [])

  // Автосохранение
  useEffect(() => {
    if (!demo || !dirty) return
    const t = setTimeout(() => { save(demo); setDirty(false) }, 800)
    return () => clearTimeout(t)
  }, [demo, dirty])

  const updateDemo = useCallback((next: NotionDemo) => {
    setDemo(next)
    setDirty(true)
  }, [])

  const activeLesson = demo?.lessons.find(l => l.id === activeLessonId) ?? null

  const updateLesson = useCallback((updated: NotionLesson) => {
    if (!demo) return
    updateDemo({ ...demo, lessons: demo.lessons.map(l => l.id === updated.id ? updated : l) })
  }, [demo, updateDemo])

  const addLesson = useCallback(() => {
    if (!demo) return
    const lesson = emptyLesson()
    updateDemo({ ...demo, lessons: [...demo.lessons, lesson] })
    setActiveLessonId(lesson.id)
  }, [demo, updateDemo])

  const deleteLesson = useCallback((id: string) => {
    if (!demo || demo.lessons.length <= 1) { toast.error("Нельзя удалить последний урок"); return }
    const next = demo.lessons.filter(l => l.id !== id)
    updateDemo({ ...demo, lessons: next })
    if (activeLessonId === id) setActiveLessonId(next[0].id)
  }, [demo, updateDemo, activeLessonId])

  const saveNow = () => {
    if (!demo) return
    save(demo)
    setDirty(false)
    toast.success("Сохранено")
  }

  if (!demo) return null

  return (
    <div className="flex h-full min-h-[600px]">
      {/* ─── Боковая панель уроков ─── */}
      <aside className="w-56 shrink-0 border-r border-border flex flex-col bg-muted/20">
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-border">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <BookOpen className="w-3.5 h-3.5" /> Уроки
          </span>
          <span className="text-xs text-muted-foreground">{demo.lessons.length}</span>
        </div>

        <div className="flex-1 overflow-y-auto py-1">
          {demo.lessons.map((lesson, idx) => (
            <div key={lesson.id} className="group relative">
              {editingTitle === lesson.id ? (
                <input
                  autoFocus
                  value={lesson.title}
                  onChange={e => updateLesson({ ...lesson, title: e.target.value })}
                  onBlur={() => setEditingTitle(null)}
                  onKeyDown={e => { if (e.key === "Enter") setEditingTitle(null) }}
                  className="w-full px-3 py-2 text-sm bg-primary/5 border-none outline-none"
                />
              ) : (
                <button
                  onClick={() => setActiveLessonId(lesson.id)}
                  onDoubleClick={() => setEditingTitle(lesson.id)}
                  className={cn(
                    "w-full text-left px-3 py-2 text-sm transition-colors truncate flex items-center gap-2",
                    activeLessonId === lesson.id
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-foreground hover:bg-accent"
                  )}
                >
                  <span className="text-muted-foreground text-xs w-4 shrink-0">{idx + 1}.</span>
                  <span className="truncate">{lesson.title}</span>
                </button>
              )}

              {/* Удалить урок */}
              {demo.lessons.length > 1 && (
                <button
                  onClick={() => deleteLesson(lesson.id)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground/40 hover:text-destructive"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="p-2 border-t border-border">
          <button
            onClick={addLesson}
            className="w-full flex items-center gap-1.5 px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Добавить урок
          </button>
        </div>
      </aside>

      {/* ─── Область редактирования ─── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Шапка */}
        <div className="flex items-center justify-between px-6 py-3 border-b border-border shrink-0">
          {activeLesson ? (
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {editingTitle === activeLesson.id ? (
                <input
                  autoFocus
                  value={activeLesson.title}
                  onChange={e => updateLesson({ ...activeLesson, title: e.target.value })}
                  onBlur={() => setEditingTitle(null)}
                  onKeyDown={e => { if (e.key === "Enter") setEditingTitle(null) }}
                  className="text-lg font-semibold bg-transparent border-b-2 border-primary outline-none flex-1"
                />
              ) : (
                <h2
                  className="text-lg font-semibold text-foreground cursor-text truncate"
                  onDoubleClick={() => setEditingTitle(activeLesson.id)}
                  title="Двойной клик для переименования"
                >
                  {activeLesson.title}
                </h2>
              )}
            </div>
          ) : (
            <span className="text-muted-foreground text-sm">Выберите урок</span>
          )}

          <Button
            size="sm"
            variant={dirty ? "default" : "outline"}
            className="gap-1.5 shrink-0 ml-4"
            onClick={saveNow}
          >
            <Save className="w-3.5 h-3.5" />
            {dirty ? "Сохранить" : "Сохранено"}
          </Button>
        </div>

        {/* Тело редактора */}
        <div className="flex-1 overflow-y-auto">
          {activeLesson ? (
            <div className="max-w-3xl mx-auto px-8 py-6">
              <LessonEditor lesson={activeLesson} onChange={updateLesson} />
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
              Выберите урок слева
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
