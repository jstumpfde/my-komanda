"use client"

import { Suspense, useCallback, useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"
import {
  ChevronLeft,
  Loader2,
  MoreHorizontal,
  Plus,
  Save,
  ScanText,
  Sparkles,
  Trash2,
  Upload,
  GripVertical,
} from "lucide-react"
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { UnifiedBlockEditor } from "@/components/editor/unified-block-editor"
import type { Block, Section } from "@/components/editor/types"
import { blocksToHtml, markdownToBlocks } from "@/lib/core/blocks"
import { cn } from "@/lib/utils"

type FromModule = "knowledge" | "learning" | "hr" | "crm" | "adaptation"

const PREFILL_KEY = "workshop:prefill"

function makeSectionId(): string {
  return `sec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

function makeSection(title: string, emoji = "📄"): Section {
  const id = makeSectionId()
  return { id, key: id, title, emoji, blocks: [] }
}

function htmlToTextBlock(html: string): Block {
  return {
    id: `blk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type: "text",
    content: { html },
    enabled: true,
    order: 0,
  }
}

// ─── Page shell ──────────────────────────────────────────────────────────

export default function WorkshopPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-64 gap-2 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
          Загрузка...
        </div>
      }
    >
      <WorkshopContent />
    </Suspense>
  )
}

function WorkshopContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const fromParam = (searchParams.get("from") || "") as FromModule | ""
  const from: FromModule | null =
    fromParam === "knowledge" ||
    fromParam === "learning" ||
    fromParam === "hr" ||
    fromParam === "crm" ||
    fromParam === "adaptation"
      ? fromParam
      : null
  const articleId = searchParams.get("id")
  const prefillFlag = searchParams.get("prefill") === "true"

  const [title, setTitle] = useState("")
  const [sections, setSections] = useState<Section[]>(() => [
    makeSection("Страница 1"),
  ])
  const [activeSectionId, setActiveSectionId] = useState<string | null>(
    () => null,
  )
  const [loading, setLoading] = useState(!!articleId)
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState(false)

  const [aiPanelOpen, setAiPanelOpen] = useState(false)
  const [aiPrompt, setAiPrompt] = useState("")
  const [aiLoading, setAiLoading] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const ocrInputRef = useRef<HTMLInputElement>(null)

  // Init active section on first render
  useEffect(() => {
    if (activeSectionId === null && sections.length > 0) {
      setActiveSectionId(sections[0].id)
    }
  }, [activeSectionId, sections])

  // ── Prefill from sessionStorage (2.2 handoff path) ───────────────────────
  useEffect(() => {
    if (articleId || !prefillFlag) return
    try {
      const raw = sessionStorage.getItem(PREFILL_KEY)
      if (!raw) return
      const data = JSON.parse(raw) as {
        title?: string
        blocks?: Block[]
        content?: string
      }
      if (data.title) setTitle(data.title)
      if (Array.isArray(data.blocks) && data.blocks.length > 0) {
        const s = makeSection("Страница 1")
        s.blocks = data.blocks.map((b, i) => ({ ...b, order: i }))
        setSections([s])
        setActiveSectionId(s.id)
      } else if (data.content) {
        const s = makeSection("Страница 1")
        s.blocks = [htmlToTextBlock(data.content)]
        setSections([s])
        setActiveSectionId(s.id)
      }
      sessionStorage.removeItem(PREFILL_KEY)
    } catch {
      // ignore malformed payload
    }
  }, [articleId, prefillFlag])

  // ── Load existing article for editing ────────────────────────────────────
  useEffect(() => {
    if (!articleId) return
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(
          `/api/modules/knowledge/articles/${articleId}`,
        )
        const payload = await res.json()
        const article = payload?.data ?? payload
        if (cancelled) return
        if (!res.ok || article?.error) {
          toast.error(article?.error || "Не удалось загрузить")
          setLoading(false)
          return
        }
        setTitle(article.title || "")
        const s = makeSection("Страница 1")
        s.blocks = article.content
          ? [htmlToTextBlock(article.content)]
          : []
        setSections([s])
        setActiveSectionId(s.id)
      } catch {
        if (!cancelled) toast.error("Ошибка сети")
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [articleId])

  // ── Section helpers ──────────────────────────────────────────────────────

  const activeSection =
    sections.find((s) => s.id === activeSectionId) ?? sections[0] ?? null

  const updateSectionBlocks = useCallback(
    (sectionId: string, nextBlocks: Block[]) => {
      setSections((prev) =>
        prev.map((s) =>
          s.id === sectionId
            ? { ...s, blocks: nextBlocks.map((b, i) => ({ ...b, order: i })) }
            : s,
        ),
      )
    },
    [],
  )

  const appendBlocksToActive = useCallback(
    (blocks: Block[]) => {
      if (!activeSection || blocks.length === 0) return
      const base = activeSection.blocks.length
      const merged = [
        ...activeSection.blocks,
        ...blocks.map((b, i) => ({ ...b, order: base + i })),
      ]
      updateSectionBlocks(activeSection.id, merged)
    },
    [activeSection, updateSectionBlocks],
  )

  function handleAddSection() {
    const s = makeSection(`Страница ${sections.length + 1}`)
    setSections((prev) => [...prev, s])
    setActiveSectionId(s.id)
  }

  function handleDeleteSection(id: string) {
    if (sections.length <= 1) {
      toast.error("Нужна хотя бы одна страница")
      return
    }
    setSections((prev) => {
      const next = prev.filter((s) => s.id !== id)
      if (id === activeSectionId) {
        setActiveSectionId(next[0]?.id ?? null)
      }
      return next
    })
  }

  function handleRenameSection(id: string, nextTitle: string) {
    setSections((prev) =>
      prev.map((s) => (s.id === id ? { ...s, title: nextTitle } : s)),
    )
  }

  // ── Section drag-drop ────────────────────────────────────────────────────

  const sectionSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  function handleSectionDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setSections((prev) => {
      const oldIndex = prev.findIndex((s) => s.id === active.id)
      const newIndex = prev.findIndex((s) => s.id === over.id)
      if (oldIndex === -1 || newIndex === -1) return prev
      return arrayMove(prev, oldIndex, newIndex)
    })
  }

  // ── Content sources: AI / File / OCR ─────────────────────────────────────

  async function handleAiGenerate() {
    const prompt = aiPrompt.trim()
    if (!prompt) {
      toast.error("Опишите, что нужно сгенерировать")
      return
    }
    setAiLoading(true)
    try {
      const res = await fetch("/api/core/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          targetModule: from ?? "knowledge",
          language: "ru",
        }),
      })
      const data = (await res.json()) as {
        ok?: boolean
        title?: string
        text?: string
        blocks?: Block[]
        error?: string
      }
      if (!res.ok) {
        toast.error(data.error || "Не удалось сгенерировать")
        return
      }
      const newBlocks: Block[] =
        Array.isArray(data.blocks) && data.blocks.length > 0
          ? data.blocks
          : markdownToBlocks(data.text ?? "")
      appendBlocksToActive(newBlocks)
      if (!title.trim() && data.title) setTitle(data.title)
      setAiPrompt("")
      setAiPanelOpen(false)
      toast.success("Добавлено в страницу")
    } catch {
      toast.error("Ошибка сети")
    } finally {
      setAiLoading(false)
    }
  }

  async function handleParseFile(file: File) {
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch("/api/core/parse-file", {
        method: "POST",
        body: fd,
      })
      const data = (await res.json()) as {
        ok?: boolean
        title?: string
        text?: string
        error?: string
      }
      if (!res.ok) {
        toast.error(data.error || "Не удалось обработать файл")
        return
      }
      appendBlocksToActive(markdownToBlocks(data.text ?? ""))
      if (!title.trim() && data.title) setTitle(data.title)
      toast.success("Текст добавлен")
    } catch {
      toast.error("Ошибка сети")
    } finally {
      setBusy(false)
    }
  }

  async function handleOcr(file: File) {
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch("/api/core/ocr", {
        method: "POST",
        body: fd,
      })
      const data = (await res.json()) as {
        ok?: boolean
        title?: string
        text?: string
        error?: string
      }
      if (!res.ok) {
        toast.error(data.error || "Не удалось распознать")
        return
      }
      appendBlocksToActive(markdownToBlocks(data.text ?? ""))
      if (!title.trim() && data.title) setTitle(data.title)
      toast.success("Текст распознан")
    } catch {
      toast.error("Ошибка сети")
    } finally {
      setBusy(false)
    }
  }

  // ── Save / Back ──────────────────────────────────────────────────────────

  function serializeContent(): string {
    return sections
      .map((s) => {
        const heading =
          s.title && s.title.trim() ? `<h2>${escapeHtml(s.title)}</h2>` : ""
        return [heading, blocksToHtml(s.blocks)].filter(Boolean).join("\n")
      })
      .filter(Boolean)
      .join("\n\n")
  }

  async function handleSave() {
    const trimmed = title.trim()
    if (!trimmed) {
      toast.error("Введите заголовок материала")
      return
    }
    const content = serializeContent()

    setSaving(true)
    try {
      if (from === "knowledge") {
        const res = await fetch("/api/modules/knowledge/articles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: trimmed,
            content,
            status: "draft",
            audience: ["employees"],
            reviewCycle: "none",
          }),
        })
        const data = await res.json()
        if (!res.ok) {
          toast.error(data.error || "Ошибка сохранения")
          return
        }
        toast.success("Черновик сохранён")
        router.push("/knowledge-v2")
        return
      }
      if (from === "learning") {
        toast.success(`Материал «${trimmed}» создан`)
        router.push("/learning/courses")
        return
      }
      if (from === "hr" || from === "crm" || from === "adaptation") {
        toast.success(`Материал «${trimmed}» создан`)
        router.back()
        return
      }
      toast.success("Сохранено")
    } catch {
      toast.error("Ошибка сети")
    } finally {
      setSaving(false)
    }
  }

  function handleBack() {
    if (from === "knowledge") router.push("/knowledge-v2")
    else if (from === "learning") router.push("/learning/courses")
    else router.back()
  }

  // ── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <SidebarProvider defaultOpen>
        <DashboardSidebar />
        <SidebarInset>
          <DashboardHeader />
          <div className="flex items-center justify-center h-64 gap-2 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
            Загрузка...
          </div>
        </SidebarInset>
      </SidebarProvider>
    )
  }

  return (
    <SidebarProvider defaultOpen>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <div className="flex-1 flex flex-col min-w-0 bg-background">
          {/* Top bar */}
          <div className="flex items-center gap-3 px-6 py-3 border-b shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBack}
              className="gap-1.5 shrink-0"
            >
              <ChevronLeft className="w-4 h-4" />
              Назад
            </Button>
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <Sparkles className="w-4 h-4 text-violet-500 shrink-0" />
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Заголовок материала"
                maxLength={200}
                className="border-none shadow-none bg-transparent text-base font-semibold focus-visible:ring-0 focus-visible:ring-offset-0 px-0 h-9"
              />
            </div>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="gap-1.5 shrink-0"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Сохранить
            </Button>
          </div>

          {/* Body: section sidebar + editor + tool rail */}
          <div className="flex-1 flex min-h-0 overflow-hidden">
            {/* Section sidebar */}
            <aside className="w-64 shrink-0 border-r overflow-y-auto bg-muted/20">
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Страницы
                  </h3>
                  <span className="text-xs text-muted-foreground">
                    {sections.length}
                  </span>
                </div>
                <DndContext
                  sensors={sectionSensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleSectionDragEnd}
                >
                  <SortableContext
                    items={sections.map((s) => s.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="space-y-1">
                      {sections.map((s) => (
                        <SectionRow
                          key={s.id}
                          section={s}
                          active={s.id === activeSectionId}
                          canDelete={sections.length > 1}
                          onSelect={() => setActiveSectionId(s.id)}
                          onRename={(t) => handleRenameSection(s.id, t)}
                          onDelete={() => handleDeleteSection(s.id)}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start mt-2 gap-1.5 text-muted-foreground"
                  onClick={handleAddSection}
                >
                  <Plus className="w-3.5 h-3.5" />
                  Добавить страницу
                </Button>
              </div>
            </aside>

            {/* Editor */}
            <main className="flex-1 overflow-y-auto min-w-0">
              <div className="max-w-4xl mx-auto px-6 py-6">
                {activeSection ? (
                  <UnifiedBlockEditor
                    blocks={activeSection.blocks}
                    onBlocksChange={(next) =>
                      updateSectionBlocks(activeSection.id, next)
                    }
                    placeholder="Добавьте блок или используйте AI / Файл / OCR справа"
                  />
                ) : null}
              </div>
            </main>

            {/* Tool rail */}
            <aside className="w-16 shrink-0 border-l flex flex-col items-center gap-1 py-4 bg-muted/20">
              <ToolButton
                icon={Sparkles}
                label="AI"
                onClick={() => setAiPanelOpen(true)}
                busy={busy}
              />
              <ToolButton
                icon={Upload}
                label="Файл"
                onClick={() => fileInputRef.current?.click()}
                busy={busy}
              />
              <ToolButton
                icon={ScanText}
                label="OCR"
                onClick={() => ocrInputRef.current?.click()}
                busy={busy}
              />
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.doc,.txt,.md,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void handleParseFile(file)
                  e.target.value = ""
                }}
              />
              <input
                ref={ocrInputRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp,image/jpeg,image/png,image/webp,application/pdf"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void handleOcr(file)
                  e.target.value = ""
                }}
              />
            </aside>
          </div>

          {/* AI panel */}
          <Sheet open={aiPanelOpen} onOpenChange={setAiPanelOpen}>
            <SheetContent side="right" className="w-full sm:max-w-md p-0">
              <SheetHeader className="px-6 py-4 border-b">
                <SheetTitle className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-violet-500" />
                  AI-генерация
                </SheetTitle>
              </SheetHeader>
              <div className="px-6 py-4 space-y-3">
                <label className="text-sm font-medium">
                  Опишите, что нужно добавить в страницу «
                  {activeSection?.title ?? "Страница"}»
                </label>
                <Textarea
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder="Например: раздел про сроки согласования отпуска"
                  rows={8}
                  className="resize-none"
                />
                <p className="text-xs text-muted-foreground">
                  Сгенерированные блоки добавятся в конец текущей страницы.
                </p>
                <Button
                  onClick={handleAiGenerate}
                  disabled={aiLoading || !aiPrompt.trim()}
                  className="w-full gap-1.5"
                >
                  {aiLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  Сгенерировать
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}

// ─── Section row ─────────────────────────────────────────────────────────

interface SectionRowProps {
  section: Section
  active: boolean
  canDelete: boolean
  onSelect: () => void
  onRename: (title: string) => void
  onDelete: () => void
}

function SectionRow({
  section,
  active,
  canDelete,
  onSelect,
  onRename,
  onDelete,
}: SectionRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section.id })

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(section.title)

  useEffect(() => {
    if (!editing) setDraft(section.title)
  }, [section.title, editing])

  function commit() {
    const t = draft.trim() || section.title
    onRename(t)
    setEditing(false)
  }

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group flex items-center gap-1 rounded-md px-1.5 py-1 transition-colors",
        active
          ? "bg-primary/10 text-foreground"
          : "hover:bg-muted/60 text-muted-foreground hover:text-foreground",
      )}
    >
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing p-1 opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity"
        {...attributes}
        {...listeners}
        aria-label="Перетащить"
      >
        <GripVertical className="w-3 h-3" />
      </button>
      <span className="text-base shrink-0">{section.emoji}</span>
      {editing ? (
        <Input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit()
            if (e.key === "Escape") {
              setDraft(section.title)
              setEditing(false)
            }
          }}
          className="h-6 text-sm py-0 px-1 flex-1"
        />
      ) : (
        <button
          type="button"
          onClick={onSelect}
          onDoubleClick={() => setEditing(true)}
          className="flex-1 text-left text-sm truncate py-0.5"
        >
          {section.title}
        </button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="p-1 opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity"
            aria-label="Меню страницы"
          >
            <MoreHorizontal className="w-3.5 h-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem onClick={() => setEditing(true)}>
            Переименовать
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={onDelete}
            disabled={!canDelete}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="w-3.5 h-3.5 mr-2" />
            Удалить
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

// ─── Tool rail button ────────────────────────────────────────────────────

interface ToolButtonProps {
  icon: React.ComponentType<{ className?: string }>
  label: string
  onClick: () => void
  busy?: boolean
}

function ToolButton({ icon: Icon, label, onClick, busy }: ToolButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={cn(
        "w-12 h-14 rounded-md flex flex-col items-center justify-center gap-0.5",
        "text-muted-foreground hover:text-foreground hover:bg-background transition-colors",
        busy && "opacity-50 cursor-wait",
      )}
    >
      <Icon className="w-4 h-4" />
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}
