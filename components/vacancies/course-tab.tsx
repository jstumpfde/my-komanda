"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { Plus, GraduationCap, Clock, ChevronRight } from "lucide-react"
import { toast } from "sonner"
import { type Demo, createDemo } from "@/lib/course-types"
import { DemoCard } from "./demo-card"

const STORAGE_KEY = "hireflow-demos"

function loadDemos(): Demo[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    // Revive Date objects
    return parsed.map((d: Demo) => ({
      ...d,
      createdAt: new Date(d.createdAt),
      updatedAt: new Date(d.updatedAt),
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

  // Load from localStorage on mount, clean stale keys
  useEffect(() => {
    // Remove old demo_* keys from previous versions
    try {
      const keys = Object.keys(localStorage)
      keys.forEach((k) => { if (k.startsWith("demo_")) localStorage.removeItem(k) })
    } catch {}
    setDemos(loadDemos())
    setHydrated(true)
  }, [])

  // Persist to localStorage whenever demos change (after hydration)
  useEffect(() => {
    if (hydrated) saveDemos(demos)
  }, [demos, hydrated])

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

  if (selectedDemo) {
    return (
      <DemoCard
        demo={selectedDemo}
        onBack={() => setSelectedDemoId(null)}
        onUpdate={handleUpdateDemo}
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-foreground">Демонстрация должности</h3>
        {demos.length > 0 && (
          <Button size="sm" className="gap-1.5" onClick={() => setCreateDialogOpen(true)}>
            <Plus className="w-3.5 h-3.5" />
            Создать демонстрацию
          </Button>
        )}
      </div>

      {demos.length > 0 && (
        <div className="space-y-1">
          {demos.map((demo) => {
            const lessonsCount = demo.lessons.length
            const tasksCount = demo.lessons.reduce((a, l) => a + l.blocks.filter((b) => b.type === "task").length, 0)
            return (
              <div
                key={demo.id}
                onClick={() => setSelectedDemoId(demo.id)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-border hover:border-primary/30 hover:shadow-sm cursor-pointer group transition-all"
              >
                <div
                  className="w-[60px] h-[60px] rounded-lg flex-shrink-0 flex items-center justify-center"
                  style={{ background: `linear-gradient(135deg, ${demo.coverGradientFrom}, ${demo.coverGradientTo})` }}
                >
                  <span className="text-white text-lg font-bold">{demo.companyName.charAt(0)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-semibold text-foreground truncate">{demo.title}</h4>
                    <Badge variant="outline" className={cn("text-[10px] flex-shrink-0", demo.status === "published" ? "bg-emerald-500/10 text-emerald-700 border-emerald-200" : "bg-amber-500/10 text-amber-700 border-amber-200")}>
                      {demo.status === "published" ? "Опубликована" : "Черновик"}
                    </Badge>
                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground flex-shrink-0">
                      <Clock className="w-3 h-3" />{demo.updatedAt.toLocaleDateString("ru-RU")}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">уроков: {lessonsCount} · заданий: {tasksCount}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-muted-foreground flex-shrink-0 transition-colors" />
              </div>
            )
          })}
        </div>
      )}

      {demos.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <GraduationCap className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" />
            <h4 className="text-base font-semibold text-foreground mb-1">Нет демонстраций</h4>
            <Button size="sm" className="gap-1.5 mt-3" onClick={() => setCreateDialogOpen(true)}>
              <Plus className="w-3.5 h-3.5" />Создать первую демонстрацию
            </Button>
          </CardContent>
        </Card>
      )}

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
