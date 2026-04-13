"use client"

import React, { useState, useCallback, forwardRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Plus, GraduationCap, Loader2, Check, AlertCircle, Sparkles, Clock, ChevronRight } from "lucide-react"
import { type Demo, type Lesson, createBlock } from "@/lib/course-types"
import { DEMO_TEMPLATES, type DemoTemplateId } from "@/lib/hr/demo-templates"
import { NotionEditor, type NotionEditorHandle } from "./notion-editor"
import { useDemo } from "@/hooks/use-demo"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

interface CourseTabProps {
  vacancyId: string
  vacancyTitle?: string
  editorRef?: React.Ref<NotionEditorHandle>
  onSaveStatusChange?: (status: "saved" | "saving") => void
}

export const CourseTab = forwardRef<NotionEditorHandle, CourseTabProps>(
  function CourseTab({ vacancyId, vacancyTitle, editorRef, onSaveStatusChange }, _ref) {
    const { demo, loading, error, saveStatus, createDemo, updateDemo } = useDemo(vacancyId)
    const [generating, setGenerating] = useState(false)
    const [selectedTemplate, setSelectedTemplate] = useState<DemoTemplateId>("medium")

    // Sync save status to parent
    React.useEffect(() => {
      if (!onSaveStatusChange) return
      if (saveStatus === "saving") onSaveStatusChange("saving")
      else if (saveStatus === "saved") onSaveStatusChange("saved")
    }, [saveStatus, onSaveStatusChange])

    const handleUpdateDemo = useCallback((updated: Demo) => {
      updateDemo(updated)
    }, [updateDemo])

    const handleGenerateDemo = useCallback(async () => {
      setGenerating(true)
      try {
        // Step 1: Call AI generate with template
        const res = await fetch("/api/modules/hr/demo/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ vacancyId, template: selectedTemplate }),
        })
        if (!res.ok) throw new Error("Ошибка генерации")
        const blocks = await res.json() as Array<{ type: string; title: string; content: string; questionType?: string }>

        // Step 2: Convert to lessons
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

        // Step 3: Create demo in DB
        const created = await createDemo(vacancyTitle || "Демонстрация должности", lessons)
        if (created) {
          toast.success(`Демонстрация создана — ${lessons.length} блоков`)
        } else {
          throw new Error("Не удалось сохранить")
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Не удалось сгенерировать демонстрацию")
      } finally {
        setGenerating(false)
      }
    }, [vacancyId, selectedTemplate, vacancyTitle, createDemo])

    const handleCreateEmpty = useCallback(async () => {
      const lesson: Lesson = {
        id: `les-${Date.now()}`,
        emoji: "📄",
        title: "Новый урок",
        blocks: [createBlock("text")],
      }
      const created = await createDemo(vacancyTitle || "Демонстрация должности", [lesson])
      if (created) toast.success("Демонстрация создана")
      else toast.error("Не удалось создать демонстрацию")
    }, [vacancyTitle, createDemo])

    // Loading state
    if (loading) {
      return (
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Загрузка...
        </div>
      )
    }

    // Error state
    if (error) {
      return (
        <div className="flex items-center justify-center py-20 text-destructive gap-2">
          <AlertCircle className="w-5 h-5" />
          {error}
        </div>
      )
    }

    // Demo exists — show Notion editor
    if (demo) {
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
            demo={demo}
            onBack={() => {/* single demo — no list */}}
            onUpdate={handleUpdateDemo}
            onSaveStatusChange={onSaveStatusChange}
            hideToolbar
            vacancyId={vacancyId}
          />
        </>
      )
    }

    // AI progress overlay
    if (generating) {
      return (
        <Card>
          <CardContent className="py-16 text-center">
            <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto mb-3" />
            <p className="text-sm font-medium">AI генерирует демонстрацию...</p>
            <p className="text-xs text-muted-foreground mt-1">Это займёт 10-20 секунд</p>
          </CardContent>
        </Card>
      )
    }

    // No demo — show template selection
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="py-8">
            <div className="text-center mb-6">
              <GraduationCap className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" />
              <h4 className="text-base font-semibold text-foreground mb-1">Создайте демонстрацию должности</h4>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Выберите шаблон — AI заполнит контент из анкеты вакансии
              </p>
            </div>

            {/* Template selection */}
            <div className="space-y-2 max-w-lg mx-auto mb-6">
              {DEMO_TEMPLATES.map(t => (
                <button
                  key={t.id}
                  type="button"
                  className={cn(
                    "w-full text-left rounded-xl border p-4 transition-all",
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
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{t.label}</p>
                        <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                          <Clock className="w-3 h-3 mr-0.5" />{t.time}
                        </Badge>
                        <Badge variant="outline" className="text-[10px] h-4 px-1.5">{t.blocks.length} блоков</Badge>
                        {t.id === "medium" && <Badge className="text-[10px] h-4 px-1.5 bg-primary">Рекомендуем</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>
                      {/* Block preview */}
                      <div className="flex flex-wrap gap-1 mt-2">
                        {t.blocks.slice(0, 6).map(b => (
                          <span key={b.id} className="inline-flex items-center text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                            {b.title}
                          </span>
                        ))}
                        {t.blocks.length > 6 && (
                          <span className="text-[10px] text-muted-foreground px-1 py-0.5">
                            +{t.blocks.length - 6}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-center gap-3">
              <Button className="gap-1.5" onClick={handleGenerateDemo} disabled={generating}>
                <Sparkles className="w-4 h-4" />
                Сгенерировать с AI
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={handleCreateEmpty}>
                <Plus className="w-3.5 h-3.5" />
                Пустая демонстрация
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }
)
