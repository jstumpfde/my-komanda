"use client"

import { useState, useRef, useEffect, useCallback, type RefObject, type MutableRefObject } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import {
  ArrowLeft, ArrowUp, ArrowDown, Copy, Trash2, GripVertical, Plus, Save,
  Eye, Sparkles, Rocket, BookOpen, Loader2, X, MoreHorizontal, Pencil, ClipboardPaste,
  Bold, Italic, Underline, Strikethrough, AlignLeft, AlignCenter, AlignRight,
  Heading1, Heading2, Heading3, List as ListIcon, ListOrdered, Link2, Hash, Smile,
  Type, ImageIcon, Video, Music, FileText, Info, MousePointerClick, CheckSquare,
  Upload, Play, Mic, MicOff, FileUp, Square,
  Star, Heart, Zap, Target, Trophy, Briefcase, Users, BarChart3,
  Clock, Check, Flag, Shield, Globe, Camera,
  Lightbulb, Gift, Phone, Mail, Settings, Search, Home,
  Building2, Truck, Palette, Code2, Megaphone, GraduationCap,
} from "lucide-react"
import { toast } from "sonner"
import type { Demo, Block, BlockType, ImageLayout, FileLayout, Question, Lesson } from "@/lib/course-types"
import { VARIABLES, BLOCK_TYPE_META, createBlock, replaceVars } from "@/lib/course-types"
import { LibraryDialog } from "./library-dialog"
import { AiGenerateDialog } from "./ai-generate-dialog"
import { cleanHtml } from "@/lib/clean-html"

interface DemoCardProps {
  demo: Demo
  onBack: () => void
  onUpdate: (demo: Demo) => void
}

const DEMO_QUICK = ["📝","✅","📊","💡","🎯","💼","🏆","🔑","⚠️"]
const DEMO_CATEGORIES: Record<string, string[]> = {
  "😊 Смайлы": ["😀","😊","😄","😁","😆","😅","🤣","😂","🙂","🙃","😉","😌","😍","🥰","😎","🤗","🤔","🧐","🤓","😏","😒","🙄","😬","😔","😪","😷","🤒","🤕","🥺","😢","😭","😤","😠","😡","🤬","😈","💀","😺","😸","😻","😾","🫠","😵","🤯","🥳"],
  "✅ Символы": ["✅","❌","⚠️","ℹ️","❓","❗","🔴","🟡","🟢","🔵","⭐","🌟","💫","✨","🏆","🥇","🥈","🥉","🎯","💡","🔑","🔒","🔓","🛡","💎","🎁","🏅","📍","🔖","🏷️","🔗","🔔","➕","➖","✖️","➗","♾️","🔼","🔽","▶️","⏸️","⏹️","⏺️","🔃","🔀"],
  "👋 Жесты": ["👋","✋","🖐️","🖖","👌","✌️","🤞","👍","👎","✊","👊","👏","🙌","🫶","🤝","🙏","💪","👆","👇","👈","👉","☝️","🤜","🤛","💅","✍️","👀","🧠","👤","👥","🫂","🤲","👐","🤳","🦾","🫵","🤌","🤏","🤟","🤘","🤙","❤️","💙","💚","💛"],
  "💼 Работа": ["💼","📝","📊","📈","📉","💰","💳","🏦","🤝","📌","📎","✂️","📅","📋","📁","💡","🔑","🖥️","💻","⌨️","📱","☎️","📞","📠","📤","📥","📦","📧","✏️","🖊️","📓","📒","📕","📗","📘","📙","📚","📖","🗓️","📇","🗄️","🏢","🏭","🗂️","🔐"],
  "👤 Люди": ["👶","👦","👧","🧑","👨","👩","👴","👵","👮","💂","👷","🤴","👸","🧙","🦸","🦹","👼","🎅","🥷","💆","💇","🧖","🏋️","🧘","🏊","🚴","🤸","🙏","🧠","🕵️","🧑‍💼","🧑‍🎓","🧑‍🏫","🧑‍⚕️","🧑‍🍳","🧑‍🔬","🧑‍🎨","🧑‍✈️","🧑‍🚀","🧑‍🚒","🧑‍⚖️","🧑‍🌾","🧑‍🔧","🧑‍🏭"],
  "🚀 Транспорт": ["🚀","🛸","✈️","🚁","🚢","🚂","🚄","🚇","🚌","🏎️","🚗","🚕","🛻","🚚","🚲","🛵","🏍️","🛴","⛵","🚤","🛥️","🚑","🚒","🚓","🚐","⛽","🚧","⚓","🗺️","🧭","🏔️","🌋","🏕️","🏖️","🏜️","🏝️","🏟️","🏛️","🏗️","🛩️","💺","🛶","🛹","🚦","🚥"],
  "🌸 Природа": ["🌸","🌺","🌻","🌹","🌷","💐","🌿","🍀","🌱","🌲","🌴","🌵","🍃","🍂","🍁","🌾","🍄","🌊","🌙","☀️","🌈","❄️","🔥","⚡","🌍","🌎","🌏","🐱","🐶","🦊","🐻","🐼","🦁","🐯","🐧","🦋","🐝","🦄","🦅","🐠","🦀","🐙","🐳","🐬","🦒"],
}
const DEMO_EMOJI_NAMES: Record<string, string> = {
  "😀":"улыбка","😊":"счастье","😄":"смех","😎":"крутой","🤩":"восторг","😍":"влюблён","🥳":"праздник","😌":"покой","🤔":"думаю","😅":"пот смех","😂":"слёзы смех","🥰":"любовь","😇":"ангел","😜":"шутка","🤗":"обнимашки","😏":"хитрость","😴":"сон","🤓":"умный","😆":"смех","😋":"вкусно","🤨":"скептик","😐":"нейтральный","😑":"раздражение","😬":"нервы","🙃":"иронично","😪":"сонный","✅":"галочка да","❌":"нет отмена","⚠️":"предупреждение","❓":"вопрос","❗":"важно","⭐":"звезда","🌟":"блеск","✨":"магия","🏆":"победа","🎯":"цель","💡":"идея","🔑":"ключ","🔒":"замок","💎":"бриллиант","🎁":"подарок","🏅":"медаль","📍":"место","🔖":"закладка","🔗":"ссылка","🔔":"уведомление","💼":"работа","📝":"заметка","📊":"диаграмма","📈":"рост","📉":"падение","💰":"деньги","💳":"карта","🏦":"банк","📌":"закреплено","📎":"скрепка","📅":"календарь","📋":"список","📁":"папка","💻":"компьютер","📱":"телефон","📧":"почта","✏️":"ручка","📚":"книги","🏢":"офис","👋":"привет","👍":"лайк","👎":"дизлайк","🙌":"аплодисменты","🤝":"рукопожатие","🙏":"спасибо","💪":"сила","✌️":"победа","🤞":"удача","👏":"хлопки","🫶":"сердце руки","👍":"хорошо","💪":"мышца","👀":"глаза","🧠":"мозг","👤":"человек","👥":"люди","❤️":"сердце красное","💙":"сердце синее","💚":"сердце зелёное","🚀":"ракета","✈️":"самолёт","🚗":"машина","🚢":"корабль","🌸":"цветок","🌺":"цветок","🌻":"подсолнух","🌿":"трава","🍀":"клевер","🌊":"море","🌙":"луна","☀️":"солнце","🌈":"радуга","❄️":"снег","🔥":"огонь","⚡":"молния","🌍":"земля","🐱":"кот","🐶":"собака","🦊":"лиса","🐻":"медведь","🦁":"лев","🦋":"бабочка","🦄":"единорог",
}

const LUCIDE_ICONS_FOR_PICKER = [
  "Star","Heart","Zap","Target","Trophy","Briefcase","Users","BarChart3",
  "Rocket","Clock","Check","Flag","Shield","Globe","Camera","Music",
  "BookOpen","Lightbulb","Gift","Phone","Mail","Settings","Search","Home",
  "Building2","Truck","Palette","Code2","Megaphone","GraduationCap",
] as const

const LUCIDE_MAP: Record<string, React.ElementType> = {
  Star, Heart, Zap, Target, Trophy, Briefcase, Users, BarChart3,
  Rocket, Clock, Check, Flag, Shield, Globe, Camera, Music,
  BookOpen, Lightbulb, Gift, Phone, Mail, Settings, Search, Home,
  Building2, Truck, Palette, Code2, Megaphone, GraduationCap,
}

const INFO_STYLES: Record<string, { label: string; cls: string; icon: string; borderColor: string }> = {
  info: { label: "Инфо", cls: "bg-blue-50 dark:bg-blue-950/30", icon: "ℹ️", borderColor: "#3B82F6" },
  warning: { label: "Внимание", cls: "bg-amber-50 dark:bg-amber-950/30", icon: "⚠️", borderColor: "#F59E0B" },
  success: { label: "Успех", cls: "bg-emerald-50 dark:bg-emerald-950/30", icon: "✅", borderColor: "#22C55E" },
  error: { label: "Ошибка", cls: "bg-red-50 dark:bg-red-950/30", icon: "❌", borderColor: "#EF4444" },
}

function getFileIcon(fileName: string): { icon: string; color: string } {
  const ext = fileName.split(".").pop()?.toLowerCase() || ""
  if (ext === "pdf") return { icon: "📕", color: "text-red-600 bg-red-100 dark:bg-red-950" }
  if (["doc", "docx"].includes(ext)) return { icon: "📘", color: "text-blue-600 bg-blue-100 dark:bg-blue-950" }
  if (["xls", "xlsx"].includes(ext)) return { icon: "📗", color: "text-emerald-600 bg-emerald-100 dark:bg-emerald-950" }
  if (["ppt", "pptx"].includes(ext)) return { icon: "📙", color: "text-amber-600 bg-amber-100 dark:bg-amber-950" }
  return { icon: "📄", color: "text-muted-foreground bg-muted" }
}

export function DemoCard({ demo, onBack, onUpdate }: DemoCardProps) {
  const [activeLessonId, setActiveLessonId] = useState(demo.lessons[0]?.id || "")
  const [previewMode, setPreviewMode] = useState(false)
  const [previewIdx, setPreviewIdx] = useState(0)
  const [templateOpen, setTemplateOpen] = useState(false)
  const [dragLessonIdx, setDragLessonIdx] = useState<number | null>(null)
  const [dragOverLessonIdx, setDragOverLessonIdx] = useState<number | null>(null)
  const [renamingLessonId, setRenamingLessonId] = useState<string | null>(null)
  const [copiedLesson, setCopiedLesson] = useState<Lesson | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [savedModules, setSavedModules] = useState<Lesson[]>([])
  const [savedTemplates, setSavedTemplates] = useState<{ title: string; category: string; lessons: Lesson[] }[]>([])
  const [saveModuleDialog, setSaveModuleDialog] = useState<Lesson | null>(null)
  const [saveTemplateDialog, setSaveTemplateDialog] = useState(false)
  const [saveModuleName, setSaveModuleName] = useState("")
  const [saveTemplateName, setSaveTemplateName] = useState("")
  const [saveTemplateCategory, setSaveTemplateCategory] = useState("")
  const [aiModalOpen, setAiModalOpen] = useState(false)
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "idle">("saved")
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Always-fresh ref to demo so callbacks don't close over stale value
  const demoRef = useRef(demo)
  demoRef.current = demo

  const activeLesson = demo.lessons.find((l) => l.id === activeLessonId)

  // === Helpers ===
  const save = useCallback((lessons: Lesson[]) => {
    setSaveStatus("saving")
    const updated = { ...demoRef.current, lessons, updatedAt: new Date() }
    console.log("[DemoCard] save →", updated.id, "lessons:", lessons.length, "blocks:", lessons.reduce((a, l) => a + l.blocks.length, 0))
    onUpdate(updated)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setSaveStatus("saved"), 1000)
  }, [onUpdate])

  // Read all contenteditable blocks in the current lesson and flush their innerHTML into demo state
  const flushContentEditables = useCallback((): Lesson[] => {
    const current = demoRef.current
    const activeId = current.lessons.find((l) =>
      document.querySelector(`[data-lesson-id="${l.id}"]`) !== null
    )?.id
    // Find all text block editors that are visible right now
    const els = document.querySelectorAll<HTMLElement>("[data-block-editor]")
    if (els.length === 0) return current.lessons
    const patches: Record<string, string> = {}
    els.forEach((el) => {
      const blockId = el.dataset.blockEditor
      if (blockId) {
        patches[blockId] = el.innerHTML
        console.log("[DemoCard] flush blockId:", blockId, "html length:", el.innerHTML.length)
      }
    })
    if (Object.keys(patches).length === 0) return current.lessons
    return current.lessons.map((l) => ({
      ...l,
      blocks: l.blocks.map((b) =>
        b.type === "text" && patches[b.id] !== undefined
          ? { ...b, content: patches[b.id] }
          : b
      ),
    }))
  }, [])

  const saveNow = () => {
    // Flush contenteditable content then save
    const flushedLessons = flushContentEditables()
    const updated = { ...demoRef.current, lessons: flushedLessons, updatedAt: new Date() }
    onUpdate(updated)
    setSaveStatus("saved")
    toast.success("Демонстрация сохранена")
    console.log("[DemoCard] saveNow — flushed", flushedLessons.length, "lessons")
  }

  // Sync contentEditable before switching lessons — flush directly to onUpdate, no debounce
  const switchLesson = (id: string) => {
    // 1. Read innerHTML from DOM synchronously before React re-renders
    const flushedLessons = flushContentEditables()
    // 2. Persist immediately (bypass debounce — DOM elements unmount right after setActiveLessonId)
    const updated = { ...demoRef.current, lessons: flushedLessons, updatedAt: new Date() }
    console.log("[DemoCard] switchLesson → flush & save before switch to", id, "blocks saved:", flushedLessons.reduce((a, l) => a + l.blocks.length, 0))
    onUpdate(updated)
    // 3. Switch lesson
    setActiveLessonId(id)
  }

  // Cleanup debounce on unmount
  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current) }, [])

  const updateLesson = (lessonId: string, patch: Partial<Lesson>) => {
    save(demoRef.current.lessons.map((l) => l.id === lessonId ? { ...l, ...patch } : l))
  }

  const addLesson = () => {
    const l: Lesson = { id: `les-${Date.now()}`, emoji: "📝", title: "Новый урок", blocks: [createBlock("text")] }
    save([...demoRef.current.lessons, l])
    setActiveLessonId(l.id)
  }

  const duplicateLesson = (idx: number) => {
    const orig = demoRef.current.lessons[idx]
    const ts = Date.now()
    const copy: Lesson = {
      ...orig,
      id: `les-${ts}`,
      title: `${orig.title} (копия)`,
      blocks: orig.blocks.map((b) => ({ ...b, id: `${b.id}-c${ts}` })),
    }
    const nl = [...demoRef.current.lessons]; nl.splice(idx + 1, 0, copy)
    save(nl)
    setActiveLessonId(copy.id)
    toast.success("Урок дублирован")
  }

  const moveLessonDir = (idx: number, dir: -1 | 1) => {
    const lessons = demoRef.current.lessons
    const t = idx + dir; if (t < 0 || t >= lessons.length) return
    const nl = [...lessons]; [nl[idx], nl[t]] = [nl[t], nl[idx]]
    save(nl)
  }

  const pasteLesson = () => {
    if (!copiedLesson) return
    const ts = Date.now()
    const pasted: Lesson = {
      ...copiedLesson,
      id: `les-${ts}`,
      title: `${copiedLesson.title} (вставлен)`,
      blocks: copiedLesson.blocks.map((b) => ({ ...b, id: `${b.id}-p${ts}` })),
    }
    save([...demoRef.current.lessons, pasted])
    setActiveLessonId(pasted.id)
    toast.success("Урок вставлен")
  }

  const deleteLesson = (id: string) => {
    const nl = demoRef.current.lessons.filter((l) => l.id !== id)
    save(nl)
    if (activeLessonId === id) setActiveLessonId(nl[0]?.id || "")
    setDeleteConfirmId(null)
    toast("Урок удалён")
  }

  const dropLesson = (target: number) => {
    if (dragLessonIdx === null || dragLessonIdx === target) return
    const nl = [...demoRef.current.lessons]; const [m] = nl.splice(dragLessonIdx, 1); nl.splice(target, 0, m)
    save(nl); setDragLessonIdx(null); setDragOverLessonIdx(null)
  }

  // Block operations within active lesson — always read from demoRef to avoid stale closure
  const updateBlock = (blockId: string, patch: Partial<Block>) => {
    const lesson = demoRef.current.lessons.find((l) => l.id === activeLessonId)
    if (!lesson) return
    updateLesson(activeLessonId, { blocks: lesson.blocks.map((b) => b.id === blockId ? { ...b, ...patch } : b) })
  }
  const insertBlockAt = (idx: number, type: BlockType) => {
    const lesson = demoRef.current.lessons.find((l) => l.id === activeLessonId)
    if (!lesson) return
    const nb = [...lesson.blocks]; nb.splice(idx, 0, createBlock(type))
    updateLesson(activeLessonId, { blocks: nb })
  }
  const removeBlock = (id: string) => {
    const lesson = demoRef.current.lessons.find((l) => l.id === activeLessonId)
    if (!lesson) return
    updateLesson(activeLessonId, { blocks: lesson.blocks.filter((b) => b.id !== id) })
  }
  const duplicateBlock = (idx: number) => {
    const lesson = demoRef.current.lessons.find((l) => l.id === activeLessonId)
    if (!lesson) return
    const orig = lesson.blocks[idx]
    const copy = {
      ...orig,
      id: `blk-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
      questions: orig.questions.map((q) => ({ ...q, id: `q-${Date.now()}-${Math.random().toString(36).slice(2,4)}`, options: [...q.options] })),
    }
    const nb = [...lesson.blocks]; nb.splice(idx + 1, 0, copy)
    updateLesson(activeLessonId, { blocks: nb })
    toast.success("Блок дублирован")
  }
  const moveBlock = (idx: number, dir: -1 | 1) => {
    const lesson = demoRef.current.lessons.find((l) => l.id === activeLessonId)
    if (!lesson) return
    const t = idx + dir; if (t < 0 || t >= lesson.blocks.length) return
    const nb = [...lesson.blocks]; [nb[idx], nb[t]] = [nb[t], nb[idx]]
    updateLesson(activeLessonId, { blocks: nb })
  }

  const applyAiLessons = (lessons: Lesson[]) => {
    const ts = Date.now()
    const mapped = lessons.map((l, i) => ({ ...l, id: `ai-${ts}-${i}`, blocks: l.blocks.map((b) => ({ ...b, id: `${b.id}-${ts}-${i}` })) }))
    save(mapped)
    setActiveLessonId(mapped[0]?.id || "")
    setAiModalOpen(false)
    toast.success("Демонстрация сгенерирована")
  }

  // === PREVIEW (candidate-facing view) ===
  if (previewMode) {
    const lesson = demo.lessons[previewIdx]
    if (!lesson) { setPreviewMode(false); return null }
    const pct = ((previewIdx + 1) / demo.lessons.length) * 100
    return (
      <div className="max-w-2xl mx-auto">
        {/* Top bar */}
        <div className="flex items-center justify-between mb-3">
          <Button variant="ghost" size="sm" onClick={() => setPreviewMode(false)} className="gap-1.5 text-xs">
            <X className="w-3.5 h-3.5" />Закрыть превью
          </Button>
          <Badge variant="outline" className="text-[10px]">Предпросмотр для кандидата</Badge>
        </div>

        {/* Progress */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-xs font-medium text-muted-foreground flex-shrink-0">{previewIdx + 1} / {demo.lessons.length}</span>
        </div>

        {/* Content card */}
        <Card className="shadow-lg border-0 bg-white dark:bg-card">
          <CardContent className="p-8 sm:p-10">
            {/* Lesson title */}
            <div className="text-center mb-8">
              <span className="text-4xl block mb-3">{lesson.emoji}</span>
              <h1 className="text-2xl font-bold text-foreground">{lesson.title}</h1>
            </div>

            {/* Blocks */}
            <div className="space-y-6">
              {lesson.blocks.map((block) => <PreviewBlock key={block.id} block={block} />)}
            </div>
          </CardContent>
        </Card>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-5">
          <Button variant="outline" disabled={previewIdx === 0} onClick={() => setPreviewIdx(previewIdx - 1)}>
            ← Назад
          </Button>
          {previewIdx < demo.lessons.length - 1 ? (
            <Button onClick={() => setPreviewIdx(previewIdx + 1)}>
              Далее →
            </Button>
          ) : (
            <Button onClick={() => setPreviewMode(false)}>
              Завершить ✓
            </Button>
          )}
        </div>
      </div>
    )
  }

  // === EDITOR (two-column) ===
  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onBack}><ArrowLeft className="w-4 h-4" /></Button>
          <div>
            <h3 className="text-lg font-semibold">{demo.title}</h3>
            <Badge variant="outline" className={cn("text-[10px] mt-0.5", demo.status === "published" ? "bg-emerald-500/10 text-emerald-700 border-emerald-200" : "bg-amber-500/10 text-amber-700 border-amber-200")}>{demo.status === "published" ? "Опубликована" : "Черновик"}</Badge>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Save status */}
          <span className={cn("text-[11px] mr-1 transition-colors", saveStatus === "saving" ? "text-amber-500" : saveStatus === "saved" ? "text-muted-foreground/50" : "text-muted-foreground/30")}>
            {saveStatus === "saving" ? "Сохранение..." : saveStatus === "saved" ? "✓ Сохранено" : ""}
          </span>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={saveNow}><Save className="w-3.5 h-3.5" />Сохранить</Button>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => setTemplateOpen(true)}><BookOpen className="w-3.5 h-3.5" />Библиотека</Button>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => setSaveTemplateDialog(true)}><Save className="w-3.5 h-3.5" />Шаблон</Button>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => setAiModalOpen(true)}><Sparkles className="w-3.5 h-3.5" />AI</Button>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => { setPreviewIdx(0); setPreviewMode(true) }}><Eye className="w-3.5 h-3.5" />Превью</Button>
        </div>
      </div>

      <div className="flex gap-4" style={{ height: "calc(100vh - 220px)" }}>
        {/* LEFT — Lesson list */}
        <div className="w-[280px] flex-shrink-0 border border-border rounded-xl bg-card overflow-hidden flex flex-col sticky top-0">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border">
            <h4 className="text-sm font-semibold">Уроки</h4>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs"><Plus className="w-3 h-3" />Урок</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={addLesson}><Plus className="w-3.5 h-3.5 mr-2" />Новый пустой урок</DropdownMenuItem>
                <DropdownMenuItem disabled={!copiedLesson} onClick={pasteLesson}><ClipboardPaste className="w-3.5 h-3.5 mr-2" />Вставить скопированный</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTemplateOpen(true)}><BookOpen className="w-3.5 h-3.5 mr-2" />Из библиотеки шаблонов</DropdownMenuItem>
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
                    "flex items-center gap-1.5 pl-1 pr-0.5 py-1 rounded-md cursor-pointer group transition-all",
                    isActive ? "bg-primary text-primary-foreground" : "hover:bg-muted/60 text-foreground",
                    dragLessonIdx === i && "opacity-30",
                    dragOverLessonIdx === i && dragLessonIdx !== i && "ring-1 ring-primary/50"
                  )}
                >
                  <GripVertical className={cn("w-3 h-3 flex-shrink-0 cursor-move", isActive ? "text-primary-foreground/40" : "text-muted-foreground/20 group-hover:text-muted-foreground/50")} />
                  <span className="text-sm flex-shrink-0">{lesson.emoji}</span>
                  {isRenaming ? (
                    <input
                      autoFocus
                      className="flex-1 text-xs font-medium bg-transparent border-b border-primary-foreground/40 outline-none min-w-0 px-0 py-0"
                      value={lesson.title}
                      onChange={(e) => updateLesson(lesson.id, { title: e.target.value })}
                      onBlur={() => setRenamingLessonId(null)}
                      onKeyDown={(e) => { if (e.key === "Enter") setRenamingLessonId(null) }}
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <span className="flex-1 truncate text-[12px] font-medium">{lesson.title}</span>
                  )}
                  {/* Context menu */}
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
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setCopiedLesson(lesson); toast.success("Урок скопирован") }}>
                        <Copy className="w-3.5 h-3.5 mr-2" />Копировать
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); duplicateLesson(i) }}>
                        <Copy className="w-3.5 h-3.5 mr-2" />Дублировать
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); moveLessonDir(i, -1) }} disabled={i === 0}>
                        <ArrowUp className="w-3.5 h-3.5 mr-2" />Переместить вверх
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); moveLessonDir(i, 1) }} disabled={i === demo.lessons.length - 1}>
                        <ArrowDown className="w-3.5 h-3.5 mr-2" />Переместить вниз
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setSaveModuleDialog(lesson); setSaveModuleName(lesson.title) }}>
                        <Save className="w-3.5 h-3.5 mr-2" />В библиотеку
                      </DropdownMenuItem>
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

        {/* Delete confirmation dialog */}
        <Dialog open={!!deleteConfirmId} onOpenChange={(open) => { if (!open) setDeleteConfirmId(null) }}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader><DialogTitle>Удалить урок?</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">Урок и все его блоки будут удалены. Это действие нельзя отменить.</p>
            <div className="flex justify-end gap-2 mt-2">
              <Button variant="outline" size="sm" onClick={() => setDeleteConfirmId(null)}>Отмена</Button>
              <Button variant="destructive" size="sm" onClick={() => deleteConfirmId && deleteLesson(deleteConfirmId)}>Удалить</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* RIGHT — Block editor for active lesson */}
        <div className="flex-1 min-w-0">
          {activeLesson ? (
            <div key={activeLessonId} className="space-y-0">
              {/* Lesson title (inline editable) */}
              <div className="flex items-center gap-2 mb-4">
                <DemoEmojiBtn
                  current={activeLesson.emoji}
                  onSelect={(v) => updateLesson(activeLessonId, { emoji: v })}
                />
                <input
                  className="text-xl font-bold bg-transparent border-0 outline-none flex-1 text-foreground placeholder:text-muted-foreground/40"
                  value={activeLesson.title}
                  onChange={(e) => updateLesson(activeLessonId, { title: e.target.value })}
                  placeholder="Название урока"
                />
              </div>

              {/* Blocks with inserters between them */}
              <Inserter onInsert={(type) => insertBlockAt(0, type)} first={activeLesson.blocks.length === 0} />

              {activeLesson.blocks.map((block, idx) => (
                <div key={block.id}>
                  {/* Block with toolbar */}
                  <div className="group relative">
                    <div className="absolute -top-3 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="flex items-center gap-0.5 bg-popover border border-border rounded-lg shadow-md px-1 py-0.5">
                        <TBtn icon={Copy} tip="Дублировать" onClick={() => duplicateBlock(idx)} />
                        <TBtn icon={ArrowUp} tip="Вверх" onClick={() => moveBlock(idx, -1)} disabled={idx === 0} />
                        <TBtn icon={ArrowDown} tip="Вниз" onClick={() => moveBlock(idx, 1)} disabled={idx === activeLesson.blocks.length - 1} />
                        <TBtn icon={Trash2} tip="Удалить" onClick={() => removeBlock(block.id)} className="hover:text-destructive" />
                      </div>
                    </div>
                    <div className={cn("rounded-lg border border-transparent hover:border-border transition-colors", block.type === "info" ? "p-0" : "p-1")}>
                      <BlockEditor key={block.id} block={block} onUpdate={(p) => updateBlock(block.id, p)} />
                    </div>
                  </div>

                  {/* Inserter / divider after each block */}
                  <Inserter onInsert={(type) => insertBlockAt(idx + 1, type)} />
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground/40 text-sm">Выберите урок</div>
          )}
        </div>
      </div>

      {/* Library dialog */}
      <LibraryDialog
        open={templateOpen}
        onOpenChange={setTemplateOpen}
        currentLessons={demoRef.current.lessons}
        onApplyTemplate={(lessons) => { save(lessons); setActiveLessonId(lessons[0]?.id || "") }}
        onInsertModule={(lesson) => { save([...demoRef.current.lessons, lesson]); setActiveLessonId(lesson.id) }}
        savedModules={savedModules}
        savedTemplates={savedTemplates}
      />

      <AiGenerateDialog
        open={aiModalOpen}
        onOpenChange={setAiModalOpen}
        onApply={applyAiLessons}
      />

      {/* Save module dialog */}
      <Dialog open={!!saveModuleDialog} onOpenChange={(o) => { if (!o) setSaveModuleDialog(null) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Сохранить как модуль</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2">
            <Input value={saveModuleName} onChange={(e) => setSaveModuleName(e.target.value)} placeholder="Название модуля" autoFocus />
            <Button onClick={() => {
              if (!saveModuleDialog || !saveModuleName.trim()) return
              setSavedModules((prev) => [...prev, { ...saveModuleDialog, title: saveModuleName.trim() }])
              setSaveModuleDialog(null)
              toast.success("Модуль сохранён в библиотеку")
            }}>Сохранить</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Save template dialog */}
      <Dialog open={saveTemplateDialog} onOpenChange={setSaveTemplateDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Сохранить как шаблон</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2">
            <Input value={saveTemplateName} onChange={(e) => setSaveTemplateName(e.target.value)} placeholder="Название шаблона" autoFocus />
            <Input value={saveTemplateCategory} onChange={(e) => setSaveTemplateCategory(e.target.value)} placeholder="Категория (напр. Продажи)" />
            <Button onClick={() => {
              if (!saveTemplateName.trim()) return
              setSavedTemplates((prev) => [...prev, { title: saveTemplateName.trim(), category: saveTemplateCategory.trim() || "Общие", lessons: demoRef.current.lessons }])
              setSaveTemplateDialog(false)
              setSaveTemplateName("")
              setSaveTemplateCategory("")
              toast.success("Шаблон сохранён в библиотеку")
            }}>Сохранить</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* ──── Inserter (divider line + icon bar on hover) ──── */
function Inserter({ onInsert, first }: { onInsert: (type: BlockType) => void; first?: boolean }) {
  if (first) {
    return (
      <div className="py-4">
        <div className="flex items-center justify-center gap-1 py-2 px-3 bg-muted/30 rounded-lg border border-dashed border-border">
          {BLOCK_TYPE_META.map((m) => (
            <button
              key={m.type}
              title={m.label}
              onClick={() => onInsert(m.type)}
              className="flex flex-col items-center gap-1 px-3 py-2 rounded-lg hover:bg-background text-muted-foreground hover:text-foreground transition-colors"
            >
              <span className="text-base">{m.icon}</span>
              <span className="text-[10px]">{m.label}</span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="group/ins relative h-7">
      {/* Divider line */}
      <div className="absolute inset-x-0 top-1/2 h-px bg-border opacity-0 group-hover/ins:opacity-100 transition-opacity" />
      {/* Icon bar — appears on hover */}
      <div className="relative z-10 flex justify-center h-full items-center">
        <div className="flex items-center gap-0.5 opacity-0 group-hover/ins:opacity-100 transition-opacity">
          {BLOCK_TYPE_META.map((m) => (
            <button
              key={m.type}
              title={m.label}
              onClick={() => onInsert(m.type)}
              className="w-7 h-7 rounded-full border border-border bg-background flex items-center justify-center text-xs text-muted-foreground hover:text-foreground hover:border-primary hover:bg-primary/5 transition-all shadow-sm"
            >
              {m.icon}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ──── Floating Selection Toolbar ──── */
interface FloatingToolbarState {
  visible: boolean
  top: number
  left: number
}

interface FloatingToolbarProps {
  editorRef: RefObject<HTMLDivElement | null>
  savedSelectionRef: MutableRefObject<Range | null>
}

function FloatingToolbar({ editorRef, savedSelectionRef }: FloatingToolbarProps) {
  const [toolbar, setToolbar] = useState<FloatingToolbarState>({ visible: false, top: 0, left: 0 })
  const [showForeColors, setShowForeColors] = useState(false)
  const [showBgColors, setShowBgColors] = useState(false)
  const [floatingLinkPopup, setFloatingLinkPopup] = useState(false)
  const [floatingLinkUrl, setFloatingLinkUrl] = useState("")
  const toolbarRef = useRef<HTMLDivElement>(null)
  const [, forceUpdate] = useState(0)

  const FORE_COLORS = ["#000000", "#ef4444", "#f97316", "#eab308", "#22c55e", "#3b82f6", "#8b5cf6", "#6b7280"]
  const BG_COLORS = ["transparent", "#fef08a", "#fed7aa", "#fecaca", "#bbf7d0", "#bfdbfe", "#e9d5ff", "#f1f5f9"]

  const updatePosition = useCallback(() => {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
      setToolbar(t => ({ ...t, visible: false }))
      setShowForeColors(false)
      setShowBgColors(false)
      setFloatingLinkPopup(false)
      return
    }
    // Check selection is inside our editor
    const range = sel.getRangeAt(0)
    if (!editorRef.current?.contains(range.commonAncestorContainer)) {
      setToolbar(t => ({ ...t, visible: false }))
      setShowForeColors(false)
      setShowBgColors(false)
      setFloatingLinkPopup(false)
      return
    }
    const rect = range.getBoundingClientRect()
    const editorRect = editorRef.current!.getBoundingClientRect()
    setToolbar({
      visible: true,
      top: rect.top - editorRect.top - 44,
      left: Math.max(0, rect.left - editorRect.left + rect.width / 2 - 180),
    })
    forceUpdate(n => n + 1) // re-render to update active states
  }, [editorRef])

  useEffect(() => {
    const onSelectionChange = () => { updatePosition() }
    document.addEventListener("selectionchange", onSelectionChange)
    return () => document.removeEventListener("selectionchange", onSelectionChange)
  }, [updatePosition])

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        setShowForeColors(false)
        setShowBgColors(false)
        setFloatingLinkPopup(false)
      }
    }
    document.addEventListener("mousedown", handleMouseDown)
    return () => document.removeEventListener("mousedown", handleMouseDown)
  }, [])

  const exec = (cmd: string, value?: string) => {
    editorRef.current?.focus()
    document.execCommand(cmd, false, value)
    setTimeout(() => forceUpdate(n => n + 1), 0)
  }

  const tb = (fn: () => void) => (e: React.MouseEvent) => {
    e.preventDefault()
    fn()
  }

  const isActive = (cmd: string) => {
    try { return document.queryCommandState(cmd) } catch { return false }
  }

  const currentBlock = () => {
    try { return document.queryCommandValue("formatBlock").toLowerCase() } catch { return "" }
  }

  const toggleBlock = (tag: string) => {
    const cur = currentBlock()
    exec("formatBlock", cur === tag ? "p" : tag)
  }

  const btnCls = (cmd?: string) =>
    cn("w-7 h-7 rounded hover:bg-muted text-xs font-medium flex items-center justify-center transition-colors",
      cmd && isActive(cmd) ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")

  const blockBtnCls = (tag: string) =>
    cn("w-7 h-7 rounded hover:bg-muted text-xs font-medium flex items-center justify-center transition-colors",
      currentBlock() === tag ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")

  const openFloatingLink = () => {
    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0) savedSelectionRef.current = sel.getRangeAt(0).cloneRange()
    setFloatingLinkUrl("")
    setFloatingLinkPopup(true)
  }

  const applyFloatingLink = () => {
    if (!floatingLinkUrl.trim()) { setFloatingLinkPopup(false); return }
    editorRef.current?.focus()
    if (savedSelectionRef.current) {
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(savedSelectionRef.current)
    }
    document.execCommand("createLink", false, floatingLinkUrl.trim())
    setFloatingLinkPopup(false)
  }

  if (!toolbar.visible) return null

  return (
    <div
      ref={toolbarRef}
      className="absolute z-50 bg-popover border border-border rounded-xl shadow-xl px-2 py-1 flex gap-0.5 items-center"
      style={{ top: toolbar.top, left: toolbar.left }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <button onMouseDown={tb(() => exec("bold"))} className={btnCls("bold")} title="Жирный"><span className="font-bold">B</span></button>
      <button onMouseDown={tb(() => exec("italic"))} className={btnCls("italic")} title="Курсив"><span className="italic">I</span></button>
      <button onMouseDown={tb(() => exec("underline"))} className={btnCls("underline")} title="Подчёркнутый"><span className="underline">U</span></button>
      <button onMouseDown={tb(() => exec("strikeThrough"))} className={btnCls("strikeThrough")} title="Зачёркнутый"><span className="line-through">S</span></button>
      {/* Foreground color picker */}
      <div className="relative">
        <button onMouseDown={tb(() => { setShowForeColors(v => !v); setShowBgColors(false) })} className={btnCls()} title="Цвет текста">
          <span className="font-bold">A</span>
        </button>
        {showForeColors && (
          <div className="absolute bottom-full mb-1 left-0 z-50 bg-popover border border-border rounded-lg shadow-lg p-1.5 flex gap-1" onMouseDown={e => e.preventDefault()}>
            {FORE_COLORS.map(c => (
              <button key={c} onMouseDown={tb(() => { exec("foreColor", c); setShowForeColors(false) })}
                className="w-5 h-5 rounded-full border border-border shadow-sm hover:scale-110 transition-transform"
                style={{ background: c }} title={c} />
            ))}
          </div>
        )}
      </div>
      {/* Background color picker */}
      <div className="relative">
        <button onMouseDown={tb(() => { setShowBgColors(v => !v); setShowForeColors(false) })} className={btnCls()} title="Цвет фона">
          <span>🖍</span>
        </button>
        {showBgColors && (
          <div className="absolute bottom-full mb-1 left-0 z-50 bg-popover border border-border rounded-lg shadow-lg p-1.5 flex gap-1" onMouseDown={e => e.preventDefault()}>
            {BG_COLORS.map(c => (
              <button key={c} onMouseDown={tb(() => { exec("hiliteColor", c); setShowBgColors(false) })}
                className="w-5 h-5 rounded-full border border-border shadow-sm hover:scale-110 transition-transform"
                style={{ background: c === "transparent" ? "repeating-conic-gradient(#ccc 0% 25%, #fff 0% 50%) 0 0 / 8px 8px" : c }}
                title={c === "transparent" ? "Без фона" : c} />
            ))}
          </div>
        )}
      </div>
      {/* Link */}
      <div className="relative">
        <button onMouseDown={tb(openFloatingLink)} className={btnCls()} title="Ссылка">🔗</button>
        {floatingLinkPopup && (
          <div className="absolute bottom-full mb-1 left-0 z-50 bg-popover border border-border rounded-lg shadow-lg p-2 w-56 flex gap-1.5" onMouseDown={e => e.preventDefault()}>
            <Input
              autoFocus
              placeholder="https://..."
              value={floatingLinkUrl}
              onChange={e => setFloatingLinkUrl(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") applyFloatingLink(); if (e.key === "Escape") setFloatingLinkPopup(false) }}
              className="h-7 text-xs flex-1"
            />
            <Button size="sm" className="h-7 px-2 text-xs" onMouseDown={tb(applyFloatingLink)}>OK</Button>
          </div>
        )}
      </div>
      <div className="w-px h-4 bg-border mx-0.5" />
      <button onMouseDown={tb(() => toggleBlock("h1"))} className={blockBtnCls("h1")} title="Заголовок 1"><span className="font-bold text-[11px]">H1</span></button>
      <button onMouseDown={tb(() => toggleBlock("h2"))} className={blockBtnCls("h2")} title="Заголовок 2"><span className="font-bold text-[11px]">H2</span></button>
      <button onMouseDown={tb(() => toggleBlock("h3"))} className={blockBtnCls("h3")} title="Заголовок 3"><span className="font-bold text-[11px]">H3</span></button>
      <div className="w-px h-4 bg-border mx-0.5" />
      <button onMouseDown={tb(() => exec("insertUnorderedList"))} className={btnCls("insertUnorderedList")} title="Маркированный список"><span className="text-[11px]">:≡</span></button>
      <button onMouseDown={tb(() => exec("insertOrderedList"))} className={btnCls("insertOrderedList")} title="Нумерованный список"><span className="text-[11px]">1≡</span></button>
      <button onMouseDown={tb(() => { const isCenter = document.queryCommandState("justifyCenter"); exec(isCenter ? "justifyLeft" : "justifyCenter") })} className={btnCls()} title="Выравнивание"><span className="text-[11px]">≡</span></button>
    </div>
  )
}

/* ──── Block Editor ──── */
function BlockEditor({ block, onUpdate }: { block: Block; onUpdate: (p: Partial<Block>) => void }) {
  const editorRef = useRef<HTMLDivElement>(null)
  const [alignState, setAlignState] = useState(0)
  const [linkPopup, setLinkPopup] = useState(false)
  const [linkUrl, setLinkUrl] = useState("")
  const savedSelection = useRef<Range | null>(null)
  const onUpdateRef = useRef(onUpdate)
  onUpdateRef.current = onUpdate

  // Set innerHTML on mount (key prop on BlockEditor forces remount when block.id changes)
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = cleanHtml(block.content || "")
      console.log("[BlockEditor] mounted block:", block.id, "content length:", (block.content || "").length)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // intentionally run only on mount — key prop handles remount on block change

  // Strip formatting on paste — insert plain text only
  useEffect(() => {
    const el = editorRef.current
    if (!el) return
    const onPaste = (e: ClipboardEvent) => {
      e.preventDefault()
      const text = e.clipboardData?.getData("text/plain") ?? ""
      document.execCommand("insertText", false, text)
      onUpdateRef.current({ content: el.innerHTML })
    }
    el.addEventListener("paste", onPaste)
    return () => el.removeEventListener("paste", onPaste)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const tb = (fn: () => void) => (e: React.MouseEvent) => { e.preventDefault(); fn() }

  const exec = (cmd: string, value?: string) => {
    editorRef.current?.focus()
    document.execCommand(cmd, false, value)
  }

  const insertHtml = (html: string) => {
    editorRef.current?.focus()
    document.execCommand("insertHTML", false, html)
  }

  const openLinkPopup = () => {
    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0) savedSelection.current = sel.getRangeAt(0).cloneRange()
    setLinkUrl("")
    setLinkPopup(true)
  }

  const applyLink = () => {
    if (!linkUrl.trim()) { setLinkPopup(false); return }
    editorRef.current?.focus()
    if (savedSelection.current) {
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(savedSelection.current)
    }
    document.execCommand("createLink", false, linkUrl.trim())
    setLinkPopup(false)
    syncContent()
  }

  const cycleAlign = () => {
    const cmds = ["justifyLeft", "justifyCenter", "justifyRight"]
    const next = (alignState + 1) % 3
    exec(cmds[next])
    setAlignState(next)
  }
  const AlignIcon = [AlignLeft, AlignCenter, AlignRight][alignState]

  const syncContent = useCallback(() => {
    if (editorRef.current) {
      const html = editorRef.current.innerHTML
      console.log("[BlockEditor] syncContent block:", block.id, "html length:", html.length)
      onUpdateRef.current({ content: html })
    }
  }, [block.id])

  switch (block.type) {
    case "text":
      return (
        <div className="relative">
          <FloatingToolbar editorRef={editorRef} savedSelectionRef={savedSelection} />
          <div className="flex items-center gap-0.5 flex-wrap p-1.5 bg-muted/40 rounded-t-lg border border-b-0 border-border">

            <button onMouseDown={tb(() => exec("bold"))} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground" title="Жирный"><Bold className="w-3.5 h-3.5" /></button>
            <button onMouseDown={tb(() => exec("italic"))} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground" title="Курсив"><Italic className="w-3.5 h-3.5" /></button>
            <button onMouseDown={tb(() => exec("underline"))} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground" title="Подчёркнутый"><Underline className="w-3.5 h-3.5" /></button>
            <button onMouseDown={tb(() => exec("strikeThrough"))} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground" title="Зачёркнутый"><Strikethrough className="w-3.5 h-3.5" /></button>
            <Sep />
            <button onMouseDown={tb(() => exec("formatBlock", "h1"))} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground" title="Заголовок 1"><Heading1 className="w-3.5 h-3.5" /></button>
            <button onMouseDown={tb(() => exec("formatBlock", "h2"))} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground" title="Заголовок 2"><Heading2 className="w-3.5 h-3.5" /></button>
            <button onMouseDown={tb(() => exec("formatBlock", "h3"))} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground" title="Заголовок 3"><Heading3 className="w-3.5 h-3.5" /></button>
            <Sep />
            <button onMouseDown={tb(cycleAlign)} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground" title="Выравнивание"><AlignIcon className="w-3.5 h-3.5" /></button>
            <Sep />
            <button onMouseDown={tb(() => exec("insertUnorderedList"))} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground" title="Маркированный список"><ListIcon className="w-3.5 h-3.5" /></button>
            <button onMouseDown={tb(() => exec("insertOrderedList"))} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground" title="Нумерованный список"><ListOrdered className="w-3.5 h-3.5" /></button>
            {/* Link with inline popup */}
            <div className="relative">
              <button onMouseDown={tb(openLinkPopup)} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground" title="Ссылка"><Link2 className="w-3.5 h-3.5" /></button>
              {linkPopup && (
                <div className="absolute top-8 left-0 z-50 bg-popover border border-border rounded-lg shadow-lg p-2 w-64 flex gap-1.5">
                  <Input
                    autoFocus
                    placeholder="https://..."
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") applyLink(); if (e.key === "Escape") setLinkPopup(false) }}
                    className="h-7 text-xs flex-1"
                  />
                  <Button size="sm" className="h-7 px-2 text-xs" onClick={applyLink}>OK</Button>
                  <Button size="sm" variant="ghost" className="h-7 px-1.5 text-xs" onClick={() => setLinkPopup(false)}><X className="w-3 h-3" /></Button>
                </div>
              )}
            </div>
            <Sep />
            <DropdownMenu>
              <DropdownMenuTrigger asChild><button className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground" title="Переменная"><Hash className="w-3.5 h-3.5" /></button></DropdownMenuTrigger>
              <DropdownMenuContent>{VARIABLES.map((v) => <DropdownMenuItem key={v.key} onMouseDown={tb(() => insertHtml(`<span class="text-primary font-medium">{{${v.key}}}</span>`))}>
                <code className="text-xs text-primary mr-2">{`{{${v.key}}}`}</code><span className="text-xs text-muted-foreground">{v.label}</span>
              </DropdownMenuItem>)}</DropdownMenuContent>
            </DropdownMenu>
            <DemoEmojiBtn onSelect={(e) => insertHtml(e)} />
          </div>
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            data-block-editor={block.id}
            className="min-h-[100px] text-sm rounded-b-lg border border-t-0 border-border bg-background p-3 outline-none focus:ring-1 focus:ring-ring [&_h1]:text-xl [&_h1]:font-bold [&_h1]:mt-3 [&_h1]:mb-1 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mt-2 [&_h2]:mb-1 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-2 [&_ul]:list-disc [&_ul]:ml-4 [&_ol]:list-decimal [&_ol]:ml-4 [&_a]:text-primary [&_a]:underline [&_blockquote]:border-0 [&_blockquote]:p-0 [&_blockquote]:m-0 [&_blockquote]:not-italic"
            onBlur={syncContent}
            onInput={syncContent}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                if (e.shiftKey) {
                  // Shift+Enter — абзацный отступ (двойной br)
                  document.execCommand("insertHTML", false, "<br><br>")
                } else {
                  // Enter — мягкий перенос строки
                  document.execCommand("insertHTML", false, "<br>")
                }
              }
            }}
            data-placeholder="Введите текст..."
          />
        </div>
      )

    case "image":
      return <ImageBlockEditor block={block} onUpdate={onUpdate} />

    case "video":
      return <VideoBlockEditor block={block} onUpdate={onUpdate} />

    case "audio":
      return <AudioBlockEditor block={block} onUpdate={onUpdate} />

    case "file": {
      const fl = block.fileLayout || "full"
      const fi = getFileIcon(block.fileName || "")
      const fileCard = block.fileUrl ? (
        <div className={cn("w-16 h-16 rounded-xl flex items-center justify-center text-3xl mx-auto", fi.color)}>
          {fi.icon}
        </div>
      ) : null
      return (
        <div className="space-y-3">
          <div className="flex gap-2">
            {(["full", "file-left", "file-right"] as FileLayout[]).map((l) => (
              <Button key={l} variant={fl === l ? "default" : "outline"} size="sm" className="text-xs h-7" onClick={() => onUpdate({ fileLayout: l })}>
                {l === "full" ? "📄 Документ" : l === "file-left" ? "📄↔ Документ+текст" : "↔📄 Текст+документ"}
              </Button>
            ))}
          </div>
          {!block.fileUrl ? (
            <FileDropZone accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx" label="Загрузите файл (PDF, DOC, XLS до 10 МБ)" onFile={(url, name) => onUpdate({ fileUrl: url, fileName: name })} />
          ) : (
            <div className={cn("flex gap-4", fl === "file-right" && "flex-row-reverse", fl === "full" && "flex-col items-center")}>
              <div className="flex flex-col items-center gap-1.5 flex-shrink-0 relative group">
                {fileCard}
                <p className="text-xs font-medium text-foreground text-center max-w-[120px] truncate">{block.fileName}</p>
                <button className="absolute -top-1 -right-1 bg-destructive text-white rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => onUpdate({ fileUrl: "", fileName: "" })}><X className="w-2.5 h-2.5" /></button>
              </div>
              {fl !== "full" && (
                <Textarea className="flex-1 min-h-[80px] text-sm" value={block.content} onChange={(e) => onUpdate({ content: e.target.value })} placeholder="Текст рядом с документом..." />
              )}
            </div>
          )}
          <Input placeholder="Название файла" value={block.fileName} onChange={(e) => onUpdate({ fileName: e.target.value })} className="text-xs" />
        </div>
      )
    }

    case "info":
      return <InfoBlockEditor block={block} onUpdate={onUpdate} />

    case "button":
      return (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Текст кнопки" value={block.buttonText} onChange={(e) => onUpdate({ buttonText: e.target.value })} />
            <Input placeholder="https://..." value={block.buttonUrl} onChange={(e) => onUpdate({ buttonUrl: e.target.value })} />
          </div>
          <div className="flex items-center gap-2">
            <Button variant={block.buttonVariant === "primary" ? "default" : "outline"} size="sm" className="text-xs" onClick={() => onUpdate({ buttonVariant: "primary" })}>Основная</Button>
            <Button variant={block.buttonVariant === "outline" ? "default" : "outline"} size="sm" className="text-xs" onClick={() => onUpdate({ buttonVariant: "outline" })}>Контурная</Button>
          </div>
          <div className="flex justify-center p-3 bg-muted/30 rounded-lg">
            <Button variant={block.buttonVariant === "primary" ? "default" : "outline"} size="sm">{block.buttonText || "Кнопка"}</Button>
          </div>
        </div>
      )

    case "task": {
      const uq = (qi: number, patch: Partial<Question>) => {
        const nq = [...block.questions]; nq[qi] = { ...nq[qi], ...patch }; onUpdate({ questions: nq })
      }
      return (
        <div className="space-y-3">
          <Textarea className="text-sm" rows={2} value={block.taskDescription} onChange={(e) => onUpdate({ taskDescription: e.target.value })} placeholder="Описание задания..." />
          {block.questions.map((q, qi) => (
            <div key={q.id} className="p-3 bg-muted/30 rounded-lg space-y-2">
              {/* Question header */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-muted-foreground w-4">{qi + 1}.</span>
                <Input className="flex-1 text-sm h-8" value={q.text} onChange={(e) => uq(qi, { text: e.target.value })} placeholder="Вопрос" />
                <Select value={q.answerType} onValueChange={(v) => uq(qi, { answerType: v as Question["answerType"], correctOptions: [] })}>
                  <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="text">Текст</SelectItem><SelectItem value="single">Один</SelectItem><SelectItem value="multiple">Несколько</SelectItem><SelectItem value="video">Видео</SelectItem></SelectContent>
                </Select>
                <Input type="number" min={1} max={10} value={q.weight ?? 1} onChange={(e) => uq(qi, { weight: parseInt(e.target.value) || 1 })} className="w-14 h-8 text-xs text-center" title="Вес вопроса (1-10)" />
                <button onClick={() => onUpdate({ questions: block.questions.filter((_, j) => j !== qi) })} className="text-muted-foreground hover:text-destructive"><X className="w-3.5 h-3.5" /></button>
              </div>

              {/* Options with correct answers — single */}
              {q.answerType === "single" && (
                <div className="ml-6 space-y-1">
                  {q.options.map((opt, oi) => (
                    <div key={oi} className="flex items-center gap-1.5">
                      <input type="radio" name={`correct-${q.id}`} checked={(q.correctOptions || [])[0] === oi} onChange={() => uq(qi, { correctOptions: [oi] })} className="accent-emerald-600 w-3.5 h-3.5" title="Правильный" />
                      <Input className="flex-1 text-xs h-7" value={opt} onChange={(e) => { const no = [...q.options]; no[oi] = e.target.value; uq(qi, { options: no }) }} placeholder={`Вариант ${oi + 1}`} />
                      <button onClick={() => uq(qi, { options: q.options.filter((_, j) => j !== oi), correctOptions: (q.correctOptions || []).filter((c) => c !== oi).map((c) => c > oi ? c - 1 : c) })} className="text-muted-foreground hover:text-destructive"><X className="w-3 h-3" /></button>
                    </div>
                  ))}
                  <Button variant="ghost" size="sm" className="text-[11px] h-5 px-1.5" onClick={() => uq(qi, { options: [...q.options, ""] })}>+ Вариант</Button>
                </div>
              )}

              {/* Options with correct answers — multiple */}
              {q.answerType === "multiple" && (
                <div className="ml-6 space-y-1">
                  {q.options.map((opt, oi) => (
                    <div key={oi} className="flex items-center gap-1.5">
                      <input type="checkbox" checked={(q.correctOptions || []).includes(oi)} onChange={(e) => {
                        const co = q.correctOptions || []
                        uq(qi, { correctOptions: e.target.checked ? [...co, oi] : co.filter((c) => c !== oi) })
                      }} className="accent-emerald-600 w-3.5 h-3.5" title="Правильный" />
                      <Input className="flex-1 text-xs h-7" value={opt} onChange={(e) => { const no = [...q.options]; no[oi] = e.target.value; uq(qi, { options: no }) }} placeholder={`Вариант ${oi + 1}`} />
                      <button onClick={() => uq(qi, { options: q.options.filter((_, j) => j !== oi), correctOptions: (q.correctOptions || []).filter((c) => c !== oi).map((c) => c > oi ? c - 1 : c) })} className="text-muted-foreground hover:text-destructive"><X className="w-3 h-3" /></button>
                    </div>
                  ))}
                  <Button variant="ghost" size="sm" className="text-[11px] h-5 px-1.5" onClick={() => uq(qi, { options: [...q.options, ""] })}>+ Вариант</Button>
                </div>
              )}

              {/* Text answer — exact or AI scoring */}
              {q.answerType === "text" && (
                <div className="ml-6 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center bg-muted rounded-lg p-0.5">
                      <Button variant={(q.textMatchMode || "ai") === "exact" ? "default" : "ghost"} size="sm" className="h-6 text-[11px] px-2" onClick={() => uq(qi, { textMatchMode: "exact" })}>Точное совпадение</Button>
                      <Button variant={(q.textMatchMode || "ai") === "ai" ? "default" : "ghost"} size="sm" className="h-6 text-[11px] px-2" onClick={() => uq(qi, { textMatchMode: "ai" })}>AI-оценка</Button>
                    </div>
                  </div>
                  {(q.textMatchMode || "ai") === "exact" ? (
                    <Input className="text-xs h-7" value={q.correctText || ""} onChange={(e) => uq(qi, { correctText: e.target.value })} placeholder="Правильный ответ" />
                  ) : (
                    <Textarea className="text-xs" rows={2} value={q.aiCriteria || ""} onChange={(e) => uq(qi, { aiCriteria: e.target.value })} placeholder="Критерии для AI: например, 'Кандидат должен упомянуть опыт в продажах и работу с возражениями'" />
                  )}
                </div>
              )}
            </div>
          ))}
          <Button variant="outline" size="sm" className="text-xs gap-1" onClick={() => onUpdate({ questions: [...block.questions, { id: `q-${Date.now()}`, text: "", answerType: "text", options: [], weight: 1 }] })}><Plus className="w-3 h-3" />Вопрос</Button>
        </div>
      )
    }

    default: return null
  }
}

/* ──── Preview ──── */
function PreviewBlock({ block }: { block: Block }) {
  const html = replaceVars(block.content)
  const richTextClass = "text-sm leading-relaxed [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mb-3 [&_h1]:mt-4 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mb-2 [&_h2]:mt-3 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:mb-2 [&_h3]:mt-2 [&_ul]:list-disc [&_ul]:ml-5 [&_ul]:my-2 [&_ol]:list-decimal [&_ol]:ml-5 [&_ol]:my-2 [&_li]:mb-1 [&_a]:text-primary [&_a]:underline [&_b]:font-bold [&_strong]:font-bold [&_i]:italic [&_em]:italic [&_u]:underline [&_s]:line-through [&_strike]:line-through"

  switch (block.type) {
    case "text":
      return <div className={richTextClass} dangerouslySetInnerHTML={{ __html: html }} />
    case "image":
      return (
        <div className={cn("flex gap-4", block.imageLayout === "image-right" && "flex-row-reverse", block.imageLayout === "full" && "flex-col")}>
          <div className={cn("bg-muted rounded-xl flex items-center justify-center", block.imageLayout === "full" ? "w-full aspect-video" : "w-1/2 min-h-[140px]")}>
            <ImageIcon className="w-8 h-8 text-muted-foreground/20" />
          </div>
          {block.imageLayout !== "full" && <div className={cn("flex-1", richTextClass)} dangerouslySetInnerHTML={{ __html: html }} />}
          {block.imageLayout === "full" && block.imageCaption && <p className="text-xs text-muted-foreground text-center italic">{block.imageCaption}</p>}
        </div>
      )
    case "video":
      return (
        <div className="aspect-video bg-muted rounded-xl flex items-center justify-center cursor-pointer hover:bg-muted/80 transition-colors">
          <div className="text-center">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-2">
              <Play className="w-6 h-6 text-primary ml-0.5" />
            </div>
            <p className="text-xs text-muted-foreground">Нажмите для воспроизведения</p>
          </div>
        </div>
      )
    case "audio":
      return (
        <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-xl">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Play className="w-5 h-5 text-primary ml-0.5" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium">{block.audioTitle || "Аудио"}</p>
            <p className="text-xs text-muted-foreground">Нажмите для воспроизведения</p>
          </div>
        </div>
      )
    case "file": {
      const pfi = getFileIcon(block.fileName || "")
      return (
        <div className="flex items-center gap-4 p-4 border border-border rounded-xl hover:shadow-sm transition-shadow cursor-pointer">
          <div className={cn("w-16 h-16 rounded-xl flex items-center justify-center text-3xl flex-shrink-0", pfi.color)}>{pfi.icon}</div>
          <div>
            <p className="text-sm font-medium">{block.fileName || "Документ"}</p>
            <p className="text-xs text-muted-foreground">Нажмите для скачивания</p>
          </div>
        </div>
      )
    }
    case "info": {
      const pStyle = INFO_STYLES[block.infoStyle]
      const pBorder = block.infoColor || pStyle.borderColor
      const pIcon = block.infoIcon || pStyle.icon
      const pSz = block.infoSize || "m"
      const pSzMap = { s: { pad: "py-2 px-3", ic: "text-base" }, m: { pad: "py-3 px-4", ic: "text-2xl" }, l: { pad: "py-4 px-5", ic: "text-[32px]" }, xl: { pad: "py-6 px-7", ic: "text-[40px]" } }
      const ps = pSzMap[pSz]
      return (
        <div className={cn("rounded-xl w-full min-h-[48px]", ps.pad)} style={{ border: `2px solid ${pBorder}`, borderLeft: `4px solid ${pBorder}` }}>
          <div className={cn("flex gap-3", richTextClass)}>
            <span className={cn("flex-shrink-0", ps.ic)}>{pIcon}</span>
            <div dangerouslySetInnerHTML={{ __html: html }} />
          </div>
        </div>
      )
    }
    case "button":
      return (
        <div className="flex justify-center py-4">
          <Button size="lg" variant={block.buttonVariant === "primary" ? "default" : "outline"}>
            {block.buttonText || "Кнопка"}
          </Button>
        </div>
      )
    case "task":
      return (
        <div className="space-y-4">
          {block.taskDescription && <div className={richTextClass} dangerouslySetInnerHTML={{ __html: replaceVars(block.taskDescription) }} />}
          {block.questions.map((q, i) => (
            <div key={q.id} className="p-4 bg-muted/40 rounded-xl space-y-2">
              <p className="text-sm font-semibold">{i + 1}. {replaceVars(q.text)}</p>
              {q.answerType === "text" && <Textarea placeholder="Ваш ответ..." rows={3} className="text-sm bg-background" />}
              {q.answerType === "video" && (
                <div className="p-6 bg-muted rounded-xl text-center">
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-2">
                    <Video className="w-5 h-5 text-primary" />
                  </div>
                  <p className="text-sm text-muted-foreground mb-2">Запишите видео-ответ</p>
                  <Button variant="outline" size="sm">Начать запись</Button>
                </div>
              )}
              {(q.answerType === "single" || q.answerType === "multiple") && (
                <div className="space-y-1.5 mt-1">
                  {q.options.map((o, oi) => (
                    <label key={oi} className="flex items-center gap-2.5 text-sm py-1.5 px-3 rounded-lg hover:bg-background cursor-pointer transition-colors">
                      <input type={q.answerType === "single" ? "radio" : "checkbox"} name={q.id} className="accent-primary w-4 h-4" />
                      {o}
                    </label>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )
    default: return null
  }
}

/* ──── File Drop Zone ──── */
function FileDropZone({ accept, label, onFile }: { accept: string; label: string; onFile: (dataUrl: string, name: string) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  const handleFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => onFile(reader.result as string, file.name)
    reader.readAsDataURL(file)
  }
  return (
    <div
      className="p-5 bg-muted/30 rounded-lg border-2 border-dashed border-border text-center cursor-pointer hover:border-primary/40 transition-colors"
      onClick={() => ref.current?.click()}
      onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add("border-primary") }}
      onDragLeave={(e) => e.currentTarget.classList.remove("border-primary")}
      onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove("border-primary"); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
    >
      <Upload className="w-6 h-6 text-muted-foreground/30 mx-auto mb-1" />
      <p className="text-xs text-muted-foreground">{label}</p>
      <input ref={ref} type="file" accept={accept} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
    </div>
  )
}

function getEmbedUrl(url: string): string | null {
  try {
    // YouTube
    let m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/)
    if (m) return `https://www.youtube.com/embed/${m[1]}`
    // RuTube
    m = url.match(/rutube\.ru\/video\/([\w]+)/)
    if (m) return `https://rutube.ru/play/embed/${m[1]}`
    // VK
    m = url.match(/vk\.com\/video(-?\d+_\d+)/)
    if (m) return `https://vk.com/video_ext.php?oid=${m[1].split("_")[0]}&id=${m[1].split("_")[1]}`
  } catch {}
  return null
}

/* ──── Image Block Editor ──── */
function ImageBlockEditor({ block, onUpdate }: { block: Block; onUpdate: (p: Partial<Block>) => void }) {
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {(["full", "image-left", "image-right"] as ImageLayout[]).map((l) => (
          <Button key={l} variant={block.imageLayout === l ? "default" : "outline"} size="sm" className="text-xs h-7" onClick={() => onUpdate({ imageLayout: l })}>
            {l === "full" ? "⬜ Фото" : l === "image-left" ? "◧ Фото+текст" : "◨ Текст+фото"}
          </Button>
        ))}
      </div>
      <div className={cn("flex gap-3", block.imageLayout === "image-right" && "flex-row-reverse", block.imageLayout === "full" && "flex-col")}>
        <div className={cn(block.imageLayout === "full" ? "w-full" : "w-1/2")}>
          {block.imageUrl ? (
            <div className="relative group">
              <img src={block.imageUrl} alt="" className="max-w-[800px] max-h-[600px] w-full h-auto object-contain rounded-lg mx-auto" />
              <button className="absolute top-2 right-2 bg-destructive text-white rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => onUpdate({ imageUrl: "" })}><X className="w-3 h-3" /></button>
            </div>
          ) : (
            <FileDropZone accept="image/*" label="Загрузить изображение" onFile={(url) => onUpdate({ imageUrl: url })} />
          )}
          <Input className="mt-1.5 text-xs" placeholder="Или вставьте URL" value={(block.imageUrl || "").startsWith("data:") ? "" : (block.imageUrl || "")} onChange={(e) => onUpdate({ imageUrl: e.target.value })} />
        </div>
        {block.imageLayout !== "full" && (
          <Textarea className="flex-1 min-h-[100px] text-sm" value={block.content || ""} onChange={(e) => onUpdate({ content: e.target.value })} placeholder="Текст рядом с фото..." />
        )}
      </div>
    </div>
  )
}

/* ──── Video Block Editor ──── */
function VideoBlockEditor({ block, onUpdate }: { block: Block; onUpdate: (p: Partial<Block>) => void }) {
  const embedUrl = block.videoUrl ? getEmbedUrl(block.videoUrl) : null
  const isLocal = block.videoUrl.startsWith("blob:") || block.videoUrl.startsWith("data:")
  const fileRef = useRef<HTMLInputElement>(null)
  const [recording, setRecording] = useState(false)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const previewRef = useRef<HTMLVideoElement>(null)

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      streamRef.current = stream
      if (previewRef.current) { previewRef.current.srcObject = stream; previewRef.current.play() }
      const recorder = new MediaRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "video/webm" })
        onUpdate({ videoUrl: URL.createObjectURL(blob) })
        stream.getTracks().forEach((t) => t.stop())
        streamRef.current = null
      }
      recorderRef.current = recorder
      recorder.start()
      setRecording(true)
    } catch { toast.error("Нет доступа к камере") }
  }

  const stopRecording = () => {
    recorderRef.current?.stop()
    setRecording(false)
  }

  return (
    <div className="space-y-2">
      {/* Actions row */}
      <div className="flex gap-2 flex-wrap">
        <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => fileRef.current?.click()}>
          <FileUp className="w-3.5 h-3.5" />Загрузить файл
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={recording ? stopRecording : startRecording}>
          {recording ? <><MicOff className="w-3.5 h-3.5 text-destructive" />Остановить</> : <><Camera className="w-3.5 h-3.5" />Записать</>}
        </Button>
        <input ref={fileRef} type="file" accept="video/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpdate({ videoUrl: URL.createObjectURL(f) }) }} />
      </div>
      <Input placeholder="🔗 Вставить ссылку (YouTube / RuTube / VK)" value={isLocal ? "" : block.videoUrl} onChange={(e) => onUpdate({ videoUrl: e.target.value })} className="text-xs" />

      {/* Preview area */}
      {recording ? (
        <div className="relative rounded-lg overflow-hidden bg-black max-w-[800px] mx-auto">
          <video ref={previewRef} muted className="w-full aspect-video" />
          <div className="absolute top-3 left-3 flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
            <span className="text-white text-xs font-medium">Запись...</span>
          </div>
          <Button size="sm" variant="destructive" className="absolute bottom-3 left-1/2 -translate-x-1/2 gap-1.5" onClick={stopRecording}>
            <Square className="w-3 h-3" />Остановить
          </Button>
        </div>
      ) : block.videoUrl ? (
        <div className="relative group max-w-[800px] mx-auto">
          {embedUrl ? (
            <iframe src={embedUrl} className="w-full aspect-video rounded-lg" allowFullScreen />
          ) : (
            <video src={block.videoUrl} controls className="w-full aspect-video rounded-lg" />
          )}
          <button className="absolute top-2 right-2 bg-destructive text-white rounded-full w-6 h-6 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => onUpdate({ videoUrl: "" })}><X className="w-3 h-3" /></button>
        </div>
      ) : null}
      <Textarea className="text-sm" rows={2} value={block.content} onChange={(e) => onUpdate({ content: e.target.value })} placeholder="Описание (опционально)" />
    </div>
  )
}

/* ──── Audio Block Editor ──── */
function AudioBlockEditor({ block, onUpdate }: { block: Block; onUpdate: (p: Partial<Block>) => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [recording, setRecording] = useState(false)
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" })
        const url = URL.createObjectURL(blob)
        setRecordedUrl(url)
        stream.getTracks().forEach((t) => t.stop())
      }
      recorderRef.current = recorder
      recorder.start()
      setRecording(true)
    } catch { toast.error("Нет доступа к микрофону") }
  }

  const stopRecording = () => { recorderRef.current?.stop(); setRecording(false) }
  const useRecording = () => { if (recordedUrl) { onUpdate({ audioUrl: recordedUrl, audioTitle: block.audioTitle || "Голосовая запись" }); setRecordedUrl(null) } }
  const retryRecording = () => { setRecordedUrl(null) }

  return (
    <div className="space-y-2">
      <Input placeholder="Название аудио" value={block.audioTitle} onChange={(e) => onUpdate({ audioTitle: e.target.value })} />

      {/* Actions */}
      <div className="flex gap-2 flex-wrap">
        <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => fileRef.current?.click()}>
          <FileUp className="w-3.5 h-3.5" />Загрузить файл
        </Button>
        {!recording && !recordedUrl && (
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={startRecording}>
            <Mic className="w-3.5 h-3.5" />Записать
          </Button>
        )}
        <input ref={fileRef} type="file" accept="audio/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpdate({ audioUrl: URL.createObjectURL(f), audioTitle: block.audioTitle || f.name }) }} />
      </div>

      {/* Recording state */}
      {recording && (
        <div className="flex items-center gap-3 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg">
          <span className="w-3 h-3 rounded-full bg-red-500 animate-pulse flex-shrink-0" />
          <div className="flex-1 flex items-center gap-1">
            {[...Array(12)].map((_, i) => (
              <div key={i} className="w-1 bg-red-400 rounded-full animate-pulse" style={{ height: `${8 + Math.random() * 16}px`, animationDelay: `${i * 0.1}s` }} />
            ))}
          </div>
          <Button size="sm" variant="destructive" className="gap-1 text-xs" onClick={stopRecording}>
            <Square className="w-3 h-3" />Стоп
          </Button>
        </div>
      )}

      {/* Recorded preview (not yet applied) */}
      {recordedUrl && !recording && (
        <div className="p-3 bg-muted/50 rounded-lg space-y-2 max-w-[480px]">
          <audio src={recordedUrl} controls className="w-full" />
          <div className="flex gap-2">
            <Button size="sm" className="gap-1 text-xs flex-1" onClick={useRecording}><Check className="w-3 h-3" />Использовать</Button>
            <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={retryRecording}>Перезаписать</Button>
          </div>
        </div>
      )}

      {/* Applied audio player */}
      {block.audioUrl && !recordedUrl && (
        <div className="relative group max-w-[480px]">
          <audio src={block.audioUrl} controls className="w-full" />
          <button className="absolute -top-1 -right-1 bg-destructive text-white rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => onUpdate({ audioUrl: "" })}><X className="w-2.5 h-2.5" /></button>
        </div>
      )}
    </div>
  )
}

/* ──── Info Block Editor ──── */
function InfoBlockEditor({ block, onUpdate }: { block: Block; onUpdate: (p: Partial<Block>) => void }) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const popRef = useRef<HTMLDivElement>(null)

  const style = INFO_STYLES[block.infoStyle]
  const borderCol = block.infoColor || style.borderColor
  const icon = block.infoIcon || style.icon
  const sz = block.infoSize || "m"

  const sizeMap = {
    s: { pad: "py-2 px-3", iconBox: "w-8 h-8", iconText: "text-sm", textCls: "text-sm" },
    m: { pad: "py-3 px-4", iconBox: "w-10 h-10", iconText: "text-lg", textCls: "text-base" },
    l: { pad: "py-4 px-5", iconBox: "w-12 h-12", iconText: "text-2xl", textCls: "text-lg" },
    xl: { pad: "py-5 px-6", iconBox: "w-14 h-14", iconText: "text-3xl", textCls: "text-xl" },
  }
  const ss = sizeMap[sz]

  const presetColors = [
    { c: "#3B82F6", l: "Синий" }, { c: "#F59E0B", l: "Жёлтый" }, { c: "#22C55E", l: "Зелёный" },
    { c: "#EF4444", l: "Красный" }, { c: "#8B5CF6", l: "Фиолетовый" }, { c: "#F97316", l: "Оранжевый" },
    { c: "#6B7280", l: "Серый" },
  ]
  const infoIcons = ["ℹ️","📌","⚠️","✅","❌","💡","🔥","⭐","🎯","📢","🔔","💬","❓","❕"]
  const sizes: { key: "s"|"m"|"l"|"xl"; label: string }[] = [
    { key: "s", label: "S" }, { key: "m", label: "M" }, { key: "l", label: "L" }, { key: "xl", label: "XL" },
  ]

  // Close popover on outside click
  useEffect(() => {
    if (!settingsOpen) return
    const handler = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setSettingsOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [settingsOpen])

  return (
    <div className={cn("rounded-xl w-full min-h-[48px]", ss.pad)} style={{ border: `2px solid ${borderCol}`, borderLeft: `4px solid ${borderCol}` }}>
      <div className="flex gap-3 items-start">
        {/* Icon in circle */}
        <div className={cn("rounded-full flex items-center justify-center flex-shrink-0", ss.iconBox)} style={{ backgroundColor: `${borderCol}20`, border: `2px solid ${borderCol}` }}>
          <span className={ss.iconText}>{icon}</span>
        </div>

        {/* Text */}
        <Textarea
          className={cn("bg-transparent border-0 p-0 focus-visible:ring-0 resize-none flex-1 min-h-0 h-auto", ss.textCls)}
          value={block.content}
          onChange={(e) => onUpdate({ content: e.target.value })}
          placeholder="Текст инфо-блока..."
          rows={1}
        />

        {/* Inline toolbar */}
        <div className="flex items-center gap-0.5 flex-shrink-0 mt-0.5 relative">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground" title="Переменная"><Hash className="w-3.5 h-3.5" /></button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>{VARIABLES.map((v) => <DropdownMenuItem key={v.key} onClick={() => onUpdate({ content: block.content + `{{${v.key}}}` })}>
              <code className="text-xs text-primary mr-2">{`{{${v.key}}}`}</code><span className="text-xs text-muted-foreground">{v.label}</span>
            </DropdownMenuItem>)}</DropdownMenuContent>
          </DropdownMenu>

          <DemoEmojiBtn onSelect={(e) => onUpdate({ content: block.content + e })} />

          <button className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground" title="Настройки" onClick={() => setSettingsOpen(!settingsOpen)}>
            <MoreHorizontal className="w-3.5 h-3.5" />
          </button>

          {/* Settings popover */}
          {settingsOpen && (
            <div ref={popRef} className="absolute top-8 right-0 z-50 bg-popover border border-border rounded-xl shadow-xl p-4 w-[300px] space-y-4">
              {/* Icons */}
              <div>
                <p className="text-[11px] text-muted-foreground font-medium mb-1.5">Выберите иконку:</p>
                <div className="flex flex-wrap gap-1">
                  {infoIcons.map((ic) => (
                    <button key={ic} onClick={() => onUpdate({ infoIcon: ic })} className={cn("w-8 h-8 rounded-lg flex items-center justify-center text-lg hover:bg-muted transition-colors", icon === ic && "bg-primary/10 ring-1 ring-primary")}>{ic}</button>
                  ))}
                </div>
              </div>

              {/* Preset colors */}
              <div>
                <p className="text-[11px] text-muted-foreground font-medium mb-1.5">Стандартные цвета:</p>
                <div className="flex items-center gap-1.5">
                  {presetColors.map((p) => (
                    <button key={p.c} title={p.l} onClick={() => onUpdate({ infoColor: p.c })} className={cn("w-7 h-7 rounded-full border-2 transition-transform hover:scale-110", borderCol === p.c ? "border-foreground scale-110" : "border-transparent")} style={{ backgroundColor: p.c }} />
                  ))}
                </div>
              </div>

              {/* Custom color */}
              <div>
                <p className="text-[11px] text-muted-foreground font-medium mb-1.5">Выберите цвет:</p>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="color" value={borderCol} onChange={(e) => onUpdate({ infoColor: e.target.value })} className="w-8 h-8 rounded border border-border cursor-pointer" />
                  <span className="text-xs text-muted-foreground font-mono">{borderCol}</span>
                </label>
              </div>

              {/* Size */}
              <div>
                <p className="text-[11px] text-muted-foreground font-medium mb-1.5">Размер:</p>
                <div className="flex items-center bg-muted rounded-lg p-0.5">
                  {sizes.map((s) => (
                    <Button key={s.key} variant={sz === s.key ? "default" : "ghost"} size="sm" className="h-7 flex-1 text-xs font-bold" onClick={() => onUpdate({ infoSize: s.key })}>{s.label}</Button>
                  ))}
                </div>
              </div>

              {/* Type */}
              <div>
                <p className="text-[11px] text-muted-foreground font-medium mb-1.5">Тип:</p>
                <div className="flex items-center gap-1">
                  {Object.entries(INFO_STYLES).map(([k, v]) => (
                    <Button key={k} variant={block.infoStyle === k ? "default" : "outline"} size="sm" className="text-xs h-7 gap-1 px-2 flex-1" onClick={() => onUpdate({ infoStyle: k as Block["infoStyle"], infoColor: "", infoIcon: v.icon })}>
                      <span className="text-sm">{v.icon}</span>{v.label}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function TBtn({ icon: I, tip, onClick, disabled, className }: { icon: React.ElementType; tip: string; onClick?: () => void; disabled?: boolean; className?: string }) {
  return <button type="button" title={tip} onMouseDown={(e) => { e.preventDefault(); onClick?.() }} disabled={disabled} className={cn("p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30", className)}><I className="w-3.5 h-3.5" /></button>
}
function Sep() { return <div className="w-px h-5 bg-border mx-0.5" /> }

/* ──── DemoEmojiBtn — единый пикер эмодзи ──── */
function DemoEmojiBtn({ current, onSelect, trigger }: { current?: string; onSelect: (v: string) => void; trigger?: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const [activeCategory, setActiveCategory] = useState(Object.keys(DEMO_CATEGORIES)[0])
  const [search, setSearch] = useState("")
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; availH: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const PICKER_WIDTH = 9 * 37 + 16

  const searchResults = search.trim()
    ? Object.values(DEMO_CATEGORIES).flat().filter((e) => {
        const q = search.toLowerCase()
        return (DEMO_EMOJI_NAMES[e] || "").toLowerCase().includes(q) || e.includes(q)
      })
    : null
  const displayEmojis = searchResults ?? DEMO_CATEGORIES[activeCategory] ?? []

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

  useEffect(() => { if (open) setTimeout(() => searchRef.current?.focus(), 50) }, [open])
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (btnRef.current && !btnRef.current.contains(target)) {
        const picker = document.getElementById("demo-emoji-picker")
        if (!picker || !picker.contains(target)) setOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  return (
    <>
      <button ref={btnRef} onClick={openPicker} title="Эмодзи" className={current ? "text-[1.4rem] leading-none hover:opacity-70 transition-opacity flex-shrink-0 cursor-pointer" : "p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"}>
        {trigger ?? (current ? current : <Smile className="w-3.5 h-3.5" />)}
      </button>
      {open && pos && typeof document !== "undefined" && (
        <div id="demo-emoji-picker"
          style={{ position: "fixed", top: pos.top, bottom: pos.bottom, left: pos.left, width: PICKER_WIDTH, zIndex: 9999, maxHeight: Math.min(560, pos.availH) }}
          className="bg-popover border border-border rounded-xl shadow-xl p-2 flex flex-col gap-1"
        >
          <input ref={searchRef} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск эмодзи..."
            className="w-full text-xs border border-border rounded-lg px-2.5 py-1.5 outline-none focus:border-primary/50 bg-muted/30 placeholder:text-muted-foreground/50" />
          {!search && (
            <div className="grid grid-cols-9 gap-0 pb-1 border-b border-border">
              {DEMO_QUICK.map((e) => (
                <button key={e} onClick={() => { onSelect(e); setOpen(false) }}
                  className={cn("w-[37px] h-[37px] text-[1.44rem] flex items-center justify-center rounded transition-colors leading-none",
                    current === e ? "bg-primary/10 ring-1 ring-primary" : "hover:bg-muted")}>{e}</button>
              ))}
            </div>
          )}
          <div className="grid grid-cols-9 gap-0 overflow-y-auto flex-1 min-h-0">
            {displayEmojis.length > 0
              ? displayEmojis.map((e, i) => (
                  <button key={i} onClick={() => { onSelect(e); setOpen(false) }} title={DEMO_EMOJI_NAMES[e] || e}
                    className={cn("w-[37px] h-[37px] text-[1.44rem] flex items-center justify-center rounded hover:bg-muted transition-colors leading-none",
                      current === e && "bg-primary/10 ring-1 ring-primary")}>{e}</button>
                ))
              : <p className="col-span-9 text-xs text-muted-foreground text-center py-4">Ничего не найдено</p>
            }
          </div>
          {!search && (
            <div className="flex flex-wrap gap-1 border-t border-border pt-1">
              {Object.keys(DEMO_CATEGORIES).map((cat) => (
                <button key={cat} onClick={() => setActiveCategory(cat)}
                  className={cn("text-xs px-2 py-1 rounded-lg transition-all",
                    activeCategory === cat ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground")}>{cat}</button>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  )
}
