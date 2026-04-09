"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { ArrowRight, Upload, X, FileText, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { LENGTH_LABELS } from "@/lib/demo-types"
import type { DemoLength } from "@/lib/demo-types"

// ─── Options ────────────────────────────────────────────────────────────────

const DEPARTMENTS = [
  "Продажи", "Маркетинг", "IT / разработка", "Логистика", "Производство",
  "Клиентский сервис", "HR", "Финансы", "Рабочие специальности", "Другое",
]

const MARKET_TYPES = ["B2B", "B2C", "B2G", "Внутренний"]

const LEVELS = ["Линейный", "Старший / ведущий", "Руководитель"]

const TEMPLATES = [
  { id: "empty", name: "Пустая демонстрация", desc: "Начать с нуля", department: null as string | null, market: null as string | null, subblocks: 0 },
  { id: "b2b", name: "Менеджер по продажам B2B", desc: "20 подблоков, стандартная", department: "Продажи", market: "B2B", subblocks: 20 },
  { id: "document", name: "Из документа", desc: "Загрузить DOCX, PDF или TXT", department: null as string | null, market: null as string | null, subblocks: 0 },
]

// ─── Pill component ─────────────────────────────────────────────────────────

function Pill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-9 px-4 rounded-full text-sm font-medium cursor-pointer transition-all duration-200 whitespace-nowrap",
        active
          ? "bg-primary text-primary-foreground shadow-sm"
          : "bg-background border border-border text-foreground hover:border-primary/50",
      )}
    >
      {label}
    </button>
  )
}

// ─── Section header ─────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">{children}</p>
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function CreateDemoPage() {
  const router = useRouter()

  // 1. Position name
  const [positionName, setPositionName] = useState("")
  // 2. Department
  const [department, setDepartment] = useState<string | null>(null)
  // 3. Market type
  const [marketType, setMarketType] = useState<string | null>(null)
  // 4. Level
  const [level, setLevel] = useState<string | null>(null)
  // 5. Format
  const [selectedLength, setSelectedLength] = useState<DemoLength>("standard")
  // 6. Template
  const [selectedTemplate, setSelectedTemplate] = useState("empty")
  // 7. Demo name
  const [demoName, setDemoName] = useState("")
  // 8. Document upload
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [parsing, setParsing] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const lengthKeys = Object.keys(LENGTH_LABELS) as DemoLength[]

  // Filter templates by department + market
  const filteredTemplates = TEMPLATES.filter((t) => {
    if (t.id === "empty" || t.id === "document") return true
    if (t.department && department && t.department !== department) return false
    if (t.market && marketType && t.market !== marketType) return false
    return true
  })

  // Auto-select matching template
  useEffect(() => {
    const match = filteredTemplates.find((t) => t.id !== "empty" && t.id !== "document")
    setSelectedTemplate(match ? match.id : "empty")
  }, [department, marketType]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-fill demo name
  useEffect(() => {
    if (positionName && !demoName) {
      setDemoName(`Демонстрация: ${positionName.slice(0, 30)}`)
    }
  }, [positionName]) // eslint-disable-line react-hooks/exhaustive-deps

  const canCreate = positionName.trim() && department && selectedLength && (selectedTemplate !== "document" || uploadedFile)

  const handleCreate = async () => {
    if (!canCreate) return
    const name = demoName.trim() || `Демонстрация: ${positionName}`

    // If document template — parse file first
    if (selectedTemplate === "document" && uploadedFile) {
      setParsing(true)
      try {
        const formData = new FormData()
        formData.append("file", uploadedFile)
        const res = await fetch("/api/demo-templates/parse-document", { method: "POST", body: formData })
        const data = await res.json()
        if (!res.ok) { toast.error(data.error || "Ошибка парсинга"); setParsing(false); return }

        // Create template with parsed lessons
        const createRes = await fetch("/api/demo-templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            niche: department || "universal",
            length: selectedLength,
            sections: data.lessons.map((l: { emoji: string; title: string; blocks: { type: string; content: string }[] }, i: number) => ({
              id: `lesson-${Date.now()}-${i}`,
              emoji: l.emoji || "📄",
              title: l.title,
              blocks: l.blocks.map((b: { type: string; content: string }, j: number) => ({
                id: `blk-${Date.now()}-${i}-${j}`,
                type: b.type,
                content: b.content,
                imageUrl: "", imageLayout: "full", imageCaption: "", imageTitleTop: "",
                videoUrl: "", videoLayout: "full", videoTitleTop: "", videoCaption: "",
                audioUrl: "", audioTitle: "", audioLayout: "full", audioTitleTop: "", audioCaption: "",
                fileUrl: "", fileName: "", fileLayout: "full", fileTitleTop: "", fileCaption: "",
                infoStyle: "info", infoColor: "", infoIcon: "", infoSize: "m",
                buttonText: "Подробнее", buttonUrl: "", buttonVariant: "primary", buttonColor: "", buttonIconBefore: "", buttonIconAfter: "",
                taskTitle: "", taskDescription: "", questions: [],
              })),
            })),
          }),
        })
        const created = await createRes.json()
        if (!createRes.ok) { toast.error(created.error || "Ошибка создания"); setParsing(false); return }
        const id = (created.data ?? created).id
        toast.success("Документ импортирован")
        router.push(`/hr/library/create/editor?id=${id}`)
      } catch {
        toast.error("Ошибка сети")
      }
      setParsing(false)
      return
    }

    const params = new URLSearchParams({
      length: selectedLength,
      department: department!,
      ...(marketType ? { market: marketType } : {}),
      ...(level ? { level } : {}),
      template: selectedTemplate,
      name,
      position: positionName.trim(),
    })
    router.push(`/hr/library/create/editor?${params.toString()}`)
  }

  const handleFileSelect = (files: FileList | null) => {
    const file = files?.[0]
    if (!file) return
    const ext = file.name.split(".").pop()?.toLowerCase()
    if (!["docx", "pdf", "txt", "md"].includes(ext || "")) {
      toast.error("Поддерживаются: DOCX, PDF, TXT, MD")
      return
    }
    if (file.size > 50 * 1024 * 1024) {
      toast.error("Файл слишком большой (макс 50МБ)")
      return
    }
    setUploadedFile(file)
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <div className="flex-1 overflow-auto bg-background min-w-0">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            <div className="max-w-4xl mx-auto space-y-6">

              {/* Header */}
              <div>
                <h1 className="text-xl font-semibold">Новая демонстрация</h1>
                <p className="text-sm text-muted-foreground mt-0.5">Заполните параметры — чем точнее, тем лучше подберётся шаблон</p>
              </div>

              {/* ═══ 1. Название должности ═══ */}
              <div>
                <SectionLabel>Должность</SectionLabel>
                <Input
                  value={positionName}
                  onChange={(e) => setPositionName(e.target.value)}
                  maxLength={100}
                  placeholder="Например: Менеджер по продажам"
                  className="h-10 bg-[var(--input-bg)]"
                />
              </div>

              {/* ═══ 2. Отдел ═══ */}
              <div>
                <SectionLabel>Отдел</SectionLabel>
                <div className="flex flex-wrap gap-2">
                  {DEPARTMENTS.map((d) => (
                    <Pill key={d} label={d} active={department === d} onClick={() => setDepartment(department === d ? null : d)} />
                  ))}
                </div>
              </div>

              {/* ═══ 3. Тип рынка ═══ */}
              <div>
                <SectionLabel>Тип рынка</SectionLabel>
                <div className="flex flex-wrap gap-2">
                  {MARKET_TYPES.map((m) => (
                    <Pill key={m} label={m} active={marketType === m} onClick={() => setMarketType(marketType === m ? null : m)} />
                  ))}
                </div>
              </div>

              {/* ═══ 4. Уровень ═══ */}
              <div>
                <SectionLabel>Уровень</SectionLabel>
                <div className="flex flex-wrap gap-2">
                  {LEVELS.map((l) => (
                    <Pill key={l} label={l} active={level === l} onClick={() => setLevel(level === l ? null : l)} />
                  ))}
                </div>
              </div>

              {/* ═══ 5. Формат ═══ */}
              <div>
                <SectionLabel>Формат</SectionLabel>
                <div className="grid grid-cols-3 gap-3">
                  {lengthKeys.map((key) => {
                    const l = LENGTH_LABELS[key]
                    const active = selectedLength === key
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setSelectedLength(key)}
                        className={cn(
                          "rounded-lg p-4 text-left cursor-pointer transition-all duration-200 h-[72px] flex flex-col justify-center",
                          active
                            ? "border-2 border-primary bg-primary/5 shadow-sm"
                            : "border border-border hover:border-primary/50",
                        )}
                      >
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-base leading-none">{l.emoji}</span>
                          <span className="text-sm font-semibold">{l.label}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">{l.time} · {l.subblocks} блоков</p>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* ═══ 6. Основа (шаблон) ═══ */}
              <div>
                <SectionLabel>Основа</SectionLabel>
                <div className="space-y-2">
                  {filteredTemplates.map((t) => {
                    const active = selectedTemplate === t.id
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setSelectedTemplate(t.id)}
                        className={cn(
                          "w-full rounded-lg p-3 text-left cursor-pointer transition-all duration-200 flex items-center gap-3",
                          active
                            ? "border-2 border-primary bg-primary/5 shadow-sm"
                            : "border border-border hover:border-primary/50",
                        )}
                      >
                        <div className={cn(
                          "w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center",
                          active ? "border-primary" : "border-muted-foreground/30",
                        )}>
                          {active && <div className="w-2 h-2 rounded-full bg-primary" />}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{t.name}</p>
                          <p className="text-xs text-muted-foreground">{t.desc}</p>
                        </div>
                      </button>
                    )
                  })}
                </div>

                {/* File upload zone for "Из документа" */}
                {selectedTemplate === "document" && (
                  <div className="mt-3">
                    {uploadedFile ? (
                      <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/30">
                        <FileText className="w-6 h-6 text-primary shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{uploadedFile.name}</p>
                          <p className="text-xs text-muted-foreground">{(uploadedFile.size / 1024).toFixed(0)} КБ</p>
                        </div>
                        <button onClick={() => setUploadedFile(null)} className="text-muted-foreground hover:text-destructive transition-colors">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => { e.preventDefault(); handleFileSelect(e.dataTransfer.files) }}
                        onClick={() => fileInputRef.current?.click()}
                        className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
                      >
                        <Upload className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                        <p className="text-sm font-medium">Перетащите файл или нажмите для выбора</p>
                        <p className="text-xs text-muted-foreground mt-1">DOCX, PDF, TXT, MD · Макс 50 МБ</p>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".docx,.pdf,.txt,.md"
                          className="hidden"
                          onChange={(e) => handleFileSelect(e.target.files)}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* ═══ 7. Название демонстрации ═══ */}
              <div>
                <SectionLabel>Название</SectionLabel>
                <Input
                  value={demoName}
                  onChange={(e) => setDemoName(e.target.value)}
                  maxLength={76}
                  placeholder={positionName ? `Демонстрация: ${positionName}` : "Демонстрация: Менеджер по продажам"}
                  className="h-10 bg-[var(--input-bg)]"
                />
                <p className="text-xs text-muted-foreground mt-1">Максимум 76 символов</p>
              </div>

              {/* ═══ Create button ═══ */}
              <div className="flex justify-end pt-2 pb-4">
                <Button
                  onClick={handleCreate}
                  disabled={!canCreate || parsing}
                  className="h-10 px-6 gap-2"
                >
                  {parsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                  {parsing ? "Импорт документа..." : "Создать демонстрацию"}
                </Button>
              </div>

            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
