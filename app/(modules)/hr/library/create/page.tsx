"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { cn } from "@/lib/utils"
import { ArrowRight, Upload, X, FileText, Loader2, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { LENGTH_LABELS, NICHE_LABELS } from "@/lib/demo-types"
import type { DemoLength, DemoNiche } from "@/lib/demo-types"

// ─── Options ────────────────────────────────────────────────────────────────

const DEPARTMENTS = [
  "Продажи", "Маркетинг", "IT / разработка", "Логистика", "Производство",
  "Клиентский сервис", "HR", "Финансы", "Рабочие специальности", "Другое",
]

const MARKET_TYPES = ["B2B", "B2C", "B2G", "Внутренний"]

const LEVELS = ["Линейный", "Старший / ведущий", "Руководитель"]

type Path = "manual" | "library" | "document"

type LibraryTemplate = {
  id: string
  name: string
  niche: string
  length: string
  isSystem: boolean
  sections: unknown[]
}

const PATH_CARDS: { id: Path; emoji: string; title: string; desc: string }[] = [
  { id: "manual",   emoji: "📝", title: "С нуля",        desc: "Заполнить параметры вручную" },
  { id: "library",  emoji: "📚", title: "Из библиотеки", desc: "Выбрать готовый шаблон" },
  { id: "document", emoji: "📄", title: "Из документа",  desc: "Загрузить DOCX, PDF или TXT" },
]

const DEFAULT_BLOCK_FIELDS = {
  imageUrl: "", imageLayout: "full", imageCaption: "", imageTitleTop: "",
  videoUrl: "", videoLayout: "full", videoTitleTop: "", videoCaption: "",
  audioUrl: "", audioTitle: "", audioLayout: "full", audioTitleTop: "", audioCaption: "",
  fileUrl: "", fileName: "", fileLayout: "full", fileTitleTop: "", fileCaption: "",
  infoStyle: "info", infoColor: "", infoIcon: "", infoSize: "m",
  buttonText: "Подробнее", buttonUrl: "", buttonVariant: "primary", buttonColor: "", buttonIconBefore: "", buttonIconAfter: "",
  taskTitle: "", taskDescription: "", questions: [],
}

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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">{children}</p>
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function CreateDemoPage() {
  const router = useRouter()

  const [path, setPath] = useState<Path | null>(null)

  // ── Manual fields ──
  const [demoName, setDemoName] = useState("")
  const [department, setDepartment] = useState<string | null>(null)
  const [marketType, setMarketType] = useState<string | null>(null)
  const [level, setLevel] = useState<string | null>(null)
  const [selectedLength, setSelectedLength] = useState<DemoLength>("standard")

  // ── Library fields ──
  const [templates, setTemplates] = useState<LibraryTemplate[] | null>(null)
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [libDepartment, setLibDepartment] = useState("")
  const [libMarket, setLibMarket] = useState("")
  const [libSearch, setLibSearch] = useState("")
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)

  // ── Document fields ──
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Submission state ──
  const [submitting, setSubmitting] = useState(false)

  const lengthKeys = Object.keys(LENGTH_LABELS) as DemoLength[]

  // Load templates lazily when entering the library path
  useEffect(() => {
    if (path !== "library" || templates !== null || templatesLoading) return
    setTemplatesLoading(true)
    fetch("/api/demo-templates")
      .then((r) => r.json())
      .then((d) => {
        const list: LibraryTemplate[] = Array.isArray(d) ? d : (d.data ?? [])
        setTemplates(list)
        setTemplatesLoading(false)
      })
      .catch(() => {
        toast.error("Не удалось загрузить шаблоны")
        setTemplates([])
        setTemplatesLoading(false)
      })
  }, [path, templates, templatesLoading])

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const handleFileSelect = (files: FileList | null) => {
    const file = files?.[0]
    if (!file) return
    const ext = file.name.split(".").pop()?.toLowerCase()
    if (!["docx", "pdf", "txt", "md"].includes(ext || "")) {
      toast.error("Поддерживаются: DOCX, PDF, TXT, MD")
      return
    }
    if (file.size > 100 * 1024 * 1024) {
      toast.error("Файл слишком большой (макс 100МБ)")
      return
    }
    setUploadedFile(file)
  }

  const handleCreateManual = () => {
    const name = demoName.trim()
    if (name.length < 3) return
    const params = new URLSearchParams({
      length: selectedLength,
      ...(department ? { department } : {}),
      ...(marketType ? { market: marketType } : {}),
      ...(level ? { level } : {}),
      name,
    })
    router.push(`/hr/library/create/editor?${params.toString()}`)
  }

  const handleUseTemplate = async () => {
    if (!selectedTemplateId || !templates) return
    const tmpl = templates.find((t) => t.id === selectedTemplateId)
    if (!tmpl) return

    setSubmitting(true)
    try {
      const res = await fetch("/api/demo-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${tmpl.name} (копия)`.slice(0, 76),
          niche: tmpl.niche,
          length: tmpl.length,
          sections: tmpl.sections,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || "Ошибка создания")
        setSubmitting(false)
        return
      }
      const id = (data.data ?? data).id
      toast.success("Шаблон скопирован")
      router.push(`/hr/library/create/editor?id=${id}`)
    } catch {
      toast.error("Ошибка сети")
      setSubmitting(false)
    }
  }

  const handleCreateFromDocument = async () => {
    if (!uploadedFile) return
    setSubmitting(true)
    try {
      const formData = new FormData()
      formData.append("file", uploadedFile)
      const parseRes = await fetch("/api/demo-templates/parse-document", { method: "POST", body: formData })
      const parseData = await parseRes.json()
      if (!parseRes.ok) {
        toast.error(parseData.error || "Ошибка парсинга")
        setSubmitting(false)
        return
      }

      const baseName = uploadedFile.name.replace(/\.[^.]+$/, "").trim().slice(0, 76) || "Демонстрация"
      const sections = (parseData.lessons as { emoji: string; title: string; blocks: { type: string; content: string }[] }[]).map((l, i) => ({
        id: `lesson-${Date.now()}-${i}`,
        emoji: l.emoji || "📄",
        title: l.title,
        blocks: l.blocks.map((b, j) => ({
          id: `blk-${Date.now()}-${i}-${j}`,
          type: b.type,
          content: b.content,
          ...DEFAULT_BLOCK_FIELDS,
        })),
      }))

      const createRes = await fetch("/api/demo-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: baseName,
          niche: "universal",
          length: "standard",
          sections,
        }),
      })
      const created = await createRes.json()
      if (!createRes.ok) {
        toast.error(created.error || "Ошибка создания")
        setSubmitting(false)
        return
      }
      const id = (created.data ?? created).id
      toast.success("Документ импортирован")
      router.push(`/hr/library/create/editor?id=${id}`)
    } catch {
      toast.error("Ошибка сети")
      setSubmitting(false)
    }
  }

  // ─── Filtered library list ───────────────────────────────────────────────

  const filteredTemplates = (templates ?? []).filter((t) => {
    if (libDepartment && t.niche !== libDepartment) return false
    if (libMarket) {
      const haystack = t.name.toLowerCase()
      if (!haystack.includes(libMarket.toLowerCase())) return false
    }
    if (libSearch) {
      const q = libSearch.toLowerCase()
      if (!t.name.toLowerCase().includes(q)) return false
    }
    return true
  })

  // ─── Render ───────────────────────────────────────────────────────────────

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
                <p className="text-sm text-muted-foreground mt-0.5">Выберите способ создания</p>
              </div>

              {/* ═══ Path cards ═══ */}
              <div className="grid grid-cols-3 gap-4">
                {PATH_CARDS.map((card) => {
                  const active = path === card.id
                  return (
                    <button
                      key={card.id}
                      type="button"
                      onClick={() => setPath(card.id)}
                      className={cn(
                        "h-32 rounded-xl p-6 cursor-pointer text-center transition-all duration-200 flex flex-col items-center justify-center gap-1.5",
                        active
                          ? "border-2 border-primary bg-primary/5 shadow-sm"
                          : "border border-border hover:border-primary/50",
                      )}
                    >
                      <div className="text-[32px] leading-none">{card.emoji}</div>
                      <div className="text-base font-bold">{card.title}</div>
                      <div className="text-sm text-muted-foreground">{card.desc}</div>
                    </button>
                  )
                })}
              </div>

              {/* ═══ Manual path ═══ */}
              {path === "manual" && (
                <div className="space-y-6">
                  <div>
                    <SectionLabel>Название демонстрации *</SectionLabel>
                    <Input
                      value={demoName}
                      onChange={(e) => setDemoName(e.target.value)}
                      maxLength={76}
                      placeholder="Например: Менеджер по продажам B2B — Компания"
                      className="h-10 bg-[var(--input-bg)]"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Обязательное поле, минимум 3 символа</p>
                  </div>

                  <div>
                    <SectionLabel>Отдел</SectionLabel>
                    <div className="flex flex-wrap gap-2">
                      {DEPARTMENTS.map((d) => (
                        <Pill key={d} label={d} active={department === d} onClick={() => setDepartment(department === d ? null : d)} />
                      ))}
                    </div>
                  </div>

                  <div>
                    <SectionLabel>Тип рынка</SectionLabel>
                    <div className="flex flex-wrap gap-2">
                      {MARKET_TYPES.map((m) => (
                        <Pill key={m} label={m} active={marketType === m} onClick={() => setMarketType(marketType === m ? null : m)} />
                      ))}
                    </div>
                  </div>

                  <div>
                    <SectionLabel>Уровень</SectionLabel>
                    <div className="flex flex-wrap gap-2">
                      {LEVELS.map((l) => (
                        <Pill key={l} label={l} active={level === l} onClick={() => setLevel(level === l ? null : l)} />
                      ))}
                    </div>
                  </div>

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

                  <div className="flex justify-end pt-2 pb-4">
                    <Button
                      onClick={handleCreateManual}
                      disabled={demoName.trim().length < 3}
                      className="h-10 px-6 gap-2"
                    >
                      <ArrowRight className="w-4 h-4" />
                      Создать демонстрацию
                    </Button>
                  </div>
                </div>
              )}

              {/* ═══ Library path ═══ */}
              {path === "library" && (
                <div className="space-y-6">
                  {/* Filters row */}
                  <div className="grid grid-cols-3 gap-3">
                    <select
                      value={libDepartment}
                      onChange={(e) => setLibDepartment(e.target.value)}
                      className="h-10 px-3 rounded-md border border-border bg-background text-sm"
                    >
                      <option value="">Все отделы</option>
                      {Object.entries(NICHE_LABELS).map(([key, meta]) => (
                        <option key={key} value={key}>{meta.emoji} {meta.label}</option>
                      ))}
                    </select>
                    <select
                      value={libMarket}
                      onChange={(e) => setLibMarket(e.target.value)}
                      className="h-10 px-3 rounded-md border border-border bg-background text-sm"
                    >
                      <option value="">Все рынки</option>
                      <option value="B2B">B2B</option>
                      <option value="B2C">B2C</option>
                      <option value="B2G">B2G</option>
                    </select>
                    <div className="relative">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={libSearch}
                        onChange={(e) => setLibSearch(e.target.value)}
                        placeholder="Поиск шаблонов..."
                        className="h-10 pl-9 bg-[var(--input-bg)]"
                      />
                    </div>
                  </div>

                  {/* Templates list */}
                  {templatesLoading ? (
                    <div className="flex items-center justify-center h-32 gap-2 text-muted-foreground">
                      <Loader2 className="w-5 h-5 animate-spin" />Загрузка шаблонов...
                    </div>
                  ) : filteredTemplates.length === 0 ? (
                    <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
                      Шаблоны не найдены
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      {filteredTemplates.map((t) => {
                        const niche = NICHE_LABELS[t.niche as DemoNiche]
                        const lengthMeta = LENGTH_LABELS[t.length as DemoLength]
                        const lessonsCount = Array.isArray(t.sections) ? t.sections.length : 0
                        const active = selectedTemplateId === t.id
                        return (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => setSelectedTemplateId(t.id)}
                            className={cn(
                              "rounded-lg p-4 text-left cursor-pointer transition-all duration-200 flex items-start gap-3",
                              active
                                ? "border-2 border-primary bg-primary/5 shadow-sm"
                                : "border border-border hover:border-primary/50",
                            )}
                          >
                            <div className="text-2xl leading-none shrink-0">{niche?.emoji ?? "⚡"}</div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold truncate">{t.name}</p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {lengthMeta?.label ?? t.length} · {lessonsCount} {lessonsCount === 1 ? "урок" : "уроков"}
                              </p>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}

                  <div className="flex justify-end pt-2 pb-4">
                    <Button
                      onClick={handleUseTemplate}
                      disabled={!selectedTemplateId || submitting}
                      className="h-10 px-6 gap-2"
                    >
                      {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                      {submitting ? "Создание..." : "Использовать шаблон"}
                    </Button>
                  </div>
                </div>
              )}

              {/* ═══ Document path ═══ */}
              {path === "document" && (
                <div className="space-y-6">
                  {uploadedFile ? (
                    <div className="flex items-center gap-3 p-4 rounded-lg border border-border bg-muted/30">
                      <FileText className="w-7 h-7 text-primary shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{uploadedFile.name}</p>
                        <p className="text-xs text-muted-foreground">{(uploadedFile.size / 1024).toFixed(0)} КБ</p>
                      </div>
                      <button
                        onClick={() => setUploadedFile(null)}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                        type="button"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  ) : (
                    <div
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => { e.preventDefault(); handleFileSelect(e.dataTransfer.files) }}
                      onClick={() => fileInputRef.current?.click()}
                      className="border-2 border-dashed border-border rounded-xl p-12 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
                    >
                      <Upload className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                      <p className="text-sm font-medium">Перетащите файл или нажмите для выбора</p>
                      <p className="text-xs text-muted-foreground mt-1">DOCX, PDF, TXT, MD · Макс 100 МБ</p>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".docx,.pdf,.txt,.md"
                        className="hidden"
                        onChange={(e) => handleFileSelect(e.target.files)}
                      />
                    </div>
                  )}

                  <div className="flex justify-end pt-2 pb-4">
                    <Button
                      onClick={handleCreateFromDocument}
                      disabled={!uploadedFile || submitting}
                      className="h-10 px-6 gap-2"
                    >
                      {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                      {submitting ? "Импорт документа..." : "Создать из документа"}
                    </Button>
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
