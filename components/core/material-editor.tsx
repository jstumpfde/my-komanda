"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import {
  ChevronLeft,
  Eye,
  FileText,
  FileUp,
  Loader2,
  Save,
  ScanLine,
  Sparkles,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Progress } from "@/components/ui/progress"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { AiAssistantWidget } from "@/components/knowledge/ai-assistant-widget"
import {
  NotionEditor,
  type NotionEditorHandle,
} from "@/components/vacancies/notion-editor"
import {
  DEFAULT_LESSONS,
  createBlock,
  createDemo as createDemoObject,
  type Block,
  type BlockType,
  type Demo,
  type Lesson,
} from "@/lib/course-types"

// ─── Props ────────────────────────────────────────────────────────────────

export interface MaterialEditorProps {
  /** Back-link destination (used by header chevron and NotionEditor back) */
  backUrl: string
  /** Render the "Ненси" AiAssistantWidget in the page corner */
  showNancy?: boolean
  /** Render AI / File / OCR buttons in the top toolbar */
  showAiTools?: boolean
  /** Render the "Импорт" button + dialog (legacy parser) */
  showImport?: boolean
  /** Render the "Предпросмотр" button */
  showPreview?: boolean
  /** Template for preview-window URL. `{id}` is replaced with the saved id */
  previewUrlPattern?: string
  /** Base URL for list/POST and `${url}/${id}` for GET/PATCH */
  saveApiUrl?: string
  /** Parse-document API for the legacy "Импорт" button */
  parseApiUrl?: string
}

// ─── Markdown → Lesson[] helper (AI and File tabs) ───────────────────────

function pickEmoji(title: string): string {
  const t = title.toLowerCase()
  if (/привет|знаком|intro|introduction/.test(t)) return "👋"
  if (/задани|тест|вопрос/.test(t)) return "✅"
  if (/видео/.test(t)) return "🎥"
  if (/компан|about/.test(t)) return "🏢"
  if (/офис|график/.test(t)) return "📍"
  if (/зарплат|доход|бонус/.test(t)) return "💰"
  if (/рост|карьер/.test(t)) return "📈"
  if (/адаптац|онбординг|onboarding/.test(t)) return "🚀"
  if (/итог|финал|summary|результат/.test(t)) return "➡️"
  return "📄"
}

function markdownToLessons(md: string): Lesson[] {
  let text = md.trim()
  if (!text) return []

  // Отбрасываем верхний "# Заголовок" — он становится именем документа,
  // не отдельным уроком.
  text = text.replace(/^#\s+.+\n+/, "")

  const lines = text.split("\n")
  const sections: { title: string; body: string }[] = []
  let current: { title: string; body: string[] } | null = null

  for (const line of lines) {
    const h2 = line.match(/^##\s+(.+)$/)
    if (h2) {
      if (current) {
        sections.push({
          title: current.title,
          body: current.body.join("\n").trim(),
        })
      }
      current = { title: h2[1].trim(), body: [] }
      continue
    }
    if (!current) current = { title: "Новый урок", body: [] }
    current.body.push(line)
  }
  if (current) {
    sections.push({
      title: current.title,
      body: current.body.join("\n").trim(),
    })
  }

  // Если ## не было вообще — весь текст идёт одним уроком.
  if (sections.length === 0) {
    sections.push({ title: "Новый урок", body: text })
  }

  const ts = Date.now()
  return sections
    .filter((s) => s.title.trim() || s.body.trim())
    .map((s, i) => {
      const cleanBody = s.body
        .split("\n")
        .map((l) =>
          l
            .replace(/^#+\s+/, "")
            .replace(/^\s*[-*]\s+/, "• ")
            .replace(/\*\*(.+?)\*\*/g, "$1")
            .replace(/`([^`]+)`/g, "$1"),
        )
        .join("\n")
        .trim()
      const blocks: Block[] = cleanBody
        ? [
            {
              ...createBlock("text"),
              id: `blk-ai-${ts}-${i}`,
              content: cleanBody,
            },
          ]
        : []
      return {
        id: `lesson-ai-${ts}-${i}`,
        emoji: pickEmoji(s.title),
        title: s.title.slice(0, 76),
        blocks,
      }
    })
}

// ─── Component ────────────────────────────────────────────────────────────

export function MaterialEditor({
  backUrl,
  showNancy = false,
  showAiTools = false,
  showImport = true,
  showPreview = true,
  previewUrlPattern = "/hr/library/preview/{id}",
  saveApiUrl = "/api/demo-templates",
  parseApiUrl = "/api/demo-templates/parse-document",
}: MaterialEditorProps) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const length = searchParams.get("length") ?? "standard"
  const department = searchParams.get("department") ?? ""
  const initialName = searchParams.get("name") ?? ""
  const position = searchParams.get("position") ?? ""
  const templateId = searchParams.get("id")

  const [demo, setDemo] = useState<Demo>(() =>
    createDemoObject(
      initialName || `Демонстрация: ${position}`,
      DEFAULT_LESSONS,
    ),
  )
  const [demoName, setDemoName] = useState(
    initialName || `Демонстрация: ${position}`,
  )
  const [savedId, setSavedId] = useState<string | null>(templateId)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(!!templateId)

  // Legacy import dialog
  const [importOpen, setImportOpen] = useState(false)
  const [importing, setImporting] = useState(false)
  const importFileRef = useRef<HTMLInputElement>(null)

  // Core AI tools
  const [aiOpen, setAiOpen] = useState(false)
  const [aiPrompt, setAiPrompt] = useState("")
  const [aiLoading, setAiLoading] = useState(false)
  const [aiBusy, setAiBusy] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const ocrInputRef = useRef<HTMLInputElement>(null)

  const editorRef = useRef<NotionEditorHandle>(null)

  // ── Load existing template ──────────────────────────────────────────────
  useEffect(() => {
    if (!templateId) return
    fetch(`${saveApiUrl}/${templateId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          toast.error(data.error)
          setLoading(false)
          return
        }
        const tmpl = data.data ?? data
        setDemoName((tmpl.name || "").slice(0, 76))
        const lessons =
          Array.isArray(tmpl.sections) && tmpl.sections.length > 0
            ? tmpl.sections
            : DEFAULT_LESSONS
        setDemo(createDemoObject(tmpl.name || "", lessons))
        setLoading(false)
      })
      .catch(() => {
        toast.error("Ошибка загрузки шаблона")
        setLoading(false)
      })
  }, [templateId, saveApiUrl])

  const handleUpdate = useCallback((updated: Demo) => setDemo(updated), [])

  // ── Save ────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true)
    try {
      if (savedId) {
        const res = await fetch(`${saveApiUrl}/${savedId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: demoName, sections: demo.lessons }),
        })
        const data = await res.json()
        if (!res.ok) {
          toast.error(data.error || "Ошибка сохранения")
          return
        }
        toast.success("Сохранено")
      } else {
        const res = await fetch(saveApiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: demoName,
            niche: department || "universal",
            length,
            sections: demo.lessons,
          }),
        })
        const data = await res.json()
        if (!res.ok) {
          toast.error(data.error || "Ошибка сохранения")
          return
        }
        const newId = (data.data ?? data).id
        setSavedId(newId)
        const url = new URL(window.location.href)
        url.searchParams.set("id", newId)
        window.history.replaceState({}, "", url.toString())
        toast.success("Сохранено")
      }
    } catch {
      toast.error("Ошибка сети")
    } finally {
      setSaving(false)
    }
  }

  // ── Preview ─────────────────────────────────────────────────────────────
  const handlePreview = async () => {
    // Open window synchronously to avoid popup blockers after await.
    const previewWindow = window.open("about:blank", "_blank")
    if (!previewWindow) {
      toast.error("Разрешите всплывающие окна для предпросмотра")
      return
    }

    let id = savedId
    try {
      if (!id) {
        setSaving(true)
        const res = await fetch(saveApiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: demoName,
            niche: department || "universal",
            length,
            sections: demo.lessons,
          }),
        })
        const data = await res.json()
        if (!res.ok) {
          toast.error(data.error || "Ошибка сохранения")
          previewWindow.close()
          setSaving(false)
          return
        }
        id = (data.data ?? data).id
        setSavedId(id)
        const url = new URL(window.location.href)
        url.searchParams.set("id", id!)
        window.history.replaceState({}, "", url.toString())
        toast.success("Сохранено")
        setSaving(false)
      } else {
        await fetch(`${saveApiUrl}/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: demoName, sections: demo.lessons }),
        })
      }
      previewWindow.location.href = previewUrlPattern.replace("{id}", id!)
    } catch {
      toast.error("Ошибка сети")
      previewWindow.close()
      setSaving(false)
    }
  }

  // ── Legacy import (AI-structured DOCX/PDF → lessons) ────────────────────
  const handleImportFile = async (file: File, mode: "replace" | "append") => {
    setImporting(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      const res = await fetch(parseApiUrl, { method: "POST", body: formData })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || "Ошибка парсинга")
        return
      }

      const parsed = (
        data.lessons as {
          emoji: string
          title: string
          blocks: { type: string; content: string }[]
        }[]
      ).map((l, i) => ({
        id: `lesson-imp-${Date.now()}-${i}`,
        emoji: l.emoji || "📄",
        title: l.title,
        blocks: l.blocks.map((b, j) => ({
          ...createBlock(b.type as BlockType),
          id: `blk-imp-${Date.now()}-${i}-${j}`,
          content: b.content,
        })),
      }))

      if (mode === "replace") {
        setDemo((prev) => ({ ...prev, lessons: parsed }))
      } else {
        setDemo((prev) => ({ ...prev, lessons: [...prev.lessons, ...parsed] }))
      }
      toast.success(
        `${parsed.length} ${
          parsed.length === 1 ? "урок импортирован" : "уроков импортировано"
        }`,
      )
      setImportOpen(false)
    } catch {
      toast.error("Ошибка сети")
    } finally {
      setImporting(false)
    }
  }

  // ── Core AI tools ───────────────────────────────────────────────────────

  function appendLessons(lessons: Lesson[]) {
    if (lessons.length === 0) return
    setDemo((prev) => ({ ...prev, lessons: [...prev.lessons, ...lessons] }))
  }

  const handleAiGenerate = async () => {
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
          targetModule: "knowledge",
          language: "ru",
        }),
      })
      const data = (await res.json()) as {
        ok?: boolean
        title?: string
        text?: string
        error?: string
      }
      if (!res.ok) {
        toast.error(data.error || "Не удалось сгенерировать")
        return
      }
      const lessons = markdownToLessons(data.text ?? "")
      if (lessons.length === 0) {
        toast.error("Пустой ответ от AI")
        return
      }
      appendLessons(lessons)
      toast.success(`Добавлено уроков: ${lessons.length}`)
      setAiPrompt("")
      setAiOpen(false)
    } catch {
      toast.error("Ошибка сети")
    } finally {
      setAiLoading(false)
    }
  }

  const handleAiFile = async (file: File) => {
    setAiBusy(true)
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
      const lessons = markdownToLessons(data.text ?? "")
      if (lessons.length === 0) {
        toast.error("Не удалось разобрать файл")
        return
      }
      appendLessons(lessons)
      toast.success(`Добавлено уроков: ${lessons.length}`)
    } catch {
      toast.error("Ошибка сети")
    } finally {
      setAiBusy(false)
    }
  }

  const handleAiOcr = async (file: File) => {
    setAiBusy(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch("/api/core/ocr", { method: "POST", body: fd })
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
      const text = (data.text ?? "").trim()
      if (!text) {
        toast.error("Пустой результат OCR")
        return
      }
      const ts = Date.now()
      setDemo((prev) => {
        const newBlock: Block = {
          ...createBlock("text"),
          id: `blk-ocr-${ts}`,
          content: text,
        }
        if (prev.lessons.length === 0) {
          const newLesson: Lesson = {
            id: `lesson-ocr-${ts}`,
            emoji: "📸",
            title: (data.title || "OCR документ").slice(0, 76),
            blocks: [newBlock],
          }
          return { ...prev, lessons: [newLesson] }
        }
        const last = prev.lessons[prev.lessons.length - 1]
        const lessons = [...prev.lessons]
        lessons[lessons.length - 1] = {
          ...last,
          blocks: [...last.blocks, newBlock],
        }
        return { ...prev, lessons }
      })
      toast.success("Текст распознан и добавлен")
    } catch {
      toast.error("Ошибка сети")
    } finally {
      setAiBusy(false)
    }
  }

  // ── Progress ────────────────────────────────────────────────────────────
  const filledLessons = demo.lessons.filter((l) =>
    l.blocks.some((b) => b.content.trim()),
  ).length
  const totalLessons = demo.lessons.length
  const progressPct =
    totalLessons > 0 ? Math.round((filledLessons / totalLessons) * 100) : 0

  // ── Render ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 gap-2 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" />
        Загрузка...
      </div>
    )
  }

  return (
    <>
      <div className="flex-1 overflow-auto bg-background min-w-0">
        <div className="py-4" style={{ paddingLeft: 56, paddingRight: 56 }}>
          {/* Top bar */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <Link href={backUrl}>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
              </Link>
              <Input
                value={demoName}
                onChange={(e) => {
                  setDemoName(e.target.value)
                  setDemo((prev) => ({ ...prev, title: e.target.value }))
                }}
                maxLength={76}
                className="text-lg font-semibold border-none shadow-none px-0 h-auto bg-transparent focus-visible:ring-0 flex-1 min-w-0"
                placeholder="Название демонстрации"
              />
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {showAiTools && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 text-xs"
                    onClick={() => setAiOpen(true)}
                    disabled={aiBusy}
                    title="Сгенерировать уроки через AI"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    AI
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 text-xs"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={aiBusy}
                    title="Импортировать текст из файла (PDF/DOCX/TXT/MD)"
                  >
                    {aiBusy ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <FileText className="w-3.5 h-3.5" />
                    )}
                    Файл
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 gap-1.5 text-xs"
                    onClick={() => ocrInputRef.current?.click()}
                    disabled={aiBusy}
                    title="Распознать текст из фото/PDF"
                  >
                    <ScanLine className="w-3.5 h-3.5" />
                    OCR
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.docx,.doc,.txt,.md,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) void handleAiFile(f)
                      e.target.value = ""
                    }}
                  />
                  <input
                    ref={ocrInputRef}
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.webp,image/jpeg,image/png,image/webp,application/pdf"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (f) void handleAiOcr(f)
                      e.target.value = ""
                    }}
                  />
                </>
              )}
              {showPreview && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                  onClick={handlePreview}
                >
                  <Eye className="w-3.5 h-3.5" />
                  Предпросмотр
                </Button>
              )}
              {showImport && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 text-xs"
                  onClick={() => setImportOpen(true)}
                >
                  <FileUp className="w-3.5 h-3.5" />
                  Импорт
                </Button>
              )}
              <Button
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                {saving ? "Сохранение..." : "Сохранить"}
              </Button>
            </div>
          </div>

          {/* Progress */}
          <div className="flex items-center gap-3 mb-3">
            <Progress value={progressPct} className="flex-1 h-2" />
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              Заполнено на {progressPct}% ({filledLessons}/{totalLessons})
            </span>
          </div>

          {/* Notion Editor */}
          <NotionEditor
            ref={editorRef}
            demo={demo}
            onBack={() => router.push(backUrl)}
            onUpdate={handleUpdate}
            hideToolbar
            onOpenLibrary={() => editorRef.current?.openLibrary()}
          />
        </div>
      </div>

      {/* Legacy import dialog */}
      {showImport && (
        <Dialog open={importOpen} onOpenChange={setImportOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Импорт документа</DialogTitle>
            </DialogHeader>
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                const file = e.dataTransfer.files?.[0]
                if (file) void handleImportFile(file, "append")
              }}
              onClick={() => importFileRef.current?.click()}
              className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
            >
              {importing ? (
                <div className="flex items-center justify-center gap-2 text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Парсинг документа...
                </div>
              ) : (
                <>
                  <FileUp className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm font-medium">
                    Перетащите файл или нажмите для выбора
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    DOCX, PDF, TXT, MD · Макс 50 МБ
                  </p>
                </>
              )}
              <input
                ref={importFileRef}
                type="file"
                accept=".docx,.pdf,.txt,.md"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  void handleImportFile(file, "append")
                }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Уроки из документа будут добавлены к существующим
            </p>
          </DialogContent>
        </Dialog>
      )}

      {/* AI prompt dialog */}
      {showAiTools && (
        <Dialog open={aiOpen} onOpenChange={setAiOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-violet-500" />
                AI-генерация уроков
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <label className="text-sm font-medium">
                Опишите материал, который нужно создать
              </label>
              <Textarea
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                rows={6}
                placeholder="Например: онбординг для нового менеджера по продажам — знакомство, продукт, скрипты, CRM, отчётность"
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground">
                Ответ AI разбивается на уроки по <code>##</code> заголовкам и
                добавляется в конец списка уроков.
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
          </DialogContent>
        </Dialog>
      )}

      {showNancy && <AiAssistantWidget />}
    </>
  )
}
