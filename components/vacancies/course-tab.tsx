"use client"

import React, { useState, useCallback, forwardRef, useImperativeHandle, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Loader2, Check, AlertCircle, Sparkles, Clock } from "lucide-react"
import { type Demo, type Lesson, createBlock } from "@/lib/course-types"
import { DEMO_TEMPLATES, type DemoTemplateId } from "@/lib/hr/demo-templates"
import { NotionEditor, type NotionEditorHandle } from "./notion-editor"
import { useDemo } from "@/hooks/use-demo"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

const LESSON_EMOJIS = ["📘", "📗", "📙", "📕", "📔", "📓", "📒", "📖"]

function splitTextIntoLessons(text: string, fileName: string): Lesson[] {
  const fallbackTitle = fileName.replace(/\.(docx?|pdf|txt)$/i, "").trim() || "Новый урок"
  const normalized = text.replace(/\r\n/g, "\n")

  const markerRe = /(?:^|\s)(?:#+\s*)?(?:Урок|Блок|Глава)\s*(\d+)\s*[:.\-–—)]?\s*/gi
  type Match = { index: number; endIndex: number; num: string }
  const matches: Match[] = []
  let m: RegExpExecArray | null
  while ((m = markerRe.exec(normalized)) !== null) {
    const leading = m[0].match(/^\s*/)?.[0].length ?? 0
    matches.push({
      index: m.index + leading,
      endIndex: m.index + m[0].length,
      num: m[1],
    })
  }

  if (matches.length === 0) {
    const block = createBlock("text")
    block.content = normalized.trim()
    return [{ id: `lesson-file-${Date.now()}`, emoji: "📄", title: fallbackTitle, blocks: [block] }]
  }

  const result: Lesson[] = []
  const baseId = Date.now()

  const introText = normalized.slice(0, matches[0].index).trim()
  if (introText) {
    const block = createBlock("text")
    block.content = introText
    result.push({ id: `lesson-file-${baseId}-intro`, emoji: "📄", title: fallbackTitle, blocks: [block] })
  }

  matches.forEach((match, i) => {
    const end = i + 1 < matches.length ? matches[i + 1].index : normalized.length
    const body = normalized.slice(match.endIndex, end).trim()

    let title = `${match.num}`
    let content = body
    const nlIdx = body.indexOf("\n")
    const firstLine = (nlIdx >= 0 ? body.slice(0, nlIdx) : body).trim()
    const sentenceMatch = firstLine.match(/^(.{3,120}?)(?:[.!?—–]|\s—\s)/)
    if (sentenceMatch) {
      title = `${sentenceMatch[1].trim()}`
      content = body.slice(sentenceMatch[0].length).trim()
    } else if (firstLine && firstLine.length <= 120) {
      title = `${firstLine}`
      content = nlIdx >= 0 ? body.slice(nlIdx + 1).trim() : ""
    }

    const block = createBlock("text")
    // Преобразуем plain text → HTML: параграфы через \n\n, переносы через <br>
    const rawText = content || body
    const htmlContent = rawText
      .split(/\n\s*\n/)
      .map(p => p.trim())
      .filter(p => p.length > 0)
      .map(p => `<p style="margin:0 0 12px 0;line-height:1.55">${p.replace(/\n/g, "<br>")}</p>`)
      .join("")
    block.content = htmlContent || rawText
    result.push({
      id: `lesson-file-${baseId}-${i}`,
      emoji: LESSON_EMOJIS[i % LESSON_EMOJIS.length],
      title,
      blocks: [block],
    })
  })

  return result
}

export interface CourseTabHandle {
  openAiGenerate: () => void
  openFileUpload: () => void
}

interface CourseTabProps {
  vacancyId: string
  vacancyTitle?: string
  editorRef?: React.Ref<NotionEditorHandle>
  tabRef?: React.Ref<CourseTabHandle>
  onSaveStatusChange?: (status: "saved" | "saving") => void
}

export const CourseTab = forwardRef<NotionEditorHandle, CourseTabProps>(
  function CourseTab({ vacancyId, vacancyTitle, editorRef, tabRef, onSaveStatusChange }, _ref) {
    const { demo, loading, error, saveStatus, createDemo, updateDemo } = useDemo(vacancyId)
    const [generating, setGenerating] = useState(false)
    const [genProgress, setGenProgress] = useState<{ current: number; total: number } | null>(null)
    const [aiDialogOpen, setAiDialogOpen] = useState(false)
    const [selectedTemplate, setSelectedTemplate] = useState<DemoTemplateId>("medium")
    const [selectedTone, setSelectedTone] = useState<"energetic" | "friendly" | "business" | "direct">("friendly")
    const autoCreatingRef = useRef(false)

    // Sync save status to parent
    useEffect(() => {
      if (!onSaveStatusChange) return
      if (saveStatus === "saving") onSaveStatusChange("saving")
      else if (saveStatus === "saved") onSaveStatusChange("saved")
    }, [saveStatus, onSaveStatusChange])

    const handleUpdateDemo = useCallback((updated: Demo) => {
      updateDemo(updated)
    }, [updateDemo])

    // Auto-create empty demo if none exists — пользователь сразу в редакторе
    useEffect(() => {
      if (loading || demo || error || autoCreatingRef.current) return
      autoCreatingRef.current = true
      const lesson: Lesson = {
        id: `les-${Date.now()}`,
        emoji: "📄",
        title: "Новый урок",
        blocks: [createBlock("text")],
      }
      createDemo(vacancyTitle || "Демонстрация должности", [lesson])
        .catch(() => toast.error("Не удалось создать демонстрацию"))
    }, [loading, demo, error, vacancyTitle, createDemo])

    // ═══ ГЕНЕРАЦИЯ БЛОК-ЗА-БЛОКОМ ═══
    const handleGenerateDemo = useCallback(async () => {
      setGenerating(true)
      setGenProgress(null)
      setAiDialogOpen(false)
      try {
        // Шаг 1: получить метаданные шаблона (список блоков)
        const metaRes = await fetch("/api/modules/hr/demo/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            vacancyId,
            template: selectedTemplate,
            tone: selectedTone,
            mode: "all",
          }),
        })
        if (!metaRes.ok) {
          const err = await metaRes.json().catch(() => ({ error: "Ошибка" }))
          throw new Error(err.error || "Не удалось получить шаблон")
        }
        const metaJson = await metaRes.json()
        const meta = (metaJson?.data ?? metaJson) as {
          total: number
          template: string
          blocks: Array<{ index: number; id: string; title: string; type: string; description: string; source: string }>
        }

        const total = meta.total
        setGenProgress({ current: 0, total })

        // Шаг 2: генерируем блоки по одному
        const generatedBlocks: Array<{ type: string; title: string; content: string; questionType?: string }> = []

        for (let i = 0; i < total; i++) {
          setGenProgress({ current: i + 1, total })

          const blockRes = await fetch("/api/modules/hr/demo/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              vacancyId,
              template: selectedTemplate,
              tone: selectedTone,
              mode: "single",
              blockIndex: i,
            }),
          })

          if (!blockRes.ok) {
            const errMsg = await blockRes.text().catch(() => "")
            console.error(`[gen] Block ${i} failed:`, errMsg.slice(0, 200))
            generatedBlocks.push({
              type: "text",
              title: meta.blocks[i]?.title || `Блок ${i + 1}`,
              content: `<p style="color:#999"><i>Не удалось сгенерировать. Попробуйте перегенерировать вручную.</i></p>`,
            })
            continue
          }

          const blockJson = await blockRes.json()
          const result = (blockJson?.data ?? blockJson) as {
            block: { type: string; title: string; content: string; questionType?: string }
          }
          generatedBlocks.push(result.block)
        }

        // Шаг 3: собираем уроки
        const lessons: Lesson[] = generatedBlocks.map((b, i) => {
          const block = createBlock(b.type === "question" ? "task" : "text")
          block.content = b.content
          if (b.type === "question") {
            block.taskTitle = b.title
            block.taskDescription = b.content
            if (block.questions.length > 0) {
              block.questions[0].text = b.content
              block.questions[0].answerType = b.questionType === "short" ? "short" : "long"
            }
          }
          return {
            id: `lesson-ai-${Date.now()}-${i}`,
            emoji: b.type === "question" ? "✅" : "📄",
            title: b.title,
            blocks: [block],
          }
        })

        if (demo) {
          updateDemo({ ...demo, title: vacancyTitle || demo.title, lessons })
          toast.success(`Демонстрация заполнена — ${lessons.length} блоков`)
        } else {
          const created = await createDemo(vacancyTitle || "Демонстрация должности", lessons)
          if (created) toast.success(`Демонстрация создана — ${lessons.length} блоков`)
          else throw new Error("Не удалось сохранить")
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Не удалось сгенерировать демонстрацию")
      } finally {
        setGenerating(false)
        setGenProgress(null)
      }
    }, [vacancyId, selectedTemplate, selectedTone, vacancyTitle, createDemo, updateDemo, demo])

    const fileInputRef = useRef<HTMLInputElement>(null)
    const [fileBusy, setFileBusy] = useState(false)

    const handleFileUpload = useCallback(async (file: File) => {
      const name = file.name.toLowerCase()
      if (!name.endsWith(".txt") && !name.endsWith(".pdf") && !name.endsWith(".docx") && !name.endsWith(".doc")) {
        toast.error("Поддерживаются DOCX, PDF, TXT")
        return
      }
      if (file.size > 50 * 1024 * 1024) {
        toast.error("Файл слишком большой (макс. 50 МБ)")
        return
      }
      setFileBusy(true)
      try {
        const fd = new FormData()
        fd.append("file", file)
        const res = await fetch("/api/modules/hr/vacancies/parse-file", { method: "POST", body: fd })
        const data = await res.json() as { text?: string; error?: string }
        if (!res.ok || !data.text) throw new Error(data.error || "Не удалось извлечь текст")

        const lessons = splitTextIntoLessons(data.text, file.name)
        if (demo) {
          updateDemo({ ...demo, lessons: [...lessons, ...demo.lessons] })
          toast.success(lessons.length > 1
            ? `Файл добавлен — ${lessons.length} уроков`
            : "Файл добавлен в демонстрацию")
        } else {
          const created = await createDemo(vacancyTitle || "Демонстрация должности", lessons)
          if (created) toast.success(lessons.length > 1
            ? `Демонстрация создана — ${lessons.length} уроков`
            : "Демонстрация создана из файла")
          else throw new Error("Не удалось сохранить")
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Ошибка обработки файла")
      } finally {
        setFileBusy(false)
      }
    }, [demo, updateDemo, createDemo, vacancyTitle])

    useImperativeHandle(tabRef, () => ({
      openAiGenerate: () => setAiDialogOpen(true),
      openFileUpload: () => fileInputRef.current?.click(),
    }), [])

    // Loading state
    if (loading || (!demo && !error)) {
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

    // ═══ ПОЛНОЭКРАННЫЙ ЛОАДЕР ПРИ ГЕНЕРАЦИИ ═══
    if (generating) {
      const pct = genProgress ? Math.round((genProgress.current / genProgress.total) * 100) : 0
      return (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="relative w-16 h-16">
            <Loader2 className="w-16 h-16 animate-spin text-primary" />
            <Sparkles className="w-6 h-6 absolute inset-0 m-auto text-primary" />
          </div>
          <div className="text-center">
            <p className="text-lg font-semibold text-foreground">AI создаёт демонстрацию</p>
            {genProgress ? (
              <>
                <p className="text-sm text-muted-foreground mt-1">
                  Блок {genProgress.current} из {genProgress.total}
                </p>
                <div className="w-64 h-2 bg-muted rounded-full mt-3 overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-2">{pct}%</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground mt-1">Готовим шаблон...</p>
            )}
          </div>
          <p className="text-xs text-muted-foreground max-w-sm text-center">
            Это может занять 1-2 минуты. AI подбирает готовые блоки компании из библиотеки и генерирует персонализированный контент для вакансии.
          </p>
        </div>
      )
    }

    return (
      <>
        <input
          ref={fileInputRef}
          type="file"
          accept=".docx,.doc,.pdf,.txt"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); e.target.value = "" }}
        />
        {/* Save status indicator */}
        <div className="flex justify-end px-1 pb-1 gap-2">
          {fileBusy && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin" />
              Загружаю файл...
            </span>
          )}
          {saveStatus === "saving" && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin" />
              Сохранение...
            </span>
          )}
          {saveStatus === "saved" && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Check className="w-3 h-3" />
              Сохранено
            </span>
          )}
          {saveStatus === "error" && (
            <span className="flex items-center gap-1 text-xs text-destructive">
              <AlertCircle className="w-3 h-3" />
              Ошибка сохранения
            </span>
          )}
        </div>
        <NotionEditor
          ref={editorRef}
          demo={demo!}
          onBack={() => {/* single demo — no list */}}
          onUpdate={handleUpdateDemo}
          onSaveStatusChange={onSaveStatusChange}
          hideToolbar
          vacancyId={vacancyId}
        />

        {/* AI generate dialog */}
        <Dialog open={aiDialogOpen} onOpenChange={(o) => { if (!generating) setAiDialogOpen(o) }}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Сгенерировать демонстрацию с AI</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">Выберите длительность — AI заполнит контент из анкеты вакансии и готовых блоков компании. Существующая демонстрация будет перезаписана.</p>
              <div className="space-y-2">
                {DEMO_TEMPLATES.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    className={cn(
                      "w-full text-left rounded-xl border p-3 transition-all",
                      selectedTemplate === t.id
                        ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                        : "border-border hover:border-primary/30"
                    )}
                    onClick={() => setSelectedTemplate(t.id)}
                  >
                    <div className="flex items-start gap-3">
                      <div className={cn(
                        "w-4 h-4 rounded-full border-2 mt-0.5 shrink-0 flex items-center justify-center",
                        selectedTemplate === t.id ? "border-primary" : "border-muted-foreground/40"
                      )}>
                        {selectedTemplate === t.id && <div className="w-2 h-2 rounded-full bg-primary" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium">{t.label}</p>
                          <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                            <Clock className="w-3 h-3 mr-0.5" />{t.time}
                          </Badge>
                          <Badge variant="outline" className="text-[10px] h-4 px-1.5">{t.blocks.length} блоков</Badge>
                          {t.id === "medium" && <Badge className="text-[10px] h-4 px-1.5 bg-primary">Рекомендуем</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
              <div className="pt-1">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1.5">Тон</p>
                <div className="flex flex-wrap gap-1.5">
                  {([
                    { id: "energetic", emoji: "🔥", label: "Энергичный" },
                    { id: "friendly",  emoji: "🤝", label: "Дружелюбный" },
                    { id: "business",  emoji: "🏢", label: "Деловой" },
                    { id: "direct",    emoji: "🎯", label: "Прямой" },
                  ] as const).map(t => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setSelectedTone(t.id)}
                      className={cn(
                        "h-8 px-3 rounded-md text-xs font-medium border transition-colors",
                        selectedTone === t.id
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border bg-background hover:border-primary/40 text-muted-foreground",
                      )}
                    >
                      {t.emoji} {t.label}
                    </button>
                  ))}
                </div>
              </div>
              <Button className="w-full h-10 gap-1.5" onClick={handleGenerateDemo} disabled={generating}>
                {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {generating ? "AI генерирует..." : "Сгенерировать"}
              </Button>
              <p className="text-[11px] text-muted-foreground text-center">Занимает 1-2 минуты, генерация идёт по блокам</p>
            </div>
          </DialogContent>
        </Dialog>
      </>
    )
  }
)
