"use client"

import { useEffect, useState, useCallback } from "react"
import { useSearchParams } from "next/navigation"
import { Suspense } from "react"
import { DashboardSidebarV2 } from "@/components/dashboard/sidebar-v2"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Plus, Save, Trash2, GripVertical, Type, Video, HelpCircle, CheckSquare, Loader2,
} from "lucide-react"
import { cn } from "@/lib/utils"

// ─── Типы блоков ──────────────────────────────────────────────────────────────

type BlockType = "text" | "video" | "question" | "task"

interface Block {
  id: string
  type: BlockType
  content: string
  question?: string
  options?: string[]
}

interface Demo {
  id: string
  title: string
  status: string
  lessonsJson: Block[]
  vacancyId: string
  vacancyTitle?: string
}

interface Vacancy {
  id: string
  title: string
}

const BLOCK_ICONS: Record<BlockType, React.ReactNode> = {
  text:     <Type className="w-4 h-4" />,
  video:    <Video className="w-4 h-4" />,
  question: <HelpCircle className="w-4 h-4" />,
  task:     <CheckSquare className="w-4 h-4" />,
}

const BLOCK_LABELS: Record<BlockType, string> = {
  text: "Текст", video: "Видео", question: "Вопрос", task: "Задание",
}

function DemoEditorContent() {
  const searchParams = useSearchParams()
  const demoId = searchParams.get("demoId")

  const [demo, setDemo] = useState<Demo | null>(null)
  const [vacancies, setVacancies] = useState<Vacancy[]>([])
  const [blocks, setBlocks] = useState<Block[]>([])
  const [title, setTitle] = useState("")
  const [vacancyId, setVacancyId] = useState("")
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  // Загрузка вакансий
  useEffect(() => {
    fetch("/api/modules/hr/vacancies-v2")
      .then((r) => r.json())
      .then((data) => setVacancies(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [])

  // Загрузка демо если есть demoId
  useEffect(() => {
    if (!demoId) { setLoading(false); return }
    fetch(`/api/modules/hr/demos-v2/${demoId}`)
      .then((r) => r.json())
      .then((data: Demo) => {
        setDemo(data)
        setTitle(data.title)
        setVacancyId(data.vacancyId)
        setBlocks(Array.isArray(data.lessonsJson) ? data.lessonsJson : [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [demoId])

  const addBlock = (type: BlockType) => {
    setBlocks((prev) => [
      ...prev,
      { id: crypto.randomUUID(), type, content: "", question: "", options: ["", ""] },
    ])
  }

  const updateBlock = (id: string, field: keyof Block, value: unknown) => {
    setBlocks((prev) =>
      prev.map((b) => b.id === id ? { ...b, [field]: value } : b)
    )
  }

  const removeBlock = (id: string) => {
    setBlocks((prev) => prev.filter((b) => b.id !== id))
  }

  const handleSave = useCallback(async () => {
    if (!demo) return
    setSaving(true)
    const res = await fetch(`/api/modules/hr/demos-v2/${demo.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, lessonsJson: blocks }),
    })
    if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 2000) }
    setSaving(false)
  }, [demo, title, blocks])

  const handlePublish = async () => {
    if (!demo) return
    setSaving(true)
    await fetch(`/api/modules/hr/demos-v2/${demo.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: demo.status === "published" ? "draft" : "published" }),
    })
    setDemo((d) => d ? { ...d, status: d.status === "published" ? "draft" : "published" } : d)
    setSaving(false)
  }

  const handleCreate = async () => {
    if (!vacancyId || !title.trim()) return
    setCreating(true)
    const res = await fetch("/api/modules/hr/demos-v2", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vacancyId, title, lessonsJson: [] }),
    })
    if (res.ok) {
      const d = await res.json() as Demo
      setDemo(d)
      window.history.replaceState(null, "", `?demoId=${d.id}`)
    }
    setCreating(false)
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebarV2 />
      <SidebarInset>
        <DashboardHeader />
        <div className="flex flex-col h-[calc(100vh-56px)]">
          {/* Панель инструментов */}
          <div className="flex items-center justify-between px-6 py-3 border-b gap-4">
            <div className="flex items-center gap-3 flex-1">
              <Input
                placeholder="Название демо..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="max-w-xs font-medium"
              />
              {demo && (
                <Badge variant="secondary">
                  {demo.status === "published" ? "Опубликовано" : "Черновик"}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              {demo && (
                <>
                  <Button variant="outline" size="sm" onClick={handlePublish} disabled={saving}>
                    {demo.status === "published" ? "В черновик" : "Опубликовать"}
                  </Button>
                  <Button size="sm" onClick={handleSave} disabled={saving}>
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
                    {saved ? "Сохранено!" : "Сохранить"}
                  </Button>
                </>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {!loading && !demo && (
              // Форма создания нового демо
              <div className="max-w-xl mx-auto mt-16 p-6 border rounded-xl space-y-4">
                <h2 className="font-semibold text-lg">Создать новое демо</h2>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Вакансия</label>
                  <Select value={vacancyId} onValueChange={setVacancyId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Выберите вакансию..." />
                    </SelectTrigger>
                    <SelectContent>
                      {vacancies.map((v) => (
                        <SelectItem key={v.id} value={v.id}>{v.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Название демо</label>
                  <Input
                    placeholder="Демо для кандидата..."
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </div>
                <Button onClick={handleCreate} disabled={!vacancyId || !title.trim() || creating} className="w-full">
                  {creating && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Создать
                </Button>
              </div>
            )}

            {demo && (
              <div className="max-w-3xl mx-auto py-6 px-4 space-y-3">
                {/* Блоки */}
                {blocks.map((block) => (
                  <BlockEditor key={block.id} block={block} onChange={updateBlock} onRemove={removeBlock} />
                ))}

                {/* Добавить блок */}
                <div className="flex gap-2 pt-2 flex-wrap">
                  {(["text", "video", "question", "task"] as BlockType[]).map((type) => (
                    <Button
                      key={type}
                      variant="outline"
                      size="sm"
                      onClick={() => addBlock(type)}
                      className="gap-1.5"
                    >
                      {BLOCK_ICONS[type]}
                      {BLOCK_LABELS[type]}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}

function BlockEditor({
  block, onChange, onRemove,
}: {
  block: Block
  onChange: (id: string, field: keyof Block, value: unknown) => void
  onRemove: (id: string) => void
}) {
  return (
    <div className="group border rounded-lg bg-card p-4 space-y-2">
      <div className="flex items-center gap-2">
        <GripVertical className="w-4 h-4 text-muted-foreground/30 cursor-grab" />
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {BLOCK_ICONS[block.type]}
          <span>{BLOCK_LABELS[block.type]}</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className={cn("ml-auto w-7 h-7 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive")}
          onClick={() => onRemove(block.id)}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>

      {block.type === "text" && (
        <Textarea
          placeholder="Введите текст..."
          value={block.content}
          onChange={(e) => onChange(block.id, "content", e.target.value)}
          rows={4}
          className="text-sm"
        />
      )}

      {block.type === "video" && (
        <Input
          placeholder="URL видео (YouTube, Vimeo...)"
          value={block.content}
          onChange={(e) => onChange(block.id, "content", e.target.value)}
        />
      )}

      {block.type === "question" && (
        <div className="space-y-2">
          <Input
            placeholder="Вопрос..."
            value={block.question ?? ""}
            onChange={(e) => onChange(block.id, "question", e.target.value)}
          />
          <div className="space-y-1.5">
            {(block.options ?? []).map((opt, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  placeholder={`Вариант ${i + 1}`}
                  value={opt}
                  onChange={(e) => {
                    const options = [...(block.options ?? [])]
                    options[i] = e.target.value
                    onChange(block.id, "options", options)
                  }}
                  className="text-sm"
                />
              </div>
            ))}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onChange(block.id, "options", [...(block.options ?? []), ""])}
              className="text-xs"
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              Добавить вариант
            </Button>
          </div>
        </div>
      )}

      {block.type === "task" && (
        <Textarea
          placeholder="Опишите задание..."
          value={block.content}
          onChange={(e) => onChange(block.id, "content", e.target.value)}
          rows={3}
          className="text-sm"
        />
      )}
    </div>
  )
}

export default function DemoEditorPageV2() {
  return (
    <Suspense>
      <DemoEditorContent />
    </Suspense>
  )
}
