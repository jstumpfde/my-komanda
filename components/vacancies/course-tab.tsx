"use client"

import { useState, useEffect, useCallback } from "react"
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
import { NotionEditor } from "./notion-editor"

const STORAGE_KEY = "hireflow-demos"

/** Проверяет, является ли строка валидным URL или data-URI */
function isValidUrl(s: string): boolean {
  if (!s) return true // пустая строка — ок, не мусор
  if (s.startsWith("data:")) return true
  if (s.startsWith("blob:")) return true
  try {
    const url = new URL(s)
    return url.protocol === "http:" || url.protocol === "https:"
  } catch {
    return false
  }
}

/** Проверяет что строка — осмысленный текст, а не мусор из localStorage.
 *  Мусор: очень длинная строка без пробелов (слитные символы). */
function isCleanText(s: string): boolean {
  if (!s) return true
  if (s.length > 200) return false
  // Строка длиннее 30 символов без единого пробела — мусор
  if (s.length > 30 && !s.includes(" ")) return false
  return true
}

/** Санирует блок: сбрасывает мусорные значения URL-полей и строковых полей */
function sanitizeBlock(block: Block): Block {
  // У медиа-блоков с layout "full" поле content не используется — сбрасываем
  const isMediaFull = ["image", "video", "audio", "file"].includes(block.type) &&
    (block.imageLayout === "full" || block.videoLayout === "full" ||
     block.audioLayout === "full" || block.fileLayout === "full")

  return {
    ...block,
    content: isMediaFull ? "" : (typeof block.content === "string" && isCleanText(block.content) ? block.content : ""),
    imageUrl: isValidUrl(block.imageUrl ?? "") ? (block.imageUrl ?? "") : "",
    imageCaption: typeof block.imageCaption === "string" && isCleanText(block.imageCaption) ? block.imageCaption : "",
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
    const json = JSON.stringify(demos)
    localStorage.setItem(STORAGE_KEY, json)
    console.log("[CourseTab] saved to localStorage:", STORAGE_KEY, "size:", json.length, "demos:", demos.length)
  } catch (e) { console.error("[CourseTab] save error:", e) }
}

export function CourseTab() {
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
        demo={selectedDemo}
        onBack={() => {
          // If single demo, stay in editor (no list to go back to)
          if (demos.length <= 1) return
          setSelectedDemoId(null)
        }}
        onUpdate={handleUpdateDemo}
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
}
