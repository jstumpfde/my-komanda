"use client"

import React, { useState, useEffect, useCallback, forwardRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Plus, GraduationCap } from "lucide-react"
import { toast } from "sonner"
import { type Demo, type Block, createDemo } from "@/lib/course-types"
import { NotionEditor, type NotionEditorHandle } from "./notion-editor"

const STORAGE_KEY = "hireflow-demos"

/** Проверяет, является ли строка постоянным URL (http/https).
 *  data: и blob: НЕ считаются валидными — они не переживают перезагрузку
 *  и занимают мегабайты в localStorage. */
function isValidUrl(s: string): boolean {
  if (!s) return true // пустая строка — ок
  if (s.startsWith("data:") || s.startsWith("blob:")) return false
  try {
    const url = new URL(s)
    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return false
  }
}


/** Удаляет data:/blob: src из HTML-контента (встроенные картинки через paste) */
function stripBlobsFromHtml(html: string): string {
  if (!html) return html
  return html.replace(/src="(data|blob):[^"]*"/g, 'src=""')
}

/** Санирует блок: сбрасывает base64/blob URL-поля и inline-src в контенте */
function sanitizeBlock(block: Block): Block {
  const content = typeof block.content === "string"
    ? stripBlobsFromHtml(block.content)
    : ""

  return {
    ...block,
    content,
    imageUrl: isValidUrl(block.imageUrl ?? "") ? (block.imageUrl ?? "") : "",
    imageCaption: typeof block.imageCaption === "string" ? block.imageCaption : "",
    videoUrl: isValidUrl(block.videoUrl ?? "") ? (block.videoUrl ?? "") : "",
    audioUrl: isValidUrl(block.audioUrl ?? "") ? (block.audioUrl ?? "") : "",
    fileUrl: isValidUrl(block.fileUrl ?? "") ? (block.fileUrl ?? "") : "",
  }
}

function loadDemos(): Demo[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    // Revive Date objects + санировать блоки
    return parsed.map((d: Demo) => ({
      ...d,
      createdAt: new Date(d.createdAt),
      updatedAt: new Date(d.updatedAt),
      lessons: (d.lessons ?? []).map((l) => ({
        ...l,
        blocks: (l.blocks ?? []).map(sanitizeBlock),
      })),
    }))
  } catch { return [] }
}

function saveDemos(demos: Demo[]) {
  try {
    // Sanitize before saving — strips base64/blob URLs that bloat storage
    const sanitized = demos.map(d => ({
      ...d,
      lessons: (d.lessons ?? []).map(l => ({
        ...l,
        blocks: (l.blocks ?? []).map(sanitizeBlock),
      })),
    }))
    const json = JSON.stringify(sanitized)
    localStorage.setItem(STORAGE_KEY, json)
    console.log("[CourseTab] saved to localStorage:", STORAGE_KEY, "size:", json.length, "demos:", demos.length)
  } catch (e) {
    console.error("[CourseTab] save error:", e)
    if (e instanceof DOMException && e.name === "QuotaExceededError") {
      toast.error("Хранилище переполнено. Удалите неиспользуемые медиафайлы из блоков.")
    }
  }
}

interface CourseTabProps {
  editorRef?: React.Ref<NotionEditorHandle>
  onSaveStatusChange?: (status: "saved" | "saving") => void
}

export const CourseTab = forwardRef<NotionEditorHandle, CourseTabProps>(function CourseTab({ editorRef, onSaveStatusChange }, _ref) {
  const [demos, setDemos] = useState<Demo[]>([])
  const [hydrated, setHydrated] = useState(false)
  const [selectedDemoId, setSelectedDemoId] = useState<string | null>(null)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [newTitle, setNewTitle] = useState("")

  // Load from localStorage on mount, auto-select if single demo
  useEffect(() => {
    try {
      const keys = Object.keys(localStorage)
      keys.forEach((k) => { if (k.startsWith("demo_")) localStorage.removeItem(k) })
    } catch {}
    const loaded = loadDemos()
    // Сразу пересохраняем — чтобы вымыть мусор из localStorage
    if (loaded.length > 0) saveDemos(loaded)
    setDemos(loaded)
    setHydrated(true)
    // Auto-open editor if exactly one demo exists
    if (loaded.length === 1) setSelectedDemoId(loaded[0].id)
  }, [])

  // Persist to localStorage whenever demos change (after hydration)
  useEffect(() => {
    if (hydrated) saveDemos(demos)
    // Auto-open if single demo and none selected
    if (hydrated && demos.length === 1 && !selectedDemoId) {
      setSelectedDemoId(demos[0].id)
    }
  }, [demos, hydrated, selectedDemoId])

  const handleCreateDemo = () => {
    if (!newTitle.trim()) return
    const demo = createDemo(newTitle.trim())
    setDemos((prev) => [...prev, demo])
    setNewTitle("")
    setCreateDialogOpen(false)
    setSelectedDemoId(demo.id)
    toast.success(`Демонстрация «${demo.title}» создана`)
  }

  const handleUpdateDemo = useCallback((updated: Demo) => {
    setDemos((prev) => prev.map((d) => d.id === updated.id ? updated : d))
  }, [])

  const selectedDemo = demos.find((d) => d.id === selectedDemoId)

  // If a demo is selected — show Notion editor
  if (selectedDemo) {
    return (
      <NotionEditor
        ref={editorRef}
        demo={selectedDemo}
        onBack={() => {
          // If single demo, stay in editor (no list to go back to)
          if (demos.length <= 1) return
          setSelectedDemoId(null)
        }}
        onUpdate={handleUpdateDemo}
        onSaveStatusChange={onSaveStatusChange}
        hideToolbar
      />
    )
  }

  // No demos — show create screen
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="py-12 text-center">
          <GraduationCap className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" />
          <h4 className="text-base font-semibold text-foreground mb-1">Создайте демонстрацию должности</h4>
          <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">Кандидаты пройдут интерактивный обзор компании, роли и дохода перед интервью</p>
          <Button size="sm" className="gap-1.5" onClick={() => setCreateDialogOpen(true)}>
            <Plus className="w-3.5 h-3.5" />Создать демонстрацию
          </Button>
        </CardContent>
      </Card>

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Новая демонстрация</DialogTitle></DialogHeader>
          <div className="grid gap-3 py-2">
            <Input placeholder="Название демонстрации" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") handleCreateDemo() }} autoFocus />
            <Button onClick={handleCreateDemo} disabled={!newTitle.trim()}>Создать</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
})
