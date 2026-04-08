"use client"

import { useState, useRef, useCallback, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { Save, Eye, BookOpen, ChevronLeft } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { NotionEditor, type NotionEditorHandle } from "@/components/vacancies/notion-editor"
import { DEFAULT_LESSONS, createDemo as createDemoObject } from "@/lib/course-types"
import type { Demo } from "@/lib/course-types"
import Link from "next/link"

const LENGTH_LABELS: Record<string, string> = { short: "Короткая", standard: "Стандартная", full: "Полная" }

const NICHE_LABELS: Record<string, string> = {
  sales_b2b: "Продажи B2B", callcenter: "Колл-центр", client_service: "Клиент.сервис",
  it: "IT", construction: "Строительство", logistics: "Логистика",
  labor: "Рабочие", universal: "Универсальный",
  "Продажи": "Продажи", "Маркетинг": "Маркетинг", "IT / разработка": "IT", "Логистика": "Логистика",
  "Производство": "Производство", "Клиентский сервис": "Клиент.сервис", "HR": "HR",
  "Финансы": "Финансы", "Рабочие специальности": "Рабочие", "Другое": "Другое",
}

export default function EditorPage() {
  return <Suspense fallback={<div className="p-12 text-center text-muted-foreground">Загрузка...</div>}><EditorContent /></Suspense>
}

function EditorContent() {
  const searchParams = useSearchParams()
  const length = searchParams.get("length") ?? "standard"
  const department = searchParams.get("department") ?? ""
  const initialName = searchParams.get("name") ?? ""
  const position = searchParams.get("position") ?? ""

  const [demo, setDemo] = useState<Demo>(() =>
    createDemoObject(initialName || `Демонстрация: ${position}`, DEFAULT_LESSONS),
  )
  const [demoName, setDemoName] = useState(initialName || `Демонстрация: ${position}`)

  const editorRef = useRef<NotionEditorHandle>(null)

  const handleUpdate = useCallback((updated: Demo) => {
    setDemo(updated)
  }, [])

  const filledLessons = demo.lessons.filter(l => l.blocks.some(b => b.content.trim())).length
  const totalLessons = demo.lessons.length
  const progressPct = totalLessons > 0 ? Math.round((filledLessons / totalLessons) * 100) : 0

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <div className="flex-1 overflow-auto bg-background min-w-0">
          <div className="py-4" style={{ paddingLeft: 56, paddingRight: 56 }}>

            {/* Top bar */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3 min-w-0">
                <Link href="/hr/library/create">
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                </Link>
                <Input
                  value={demoName}
                  onChange={(e) => { setDemoName(e.target.value); setDemo(prev => ({ ...prev, title: e.target.value })) }}
                  className="text-lg font-semibold border-none shadow-none px-0 h-auto bg-transparent focus-visible:ring-0"
                  placeholder="Название демонстрации"
                />
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant="secondary" className="text-xs">{LENGTH_LABELS[length] ?? length}</Badge>
                {department && <Badge variant="outline" className="text-xs">{NICHE_LABELS[department] ?? department}</Badge>}
                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => editorRef.current?.openPreview()}>
                  <Eye className="w-3.5 h-3.5" />Предпросмотр
                </Button>
                <Button size="sm" className="h-8 gap-1.5 text-xs" onClick={() => { editorRef.current?.save(); toast.success("Сохранено") }}>
                  <Save className="w-3.5 h-3.5" />Сохранить
                </Button>
                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => toast.success("Шаблон сохранён в библиотеку")}>
                  <BookOpen className="w-3.5 h-3.5" />Как шаблон
                </Button>
              </div>
            </div>

            {/* Progress */}
            <div className="flex items-center gap-3 mb-3">
              <Progress value={progressPct} className="flex-1 h-2" />
              <span className="text-xs text-muted-foreground whitespace-nowrap">Заполнено на {progressPct}% ({filledLessons}/{totalLessons})</span>
            </div>

            {/* Notion Editor — same as vacancy demo tab */}
            <NotionEditor
              ref={editorRef}
              demo={demo}
              onBack={() => {}}
              onUpdate={handleUpdate}
              hideToolbar
              onOpenLibrary={() => editorRef.current?.openLibrary()}
            />

          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
