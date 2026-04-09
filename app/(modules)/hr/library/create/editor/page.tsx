"use client"

import { useState, useRef, useCallback, useEffect, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { toast } from "sonner"
import { Save, Eye, ChevronLeft, Loader2, FileUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { NotionEditor, type NotionEditorHandle } from "@/components/vacancies/notion-editor"
import { DEFAULT_LESSONS, createDemo as createDemoObject, createBlock } from "@/lib/course-types"
import type { Demo } from "@/lib/course-types"
import Link from "next/link"

export default function EditorPage() {
  return <Suspense fallback={<div className="p-12 text-center text-muted-foreground">Загрузка...</div>}><EditorContent /></Suspense>
}

function EditorContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const length = searchParams.get("length") ?? "standard"
  const department = searchParams.get("department") ?? ""
  const initialName = searchParams.get("name") ?? ""
  const position = searchParams.get("position") ?? ""
  const templateId = searchParams.get("id")

  const [demo, setDemo] = useState<Demo>(() =>
    createDemoObject(initialName || `Демонстрация: ${position}`, DEFAULT_LESSONS),
  )
  const [demoName, setDemoName] = useState(initialName || `Демонстрация: ${position}`)
  const [savedId, setSavedId] = useState<string | null>(templateId)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(!!templateId)
  const [showImport, setShowImport] = useState(false)
  const [importing, setImporting] = useState(false)
  const importFileRef = useRef<HTMLInputElement>(null)

  const editorRef = useRef<NotionEditorHandle>(null)

  // Load existing template
  useEffect(() => {
    if (!templateId) return
    fetch(`/api/demo-templates/${templateId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          toast.error(data.error)
          setLoading(false)
          return
        }
        const tmpl = data.data ?? data
        setDemoName((tmpl.name || "").slice(0, 76))
        const lessons = Array.isArray(tmpl.sections) && tmpl.sections.length > 0
          ? tmpl.sections
          : DEFAULT_LESSONS
        setDemo(createDemoObject(tmpl.name || "", lessons))
        setLoading(false)
      })
      .catch(() => {
        toast.error("Ошибка загрузки шаблона")
        setLoading(false)
      })
  }, [templateId])

  const handleUpdate = useCallback((updated: Demo) => {
    setDemo(updated)
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      if (savedId) {
        // PATCH existing
        const res = await fetch(`/api/demo-templates/${savedId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: demoName,
            sections: demo.lessons,
          }),
        })
        const data = await res.json()
        if (!res.ok) { toast.error(data.error || "Ошибка сохранения"); setSaving(false); return }
        toast.success("Сохранено")
      } else {
        // POST new
        const res = await fetch("/api/demo-templates", {
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
        if (!res.ok) { toast.error(data.error || "Ошибка сохранения"); setSaving(false); return }
        const newId = (data.data ?? data).id
        setSavedId(newId)
        // Update URL without reload
        const url = new URL(window.location.href)
        url.searchParams.set("id", newId)
        window.history.replaceState({}, "", url.toString())
        toast.success("Сохранено")
      }
    } catch {
      toast.error("Ошибка сети")
    }
    setSaving(false)
  }

  const handlePreview = async () => {
    let id = savedId
    if (!id) {
      // Auto-save first
      setSaving(true)
      try {
        const res = await fetch("/api/demo-templates", {
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
        if (!res.ok) { toast.error(data.error || "Ошибка сохранения"); setSaving(false); return }
        id = (data.data ?? data).id
        setSavedId(id)
        const url = new URL(window.location.href)
        url.searchParams.set("id", id!)
        window.history.replaceState({}, "", url.toString())
        toast.success("Сохранено")
      } catch {
        toast.error("Ошибка сети")
        setSaving(false)
        return
      }
      setSaving(false)
    } else {
      // Save current state before preview
      await fetch(`/api/demo-templates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: demoName, sections: demo.lessons }),
      })
    }
    window.open(`/hr/library/preview/${id}`, "_blank")
  }

  const handleImportFile = async (file: File, mode: "replace" | "append") => {
    setImporting(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      const res = await fetch("/api/demo-templates/parse-document", { method: "POST", body: formData })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || "Ошибка парсинга"); setImporting(false); return }

      const parsed = (data.lessons as { emoji: string; title: string; blocks: { type: string; content: string }[] }[]).map((l, i) => ({
        id: `lesson-imp-${Date.now()}-${i}`,
        emoji: l.emoji || "📄",
        title: l.title,
        blocks: l.blocks.map((b, j) => ({
          ...createBlock(b.type as import("@/lib/course-types").BlockType),
          id: `blk-imp-${Date.now()}-${i}-${j}`,
          content: b.content,
        })),
      }))

      if (mode === "replace") {
        setDemo(prev => ({ ...prev, lessons: parsed }))
      } else {
        setDemo(prev => ({ ...prev, lessons: [...prev.lessons, ...parsed] }))
      }
      toast.success(`${parsed.length} ${parsed.length === 1 ? "урок импортирован" : "уроков импортировано"}`)
      setShowImport(false)
    } catch {
      toast.error("Ошибка сети")
    }
    setImporting(false)
  }

  const filledLessons = demo.lessons.filter(l => l.blocks.some(b => b.content.trim())).length
  const totalLessons = demo.lessons.length
  const progressPct = totalLessons > 0 ? Math.round((filledLessons / totalLessons) * 100) : 0

  if (loading) {
    return (
      <SidebarProvider defaultOpen={true}>
        <DashboardSidebar />
        <SidebarInset>
          <DashboardHeader />
          <div className="flex items-center justify-center h-64 gap-2 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />Загрузка...
          </div>
        </SidebarInset>
      </SidebarProvider>
    )
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <div className="flex-1 overflow-auto bg-background min-w-0">
          <div className="py-4" style={{ paddingLeft: 56, paddingRight: 56 }}>

            {/* Top bar */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <Link href="/hr/library">
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                </Link>
                <Input
                  value={demoName}
                  onChange={(e) => { setDemoName(e.target.value); setDemo(prev => ({ ...prev, title: e.target.value })) }}
                  maxLength={76}
                  className="text-lg font-semibold border-none shadow-none px-0 h-auto bg-transparent focus-visible:ring-0 flex-1 min-w-0"
                  placeholder="Название демонстрации"
                />
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={handlePreview}>
                  <Eye className="w-3.5 h-3.5" />Предпросмотр
                </Button>
                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setShowImport(true)}>
                  <FileUp className="w-3.5 h-3.5" />Импорт
                </Button>
                <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={handleSave} disabled={saving}>
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  {saving ? "Сохранение..." : "Сохранить"}
                </Button>
              </div>
            </div>

            {/* Progress */}
            <div className="flex items-center gap-3 mb-3">
              <Progress value={progressPct} className="flex-1 h-2" />
              <span className="text-xs text-muted-foreground whitespace-nowrap">Заполнено на {progressPct}% ({filledLessons}/{totalLessons})</span>
            </div>

            {/* Notion Editor */}
            <NotionEditor
              ref={editorRef}
              demo={demo}
              onBack={() => router.push("/hr/library")}
              onUpdate={handleUpdate}
              hideToolbar
              onOpenLibrary={() => editorRef.current?.openLibrary()}
            />

          </div>
        </div>
      </SidebarInset>

      {/* Import dialog */}
      <Dialog open={showImport} onOpenChange={setShowImport}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Импорт документа</DialogTitle></DialogHeader>
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              const file = e.dataTransfer.files?.[0]
              if (file) handleImportFile(file, "append")
            }}
            onClick={() => importFileRef.current?.click()}
            className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
          >
            {importing ? (
              <div className="flex items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin" />Парсинг документа...
              </div>
            ) : (
              <>
                <FileUp className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm font-medium">Перетащите файл или нажмите для выбора</p>
                <p className="text-xs text-muted-foreground mt-1">DOCX, PDF, TXT, MD · Макс 50 МБ</p>
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
                handleImportFile(file, "append")
              }}
            />
          </div>
          <p className="text-xs text-muted-foreground">Уроки из документа будут добавлены к существующим</p>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  )
}
