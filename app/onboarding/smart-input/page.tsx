"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { ArrowLeft, ArrowRight, X, Upload, Loader2, CheckCircle2 } from "lucide-react"

// ─── Tag types ────────────────────────────────────────────────────────────────

type TagType =
  | "inn"
  | "website"
  | "vk"
  | "telegram"
  | "youtube"
  | "hh_employer"
  | "hh_vacancy"
  | "2gis"
  | "text"

interface DetectedTag {
  id: string
  type: TagType
  label: string
  value: string
}

const TAG_COLORS: Record<TagType, string> = {
  inn:         "bg-blue-100 text-blue-800 border-blue-200",
  website:     "bg-slate-100 text-slate-700 border-slate-200",
  vk:          "bg-blue-100 text-blue-700 border-blue-200",
  telegram:    "bg-sky-100 text-sky-700 border-sky-200",
  youtube:     "bg-red-100 text-red-700 border-red-200",
  hh_employer: "bg-orange-100 text-orange-700 border-orange-200",
  hh_vacancy:  "bg-orange-100 text-orange-700 border-orange-200",
  "2gis":      "bg-green-100 text-green-700 border-green-200",
  text:        "bg-slate-100 text-slate-600 border-slate-200",
}

// ─── Classifier ───────────────────────────────────────────────────────────────

function classifyInput(raw: string): DetectedTag[] {
  const tags: DetectedTag[] = []
  let idCounter = 0
  const nextId = () => `tag-${idCounter++}`

  // INN: 10 or 12 digit number
  const innMatches = raw.match(/\b\d{10}(\d{2})?\b/g) ?? []
  for (const m of innMatches) {
    if (!tags.find((t) => t.value === m)) {
      tags.push({ id: nextId(), type: "inn", label: `ИНН: ${m}`, value: m })
    }
  }

  // hh.ru employer (before generic URL so it takes priority)
  const hhEmployerMatches = raw.match(/hh\.ru\/employer\/\d+/g) ?? []
  for (const m of hhEmployerMatches) {
    if (!tags.find((t) => t.value === m)) {
      tags.push({ id: nextId(), type: "hh_employer", label: "🔵 hh.ru компания", value: m })
    }
  }

  // hh.ru vacancy
  const hhVacancyMatches = raw.match(/hh\.ru\/vacancy\/\d+/g) ?? []
  for (const m of hhVacancyMatches) {
    if (!tags.find((t) => t.value === m)) {
      tags.push({ id: nextId(), type: "hh_vacancy", label: "🔵 hh.ru вакансия", value: m })
    }
  }

  // VK
  const vkMatches = raw.match(/vk\.com\/[^\s,]+/g) ?? []
  for (const m of vkMatches) {
    const path = m.replace("vk.com/", "")
    if (!tags.find((t) => t.value === m)) {
      tags.push({ id: nextId(), type: "vk", label: `📱 VK: ${path}`, value: m })
    }
  }

  // Telegram
  const tgMatches = raw.match(/t\.me\/[^\s,]+/g) ?? []
  for (const m of tgMatches) {
    const path = m.replace("t.me/", "")
    if (!tags.find((t) => t.value === m)) {
      tags.push({ id: nextId(), type: "telegram", label: `💬 ${path}`, value: m })
    }
  }

  // YouTube
  const ytMatches = raw.match(/(?:youtube\.com\/[^\s,]+|youtu\.be\/[^\s,]+)/g) ?? []
  for (const m of ytMatches) {
    if (!tags.find((t) => t.value === m)) {
      tags.push({ id: nextId(), type: "youtube", label: "▶️ YouTube", value: m })
    }
  }

  // 2GIS
  const gisMatches = raw.match(/2gis\.ru[^\s,]*/g) ?? []
  for (const m of gisMatches) {
    if (!tags.find((t) => t.value === m)) {
      tags.push({ id: nextId(), type: "2gis", label: "📍 2ГИС", value: m })
    }
  }

  // Generic website URL (not social)
  const urlPattern = /https?:\/\/(?!vk\.|t\.me|youtube\.|youtu\.be|ok\.ru|hh\.ru|2gis\.)[^\s,]+/g
  const urlMatches = raw.match(urlPattern) ?? []
  for (const m of urlMatches) {
    try {
      const domain = new URL(m).hostname.replace(/^www\./, "")
      if (!tags.find((t) => t.value === m)) {
        tags.push({ id: nextId(), type: "website", label: `🌐 ${domain}`, value: m })
      }
    } catch {
      // Ignore malformed URLs
    }
  }

  // Fallback text tag if no other patterns found but user typed enough
  const trimmed = raw.trim()
  if (tags.length === 0 && trimmed.length > 5) {
    const preview = trimmed.slice(0, 20) + (trimmed.length > 20 ? "…" : "")
    tags.push({ id: nextId(), type: "text", label: `💬 «${preview}»`, value: trimmed })
  }

  return tags
}

// ─── Processing steps ─────────────────────────────────────────────────────────

const PROCESSING_STEPS = [
  "🔍 Анализируем данные...",
  "🏢 Загружаем данные из реестра...",
  "🌐 Читаем сайт компании...",
  "✅ Готово! Подготовили черновик",
]

// ─── LocalStorage key ─────────────────────────────────────────────────────────

const STORAGE_KEY = "mk_smart_input"

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SmartInputPage() {
  const router = useRouter()

  const [rawInput, setRawInput] = useState("")
  const [detectedTags, setDetectedTags] = useState<DetectedTag[]>([])
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [processingStep, setProcessingStep] = useState(0)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Load saved state on mount
  useEffect(() => {
    if (typeof window === "undefined") return
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed.rawInput) setRawInput(parsed.rawInput)
        if (parsed.detectedTags) setDetectedTags(parsed.detectedTags)
        if (parsed.uploadedFiles) setUploadedFiles(parsed.uploadedFiles)
      }
    } catch {
      // Ignore
    }
  }, [])

  // Persist to localStorage
  const persist = useCallback(
    (raw: string, tags: DetectedTag[], files: string[]) => {
      if (typeof window === "undefined") return
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ rawInput: raw, detectedTags: tags, uploadedFiles: files }))
      } catch {
        // Ignore
      }
    },
    []
  )

  // Debounced classifier
  const handleInputChange = (value: string) => {
    setRawInput(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      const tags = classifyInput(value)
      setDetectedTags(tags)
      persist(value, tags, uploadedFiles)
    }, 500)
  }

  const removeTag = (id: string) => {
    const next = detectedTags.filter((t) => t.id !== id)
    setDetectedTags(next)
    persist(rawInput, next, uploadedFiles)
  }

  const removeFile = (name: string) => {
    const next = uploadedFiles.filter((f) => f !== name)
    setUploadedFiles(next)
    persist(rawInput, detectedTags, next)
  }

  // File drop / pick
  const addFiles = (files: FileList | null) => {
    if (!files) return
    const names = Array.from(files).map((f) => f.name)
    const next = [...uploadedFiles, ...names.filter((n) => !uploadedFiles.includes(n))]
    setUploadedFiles(next)
    persist(rawInput, detectedTags, next)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    addFiles(e.dataTransfer.files)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => setIsDragging(false)

  // Mock processing
  const handleProcess = async () => {
    if (!rawInput.trim() && uploadedFiles.length === 0) return
    setIsProcessing(true)
    setProcessingStep(0)

    for (let i = 0; i < PROCESSING_STEPS.length; i++) {
      setProcessingStep(i)
      await new Promise((r) => setTimeout(r, i === PROCESSING_STEPS.length - 1 ? 600 : 650))
    }

    await new Promise((r) => setTimeout(r, 400))
    router.push("/onboarding/enrichment-preview")
  }

  const canProcess = rawInput.trim().length > 0 || uploadedFiles.length > 0

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex flex-col">
      {/* ── Top bar ── */}
      <div className="border-b bg-white/80 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground"
            onClick={() => router.push("/onboarding/channel")}
          >
            <ArrowLeft className="w-4 h-4" />
            Назад
          </Button>
          <div className="flex items-center gap-2 ml-auto">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold text-xs">
              М
            </div>
            <span className="text-sm font-semibold text-foreground">Моя Команда</span>
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 flex items-start justify-center p-4 py-10">
        <div className="max-w-2xl w-full space-y-6">

          {/* Header */}
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-foreground">Скиньте всё что есть</h1>
            <p className="text-muted-foreground leading-relaxed">
              Вставьте ИНН, ссылку на сайт, соцсети или название компании — в любом порядке.
            </p>
          </div>

          {/* Main textarea */}
          <div className="space-y-2">
            <Textarea
              value={rawInput}
              onChange={(e) => handleInputChange(e.target.value)}
              placeholder="ИНН, ссылка на сайт, VK, Telegram, название компании и город..."
              rows={6}
              className="resize-none text-sm bg-white border-border shadow-sm focus-visible:ring-primary"
              disabled={isProcessing}
            />

            {/* Detected tags */}
            {detectedTags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {detectedTags.map((tag) => (
                  <Badge
                    key={tag.id}
                    variant="outline"
                    className={cn(
                      "text-xs gap-1 pl-2 pr-1 py-0.5 font-normal",
                      TAG_COLORS[tag.type]
                    )}
                  >
                    {tag.label}
                    <button
                      type="button"
                      onClick={() => removeTag(tag.id)}
                      className="ml-0.5 hover:opacity-70 transition-opacity"
                      aria-label="Удалить"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Drag & drop file zone */}
          <div
            className={cn(
              "relative border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all",
              isDragging
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/40 hover:bg-muted/20"
            )}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => addFiles(e.target.files)}
            />
            <Upload className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              📎 Перетащите файлы (КП, прайс, презентация)
            </p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              или нажмите для выбора
            </p>

            {/* Uploaded file chips */}
            {uploadedFiles.length > 0 && (
              <div
                className="flex flex-wrap gap-1.5 mt-3 justify-center"
                onClick={(e) => e.stopPropagation()}
              >
                {uploadedFiles.map((name) => (
                  <span
                    key={name}
                    className="inline-flex items-center gap-1 text-xs bg-white border border-border rounded-md px-2 py-1 text-foreground"
                  >
                    📄 {name}
                    <button
                      type="button"
                      onClick={() => removeFile(name)}
                      className="hover:opacity-70 transition-opacity ml-0.5"
                      aria-label="Удалить файл"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Processing UI */}
          {isProcessing && (
            <div className="rounded-xl border border-border bg-white/80 p-5 space-y-3 shadow-sm">
              {PROCESSING_STEPS.map((step, i) => {
                const isDone = i < processingStep
                const isCurrent = i === processingStep
                return (
                  <div
                    key={step}
                    className={cn(
                      "flex items-center gap-3 text-sm transition-opacity",
                      isDone || isCurrent ? "opacity-100" : "opacity-30"
                    )}
                  >
                    {isDone ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                    ) : isCurrent ? (
                      <Loader2 className="w-4 h-4 text-primary animate-spin flex-shrink-0" />
                    ) : (
                      <div className="w-4 h-4 rounded-full border-2 border-muted flex-shrink-0" />
                    )}
                    <span className={cn(isCurrent && "font-medium text-foreground")}>
                      {step}
                    </span>
                  </div>
                )
              })}
            </div>
          )}

          {/* CTA button */}
          {!isProcessing && (
            <Button
              className="w-full h-12 text-sm font-semibold gap-2"
              disabled={!canProcess}
              onClick={handleProcess}
            >
              Найти и заполнить
              <ArrowRight className="w-4 h-4" />
            </Button>
          )}

          {/* Helper note */}
          {!isProcessing && (
            <p className="text-xs text-center text-muted-foreground">
              Мы не сохраняем ссылки сторонним сервисам — данные остаются только в вашем браузере
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
