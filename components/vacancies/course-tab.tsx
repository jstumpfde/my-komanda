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

export interface CourseTabHandle {
  openAiGenerate: () => void
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
    const [aiDialogOpen, setAiDialogOpen] = useState(false)
    const [selectedTemplate, setSelectedTemplate] = useState<DemoTemplateId>("medium")
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

    const handleGenerateDemo = useCallback(async () => {
      setGenerating(true)
      setAiDialogOpen(false)
      try {
        const res = await fetch("/api/modules/hr/demo/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ vacancyId, template: selectedTemplate }),
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Ошибка генерации" }))
          throw new Error(err.error || "Ошибка генерации")
        }
        const blocks = await res.json() as Array<{ type: string; title: string; content: string; questionType?: string }>

        const lessons: Lesson[] = blocks.map((b, i) => {
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

        // Если демо уже существует (пустая заглушка) — перезаписываем через updateDemo,
        // иначе создаём новое.
        if (demo) {
          updateDemo({ ...demo, title: vacancyTitle || demo.title, lessons })
          toast.success(`Демонстрация заполнена AI — ${lessons.length} блоков`)
        } else {
          const created = await createDemo(vacancyTitle || "Демонстрация должности", lessons)
          if (created) toast.success(`Демонстрация создана — ${lessons.length} блоков`)
          else throw new Error("Не удалось сохранить")
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Не удалось сгенерировать демонстрацию")
      } finally {
        setGenerating(false)
      }
    }, [vacancyId, selectedTemplate, vacancyTitle, createDemo, updateDemo, demo])

    useImperativeHandle(tabRef, () => ({
      openAiGenerate: () => setAiDialogOpen(true),
    }), [])

    // Loading state (пока создаём пустую демо или грузим существующую)
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

    return (
      <>
        {/* Save status indicator */}
        <div className="flex justify-end px-1 pb-1">
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
              <p className="text-xs text-muted-foreground">Выберите длительность — AI заполнит контент из анкеты вакансии. Существующая демонстрация будет перезаписана.</p>
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
              <Button className="w-full h-10 gap-1.5" onClick={handleGenerateDemo} disabled={generating}>
                {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {generating ? "AI генерирует..." : "Сгенерировать"}
              </Button>
              {generating && (
                <p className="text-[11px] text-muted-foreground text-center">Это займёт 10-20 секунд</p>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </>
    )
  }
)
