"use client"

import React, { useCallback, forwardRef } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Plus, GraduationCap, Loader2, Check, AlertCircle } from "lucide-react"
import { type Demo } from "@/lib/course-types"
import { NotionEditor, type NotionEditorHandle } from "./notion-editor"
import { useDemo } from "@/hooks/use-demo"

interface CourseTabProps {
  vacancyId: string
  vacancyTitle?: string
  editorRef?: React.Ref<NotionEditorHandle>
  onSaveStatusChange?: (status: "saved" | "saving") => void
}

export const CourseTab = forwardRef<NotionEditorHandle, CourseTabProps>(
  function CourseTab({ vacancyId, editorRef, onSaveStatusChange }, _ref) {
    const { demo, loading, error, saveStatus, updateDemo } = useDemo(vacancyId)
    const router = useRouter()

    // Sync save status to parent
    React.useEffect(() => {
      if (!onSaveStatusChange) return
      if (saveStatus === "saving") onSaveStatusChange("saving")
      else if (saveStatus === "saved") onSaveStatusChange("saved")
    }, [saveStatus, onSaveStatusChange])

    const handleCreateDemo = () => {
      router.push("/knowledge-v2/create/demo")
    }

    const handleUpdateDemo = useCallback((updated: Demo) => {
      updateDemo(updated)
    }, [updateDemo])

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

    // No demo — show create screen
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="py-12 text-center">
            <GraduationCap className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" />
            <h4 className="text-base font-semibold text-foreground mb-1">Создайте демонстрацию должности</h4>
            <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
              Кандидаты пройдут интерактивный обзор компании, роли и дохода перед интервью
            </p>
            <Button size="sm" className="gap-1.5" onClick={handleCreateDemo}>
              <Plus className="w-3.5 h-3.5" />
              Создать демонстрацию
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }
)
