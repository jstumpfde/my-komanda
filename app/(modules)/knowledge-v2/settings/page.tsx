"use client"

import { useState, useEffect, useRef, type DragEvent } from "react"
import Link from "next/link"
import {
  Loader2,
  Send,
  ChevronDown,
  ExternalLink,
  Clock,
  RefreshCw,
  FileText,
  Presentation,
  Search,
  Sparkles,
  HelpCircle,
  GraduationCap,
  Bell,
  Camera,
  Upload,
  Copy as CopyIcon,
  Save as SaveIcon,
  X as XIcon,
} from "lucide-react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

interface TelegramSettings {
  connected: boolean
  maskedToken: string | null
  botUsername: string | null
  webhookSet: boolean
  webhookUrl?: string
}

interface FlaggedItem {
  id: string
  type: "article" | "demo"
  title: string
  reason: "expired" | "review"
  href: string
}

interface FreshnessResponse {
  items: FlaggedItem[]
  total: number
  expired: number
  review: number
}

interface GapItem {
  questionKey: string
  sample: string
  count: number
  lastAskedAt: string | null
}

interface GapsResponse {
  items: GapItem[]
  total: number
  uniqueQuestions: number
}

interface ProgressRow {
  assignmentId: string
  userId: string
  userName: string
  userEmail: string
  planId: string
  planTitle: string
  progress: number
  deadline: string | null
  status: "on_track" | "behind" | "overdue" | "completed"
}

interface ProgressResponse {
  items: ProgressRow[]
  total: number
  behind: number
  overdue: number
  completed: number
}

type DocType =
  | "regulation"
  | "instruction"
  | "sales_script"
  | "onboarding"
  | "job_description"
  | "faq"
  | "article"
  | "test"
  | "privacy_policy"
  | "offer"
  | "cookie_policy"

const DOC_TYPE_LABELS: { value: DocType; label: string }[] = [
  { value: "regulation", label: "Регламент" },
  { value: "instruction", label: "Инструкция / SOP" },
  { value: "sales_script", label: "Скрипт продаж" },
  { value: "onboarding", label: "Онбординг" },
  { value: "job_description", label: "Должностная инструкция" },
  { value: "faq", label: "FAQ" },
  { value: "article", label: "Статья / обучение" },
  { value: "test", label: "Аттестация / тест" },
  { value: "privacy_policy", label: "Политика конфиденциальности" },
  { value: "offer", label: "Оферта" },
  { value: "cookie_policy", label: "Cookie-политика" },
]

export default function KnowledgeSettingsPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [settings, setSettings] = useState<TelegramSettings | null>(null)
  const [tokenInput, setTokenInput] = useState("")
  const [tgOpen, setTgOpen] = useState(false)

  // Freshness
  const [freshness, setFreshness] = useState<FreshnessResponse | null>(null)
  const [freshnessLoading, setFreshnessLoading] = useState(true)
  const [freshnessRunning, setFreshnessRunning] = useState(false)
  const [freshOpen, setFreshOpen] = useState(false)

  // Gaps (аудит пробелов)
  const [gaps, setGaps] = useState<GapsResponse | null>(null)
  const [gapsLoading, setGapsLoading] = useState(true)
  const [gapsRunning, setGapsRunning] = useState(false)
  const [gapsOpen, setGapsOpen] = useState(false)

  // Generate
  const [genType, setGenType] = useState<DocType>("regulation")
  const [genTopic, setGenTopic] = useState("")
  const [genDept, setGenDept] = useState("")
  const [genRunning, setGenRunning] = useState(false)
  const [genResult, setGenResult] = useState<{ articleId: string; title: string } | null>(null)
  const [genOpen, setGenOpen] = useState(false)

  // Progress (контроль обучения)
  const [progressData, setProgressData] = useState<ProgressResponse | null>(null)
  const [progressLoading, setProgressLoading] = useState(true)
  const [progressSending, setProgressSending] = useState(false)
  const [progressOpen, setProgressOpen] = useState(false)

  // OCR
  const [ocrOpen, setOcrOpen] = useState(false)
  const [ocrRunning, setOcrRunning] = useState(false)
  const [ocrSaving, setOcrSaving] = useState(false)
  const [ocrText, setOcrText] = useState("")
  const [ocrTitle, setOcrTitle] = useState("")
  const [ocrFileName, setOcrFileName] = useState<string | null>(null)
  const [ocrDragActive, setOcrDragActive] = useState(false)
  const [ocrSaved, setOcrSaved] = useState<{ articleId: string; title: string } | null>(null)
  const ocrInputRef = useRef<HTMLInputElement>(null)

  async function loadTelegram() {
    try {
      const res = await fetch("/api/modules/knowledge/telegram")
      if (res.ok) {
        const data = await res.json() as TelegramSettings
        setSettings(data)
      }
    } catch {
      // ignore
    }
  }

  async function loadFreshness() {
    try {
      const res = await fetch("/api/modules/knowledge/freshness")
      if (res.ok) {
        const data = await res.json() as FreshnessResponse
        setFreshness(data)
      }
    } catch {
      // ignore
    }
  }

  async function loadGaps() {
    try {
      const res = await fetch("/api/modules/knowledge/gaps")
      if (res.ok) {
        const data = await res.json() as GapsResponse
        setGaps(data)
      }
    } catch {
      // ignore
    }
  }

  async function loadProgressData() {
    try {
      const res = await fetch("/api/modules/knowledge/progress")
      if (res.ok) {
        const data = await res.json() as ProgressResponse
        setProgressData(data)
      }
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    void (async () => {
      setLoading(true)
      setFreshnessLoading(true)
      setGapsLoading(true)
      setProgressLoading(true)
      await Promise.all([loadTelegram(), loadFreshness(), loadGaps(), loadProgressData()])
      setLoading(false)
      setFreshnessLoading(false)
      setGapsLoading(false)
      setProgressLoading(false)
    })()
  }, [])

  async function handleSave() {
    const token = tokenInput.trim()
    if (!token) {
      toast.error("Введите токен бота")
      return
    }
    setSaving(true)
    try {
      const res = await fetch("/api/modules/knowledge/telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      })
      const data = await res.json() as TelegramSettings & { error?: string }
      if (!res.ok) {
        toast.error(data.error || "Не удалось подключить бота")
        return
      }
      setSettings(data)
      setTokenInput("")
      toast.success("Бот подключён")
      setTgOpen(false)
    } catch {
      toast.error("Ошибка сети")
    } finally {
      setSaving(false)
    }
  }

  async function handleDisconnect() {
    if (!confirm("Отключить Telegram-бота? Webhook будет удалён.")) return
    setDisconnecting(true)
    try {
      const res = await fetch("/api/modules/knowledge/telegram", { method: "DELETE" })
      if (!res.ok) {
        toast.error("Не удалось отключить")
        return
      }
      setSettings({ connected: false, maskedToken: null, botUsername: null, webhookSet: false })
      setTokenInput("")
      toast.success("Бот отключён")
      setTgOpen(false)
    } catch {
      toast.error("Ошибка сети")
    } finally {
      setDisconnecting(false)
    }
  }

  async function runOcr(file: File) {
    const ALLOWED = ["image/jpeg", "image/jpg", "image/png", "image/webp", "application/pdf"]
    if (!ALLOWED.includes(file.type)) {
      toast.error("Формат не поддерживается. Разрешены JPEG, PNG, WebP, PDF")
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Файл слишком большой (максимум 10MB)")
      return
    }
    setOcrRunning(true)
    setOcrText("")
    setOcrTitle("")
    setOcrFileName(file.name)
    setOcrSaved(null)
    try {
      const form = new FormData()
      form.append("file", file)
      const res = await fetch("/api/modules/knowledge/ocr", {
        method: "POST",
        body: form,
      })
      const data = await res.json() as { ok?: true; text?: string; title?: string; error?: string }
      if (!res.ok || !data.text) {
        toast.error(data.error || "Не удалось распознать файл")
        setOcrFileName(null)
        return
      }
      setOcrText(data.text)
      setOcrTitle(data.title || "Распознанный документ")
      toast.success("Текст распознан")
    } catch {
      toast.error("Ошибка сети")
    } finally {
      setOcrRunning(false)
    }
  }

  function handleOcrFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) void runOcr(file)
    e.target.value = ""
  }

  function handleOcrDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setOcrDragActive(false)
    const file = e.dataTransfer.files?.[0]
    if (file) void runOcr(file)
  }

  async function handleOcrSave() {
    if (!ocrText.trim()) {
      toast.error("Нет текста для сохранения")
      return
    }
    setOcrSaving(true)
    try {
      const res = await fetch("/api/modules/knowledge/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: ocrText,
          title: ocrTitle.trim() || undefined,
          saveToKnowledge: true,
        }),
      })
      const data = await res.json() as { ok?: true; articleId?: string; title?: string; error?: string }
      if (!res.ok || !data.articleId) {
        toast.error(data.error || "Не удалось сохранить")
        return
      }
      setOcrSaved({ articleId: data.articleId, title: data.title || "Черновик" })
      toast.success("Сохранено в базу знаний")
    } catch {
      toast.error("Ошибка сети")
    } finally {
      setOcrSaving(false)
    }
  }

  async function handleOcrCopy() {
    if (!ocrText) return
    try {
      await navigator.clipboard.writeText(ocrText)
      toast.success("Скопировано")
    } catch {
      toast.error("Не удалось скопировать")
    }
  }

  function resetOcr() {
    setOcrText("")
    setOcrTitle("")
    setOcrFileName(null)
    setOcrSaved(null)
  }

  async function handleSendReminders() {
    setProgressSending(true)
    try {
      const res = await fetch("/api/modules/knowledge/progress", { method: "POST" })
      if (!res.ok) {
        toast.error("Не удалось отправить напоминания")
        return
      }
      const data = await res.json() as ProgressResponse & { ok: true; sent: number }
      setProgressData(data)
      toast.success(
        data.sent > 0 ? `Отправлено ${data.sent} напоминаний` : "Нет отстающих — все в графике",
      )
    } catch {
      toast.error("Ошибка сети")
    } finally {
      setProgressSending(false)
    }
  }

  async function handleRunGaps() {
    setGapsRunning(true)
    try {
      const res = await fetch("/api/modules/knowledge/gaps", { method: "POST" })
      if (!res.ok) {
        toast.error("Не удалось запустить аудит")
        return
      }
      const data = await res.json() as GapsResponse & { ok: true }
      setGaps(data)
      toast.success(
        data.total > 0
          ? `${data.uniqueQuestions} уникальных вопросов без ответа`
          : "Пробелов нет — база знаний закрывает запросы",
      )
    } catch {
      toast.error("Ошибка сети")
    } finally {
      setGapsRunning(false)
    }
  }

  async function handleGenerate() {
    if (!genTopic.trim()) {
      toast.error("Укажите тему документа")
      return
    }
    setGenRunning(true)
    setGenResult(null)
    try {
      const res = await fetch("/api/modules/knowledge/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: genType,
          topic: genTopic.trim(),
          department: genDept.trim() || undefined,
        }),
      })
      const data = await res.json() as { ok?: true; articleId?: string; title?: string; error?: string }
      if (!res.ok || !data.articleId) {
        toast.error(data.error || "Не удалось сгенерировать документ")
        return
      }
      setGenResult({ articleId: data.articleId, title: data.title || "Черновик" })
      setGenTopic("")
      setGenDept("")
      toast.success("Черновик создан")
    } catch {
      toast.error("Ошибка сети")
    } finally {
      setGenRunning(false)
    }
  }

  async function handleRunFreshness() {
    setFreshnessRunning(true)
    try {
      const res = await fetch("/api/modules/knowledge/freshness", { method: "POST" })
      if (!res.ok) {
        toast.error("Не удалось запустить проверку")
        return
      }
      const data = await res.json() as FreshnessResponse
      setFreshness(data)
      toast.success(
        data.total > 0
          ? `Найдено ${data.total} материалов (устаревших: ${data.expired}, на проверку: ${data.review})`
          : "Все материалы актуальны",
      )
    } catch {
      toast.error("Ошибка сети")
    } finally {
      setFreshnessRunning(false)
    }
  }

  const connected = Boolean(settings?.connected)
  const freshCount = freshness?.total ?? 0
  const hasIssues = freshCount > 0

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <div className="flex-1 overflow-auto bg-background min-w-0">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            <div className="max-w-3xl mx-auto space-y-4">
              <div className="mb-4">
                <h1 className="text-xl font-semibold text-foreground mb-1">Настройки базы знаний</h1>
                <p className="text-muted-foreground text-sm">
                  Подключите собственного Telegram-бота и следите за актуальностью материалов
                </p>
              </div>

              {loading ? (
                <div className="flex items-center justify-center h-48 gap-2 text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Загрузка настроек...
                </div>
              ) : (
                <>
                  {/* ── Accordion: Telegram ─────────────────────────────────── */}
                  <div className="rounded-xl shadow-sm border border-border bg-card overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setTgOpen((v) => !v)}
                      className="w-full flex items-center justify-between gap-4 p-6 text-left hover:bg-muted/40 transition-colors"
                      aria-expanded={tgOpen}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="rounded-lg bg-muted p-2 shrink-0">
                          <Send className="w-5 h-5 text-foreground" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-base font-medium truncate">Telegram-бот</p>
                          {connected && settings?.botUsername && (
                            <p className="text-xs text-muted-foreground truncate mt-0.5">
                              @{settings.botUsername}
                            </p>
                          )}
                        </div>
                        <span
                          className={cn(
                            "ml-2 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium shrink-0",
                            connected
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                              : "bg-muted text-muted-foreground",
                          )}
                        >
                          {connected ? "Подключён" : "Не подключён"}
                        </span>
                      </div>
                      <ChevronDown
                        className={cn(
                          "w-5 h-5 text-muted-foreground shrink-0 transition-transform",
                          tgOpen && "rotate-180",
                        )}
                      />
                    </button>

                    {tgOpen && (
                      <div className="border-t border-border p-6 space-y-5">
                        <div>
                          <p className="text-sm font-medium mb-2">Как подключить бота</p>
                          <ol className="text-sm text-muted-foreground space-y-1.5 list-decimal list-inside">
                            <li>
                              Откройте{" "}
                              <a
                                href="https://t.me/BotFather"
                                target="_blank"
                                rel="noreferrer"
                                className="text-primary hover:underline inline-flex items-center gap-0.5"
                              >
                                @BotFather
                                <ExternalLink className="w-3 h-3" />
                              </a>{" "}
                              в Telegram
                            </li>
                            <li>
                              Отправьте команду{" "}
                              <code className="px-1 py-0.5 rounded bg-muted text-xs">/newbot</code>{" "}
                              и следуйте инструкциям
                            </li>
                            <li>
                              Скопируйте выданный токен (вида{" "}
                              <code className="px-1 py-0.5 rounded bg-muted text-xs">123456:ABC-DEF...</code>)
                            </li>
                            <li>Вставьте токен в поле ниже и нажмите «Подключить»</li>
                          </ol>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="bot-token" className="text-sm font-medium">
                            Токен бота
                          </Label>
                          <Input
                            id="bot-token"
                            type="password"
                            placeholder={settings?.maskedToken ?? "123456789:ABCdefGhIJKlmNoPQRstuVWXyz"}
                            value={tokenInput}
                            onChange={(e) => setTokenInput(e.target.value)}
                            className="font-mono text-sm"
                            autoComplete="off"
                          />
                        </div>

                        <div className="flex justify-end gap-2">
                          {connected ? (
                            <Button variant="outline" onClick={handleDisconnect} disabled={disconnecting}>
                              {disconnecting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                              Отключить
                            </Button>
                          ) : (
                            <Button onClick={handleSave} disabled={saving || !tokenInput.trim()}>
                              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                              Подключить
                            </Button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* ── Accordion: Контроль актуальности ────────────────────── */}
                  <div className="rounded-xl shadow-sm border border-border bg-card overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setFreshOpen((v) => !v)}
                      className="w-full flex items-center justify-between gap-4 p-6 text-left hover:bg-muted/40 transition-colors"
                      aria-expanded={freshOpen}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="rounded-lg bg-muted p-2 shrink-0">
                          <Clock className="w-5 h-5 text-foreground" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-base font-medium truncate">Контроль актуальности</p>
                          {hasIssues && (
                            <p className="text-xs text-muted-foreground truncate mt-0.5">
                              Устаревших: {freshness?.expired ?? 0}, на проверку: {freshness?.review ?? 0}
                            </p>
                          )}
                        </div>
                        <span
                          className={cn(
                            "ml-2 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium shrink-0",
                            freshnessLoading
                              ? "bg-muted text-muted-foreground"
                              : hasIssues
                                ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                                : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
                          )}
                        >
                          {freshnessLoading
                            ? "Загрузка…"
                            : hasIssues
                              ? `${freshCount} ${plural(freshCount, "материал", "материала", "материалов")}`
                              : "Всё актуально"}
                        </span>
                      </div>
                      <ChevronDown
                        className={cn(
                          "w-5 h-5 text-muted-foreground shrink-0 transition-transform",
                          freshOpen && "rotate-180",
                        )}
                      />
                    </button>

                    {freshOpen && (
                      <div className="border-t border-border p-6 space-y-4">
                        <div className="flex items-center justify-between gap-4">
                          <p className="text-sm text-muted-foreground">
                            Материалы проверяются по полю <code className="px-1 py-0.5 rounded bg-muted text-xs">valid_until</code>{" "}
                            и по циклу ревью. Устаревшие помечаются автоматически.
                          </p>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={handleRunFreshness}
                            disabled={freshnessRunning}
                            className="shrink-0"
                          >
                            {freshnessRunning ? (
                              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                            ) : (
                              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                            )}
                            Проверить сейчас
                          </Button>
                        </div>

                        {freshness && freshness.items.length > 0 ? (
                          <ul className="divide-y divide-border rounded-lg border border-border overflow-hidden">
                            {freshness.items.map((item) => (
                              <li key={`${item.type}:${item.id}`}>
                                <Link
                                  href={item.href}
                                  className="flex items-center justify-between gap-3 p-3 hover:bg-muted/40 transition-colors"
                                >
                                  <div className="flex items-center gap-3 min-w-0">
                                    {item.type === "article" ? (
                                      <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                                    ) : (
                                      <Presentation className="w-4 h-4 text-muted-foreground shrink-0" />
                                    )}
                                    <span className="text-sm truncate">{item.title}</span>
                                  </div>
                                  <span
                                    className={cn(
                                      "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium shrink-0",
                                      item.reason === "expired"
                                        ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                                        : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
                                    )}
                                  >
                                    {item.reason === "expired" ? "Устарел" : "На проверку"}
                                  </span>
                                </Link>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                            Все материалы актуальны
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* ── Accordion: Аудит пробелов ─────────────────────────── */}
                  <div className="rounded-xl shadow-sm border border-border bg-card overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setGapsOpen((v) => !v)}
                      className="w-full flex items-center justify-between gap-4 p-6 text-left hover:bg-muted/40 transition-colors"
                      aria-expanded={gapsOpen}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="rounded-lg bg-muted p-2 shrink-0">
                          <Search className="w-5 h-5 text-foreground" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-base font-medium truncate">Аудит пробелов</p>
                          {gaps && gaps.uniqueQuestions > 0 && (
                            <p className="text-xs text-muted-foreground truncate mt-0.5">
                              {gaps.total} запросов за неделю
                            </p>
                          )}
                        </div>
                        <span
                          className={cn(
                            "ml-2 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium shrink-0",
                            gapsLoading
                              ? "bg-muted text-muted-foreground"
                              : gaps && gaps.uniqueQuestions > 0
                                ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                                : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
                          )}
                        >
                          {gapsLoading
                            ? "Загрузка…"
                            : gaps && gaps.uniqueQuestions > 0
                              ? `${gaps.uniqueQuestions} ${plural(gaps.uniqueQuestions, "вопрос", "вопроса", "вопросов")}`
                              : "Пробелов нет"}
                        </span>
                      </div>
                      <ChevronDown
                        className={cn(
                          "w-5 h-5 text-muted-foreground shrink-0 transition-transform",
                          gapsOpen && "rotate-180",
                        )}
                      />
                    </button>

                    {gapsOpen && (
                      <div className="border-t border-border p-6 space-y-4">
                        <div className="flex items-center justify-between gap-4">
                          <p className="text-sm text-muted-foreground">
                            Неотвеченные вопросы сотрудников за последние 7 дней. Помогает увидеть, каких материалов не хватает в базе.
                          </p>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={handleRunGaps}
                            disabled={gapsRunning}
                            className="shrink-0"
                          >
                            {gapsRunning ? (
                              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                            ) : (
                              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                            )}
                            Запустить аудит
                          </Button>
                        </div>

                        {gaps && gaps.items.length > 0 ? (
                          <ul className="divide-y divide-border rounded-lg border border-border overflow-hidden">
                            {gaps.items.map((g) => (
                              <li
                                key={g.questionKey}
                                className="flex items-center justify-between gap-3 p-3"
                              >
                                <div className="flex items-center gap-3 min-w-0">
                                  <HelpCircle className="w-4 h-4 text-muted-foreground shrink-0" />
                                  <span className="text-sm truncate">{g.sample}</span>
                                </div>
                                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground shrink-0">
                                  × {g.count}
                                </span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                            Пробелов не найдено
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* ── Accordion: AI-генерация документов ────────────────── */}
                  <div className="rounded-xl shadow-sm border border-border bg-card overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setGenOpen((v) => !v)}
                      className="w-full flex items-center justify-between gap-4 p-6 text-left hover:bg-muted/40 transition-colors"
                      aria-expanded={genOpen}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="rounded-lg bg-muted p-2 shrink-0">
                          <Sparkles className="w-5 h-5 text-foreground" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-base font-medium truncate">AI-генерация документов</p>
                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                            Регламенты, инструкции, скрипты — по мастер-шаблону
                          </p>
                        </div>
                      </div>
                      <ChevronDown
                        className={cn(
                          "w-5 h-5 text-muted-foreground shrink-0 transition-transform",
                          genOpen && "rotate-180",
                        )}
                      />
                    </button>

                    {genOpen && (
                      <div className="border-t border-border p-6 space-y-4">
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Тип документа</Label>
                          <Select value={genType} onValueChange={(v) => setGenType(v as DocType)}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {DOC_TYPE_LABELS.map((t) => (
                                <SelectItem key={t.value} value={t.value}>
                                  {t.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="gen-topic" className="text-sm font-medium">
                            Тема
                          </Label>
                          <Input
                            id="gen-topic"
                            placeholder="Например: возврат товара, настройка VPN, онбординг менеджера"
                            value={genTopic}
                            onChange={(e) => setGenTopic(e.target.value)}
                          />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="gen-dept" className="text-sm font-medium">
                            Отдел <span className="text-muted-foreground font-normal">(необязательно)</span>
                          </Label>
                          <Input
                            id="gen-dept"
                            placeholder="Например: отдел продаж"
                            value={genDept}
                            onChange={(e) => setGenDept(e.target.value)}
                          />
                        </div>

                        <div className="flex justify-end">
                          <Button onClick={handleGenerate} disabled={genRunning || !genTopic.trim()}>
                            {genRunning ? (
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            ) : (
                              <Sparkles className="w-4 h-4 mr-2" />
                            )}
                            Сгенерировать
                          </Button>
                        </div>

                        {genResult && (
                          <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-900/20 p-4">
                            <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
                              Черновик создан
                            </p>
                            <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-1 mb-2">
                              {genResult.title}
                            </p>
                            <Link
                              href={`/knowledge-v2/editor?id=${genResult.articleId}&type=article`}
                              className="text-sm text-primary hover:underline inline-flex items-center gap-1"
                            >
                              Открыть в редакторе
                              <ExternalLink className="w-3 h-3" />
                            </Link>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* ── Accordion: Контроль обучения ─────────────────────── */}
                  <div className="rounded-xl shadow-sm border border-border bg-card overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setProgressOpen((v) => !v)}
                      className="w-full flex items-center justify-between gap-4 p-6 text-left hover:bg-muted/40 transition-colors"
                      aria-expanded={progressOpen}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="rounded-lg bg-muted p-2 shrink-0">
                          <GraduationCap className="w-5 h-5 text-foreground" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-base font-medium truncate">Контроль обучения</p>
                          {progressData && progressData.total > 0 && (
                            <p className="text-xs text-muted-foreground truncate mt-0.5">
                              Завершили: {progressData.completed}, отстают: {progressData.behind}, просрочили: {progressData.overdue}
                            </p>
                          )}
                        </div>
                        <span
                          className={cn(
                            "ml-2 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium shrink-0",
                            progressLoading
                              ? "bg-muted text-muted-foreground"
                              : progressData && (progressData.behind > 0 || progressData.overdue > 0)
                                ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                                : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
                          )}
                        >
                          {progressLoading
                            ? "Загрузка…"
                            : progressData && (progressData.behind + progressData.overdue) > 0
                              ? `${progressData.behind + progressData.overdue} ${plural(progressData.behind + progressData.overdue, "отстаёт", "отстают", "отстают")}`
                              : "Все в графике"}
                        </span>
                      </div>
                      <ChevronDown
                        className={cn(
                          "w-5 h-5 text-muted-foreground shrink-0 transition-transform",
                          progressOpen && "rotate-180",
                        )}
                      />
                    </button>

                    {progressOpen && (
                      <div className="border-t border-border p-6 space-y-4">
                        <div className="flex items-center justify-between gap-4">
                          <p className="text-sm text-muted-foreground">
                            Активные назначения сотрудников. «Отстают» — прогресс меньше 50% при дедлайне ближе 7 дней.
                          </p>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={handleSendReminders}
                            disabled={progressSending}
                            className="shrink-0"
                          >
                            {progressSending ? (
                              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                            ) : (
                              <Bell className="w-3.5 h-3.5 mr-1.5" />
                            )}
                            Отправить напоминания
                          </Button>
                        </div>

                        {progressData && progressData.items.length > 0 ? (
                          <div className="rounded-lg border border-border overflow-hidden">
                            <table className="w-full text-sm">
                              <thead className="bg-muted/40 text-xs text-muted-foreground">
                                <tr>
                                  <th className="text-left font-medium px-3 py-2">Сотрудник</th>
                                  <th className="text-left font-medium px-3 py-2">План</th>
                                  <th className="text-left font-medium px-3 py-2 w-24">Прогресс</th>
                                  <th className="text-left font-medium px-3 py-2 w-28">Дедлайн</th>
                                  <th className="text-left font-medium px-3 py-2 w-28">Статус</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-border">
                                {progressData.items.map((row) => {
                                  const deadlineRu = row.deadline
                                    ? new Date(row.deadline).toLocaleDateString("ru-RU", { day: "2-digit", month: "short" })
                                    : "—"
                                  const statusMeta = getStatusMeta(row.status)
                                  return (
                                    <tr key={row.assignmentId}>
                                      <td className="px-3 py-2 truncate">{row.userName}</td>
                                      <td className="px-3 py-2 truncate text-muted-foreground">{row.planTitle}</td>
                                      <td className="px-3 py-2">
                                        <div className="flex items-center gap-2">
                                          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                                            <div
                                              className={cn(
                                                "h-full",
                                                row.progress >= 100
                                                  ? "bg-emerald-500"
                                                  : row.progress >= 50
                                                    ? "bg-primary"
                                                    : "bg-amber-500",
                                              )}
                                              style={{ width: `${row.progress}%` }}
                                            />
                                          </div>
                                          <span className="text-xs text-muted-foreground tabular-nums">{row.progress}%</span>
                                        </div>
                                      </td>
                                      <td className="px-3 py-2 text-muted-foreground">{deadlineRu}</td>
                                      <td className="px-3 py-2">
                                        <span
                                          className={cn(
                                            "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                                            statusMeta.className,
                                          )}
                                        >
                                          {statusMeta.label}
                                        </span>
                                      </td>
                                    </tr>
                                  )
                                })}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                            Нет активных назначений
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* ── Accordion: OCR распознавание документов ─────────── */}
                  <div className="rounded-xl shadow-sm border border-border bg-card overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setOcrOpen((v) => !v)}
                      className="w-full flex items-center justify-between gap-4 p-6 text-left hover:bg-muted/40 transition-colors"
                      aria-expanded={ocrOpen}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="rounded-lg bg-muted p-2 shrink-0">
                          <Camera className="w-5 h-5 text-foreground" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-base font-medium truncate">OCR — распознавание документов</p>
                          <p className="text-xs text-muted-foreground truncate mt-0.5">
                            Загрузите фото документа для извлечения текста
                          </p>
                        </div>
                      </div>
                      <ChevronDown
                        className={cn(
                          "w-5 h-5 text-muted-foreground shrink-0 transition-transform",
                          ocrOpen && "rotate-180",
                        )}
                      />
                    </button>

                    {ocrOpen && (
                      <div className="border-t border-border p-6 space-y-4">
                        <input
                          ref={ocrInputRef}
                          type="file"
                          accept="image/jpeg,image/png,image/webp,application/pdf"
                          onChange={handleOcrFileInput}
                          className="hidden"
                        />

                        {!ocrText && !ocrRunning && (
                          <div
                            onDragOver={(e) => {
                              e.preventDefault()
                              setOcrDragActive(true)
                            }}
                            onDragLeave={() => setOcrDragActive(false)}
                            onDrop={handleOcrDrop}
                            onClick={() => ocrInputRef.current?.click()}
                            className={cn(
                              "rounded-lg border-2 border-dashed p-8 text-center cursor-pointer transition-colors",
                              ocrDragActive
                                ? "border-primary bg-primary/5"
                                : "border-border hover:border-primary/40 hover:bg-muted/40",
                            )}
                          >
                            <Upload className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
                            <p className="text-sm font-medium">Перетащите файл сюда или нажмите для выбора</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              JPEG, PNG, WebP, PDF — до 10MB
                            </p>
                          </div>
                        )}

                        {ocrRunning && (
                          <div className="rounded-lg border border-border p-8 text-center">
                            <Loader2 className="w-6 h-6 mx-auto mb-3 animate-spin text-primary" />
                            <p className="text-sm font-medium">Распознаю…</p>
                            {ocrFileName && (
                              <p className="text-xs text-muted-foreground mt-1 truncate">{ocrFileName}</p>
                            )}
                          </div>
                        )}

                        {ocrText && !ocrRunning && (
                          <>
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-xs text-muted-foreground truncate">
                                {ocrFileName && <>Файл: <span className="font-medium">{ocrFileName}</span></>}
                              </p>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={resetOcr}
                                className="h-7 px-2 text-xs"
                              >
                                <XIcon className="w-3 h-3 mr-1" />
                                Сбросить
                              </Button>
                            </div>

                            <div className="space-y-2">
                              <Label htmlFor="ocr-title" className="text-sm font-medium">
                                Название
                              </Label>
                              <Input
                                id="ocr-title"
                                value={ocrTitle}
                                onChange={(e) => setOcrTitle(e.target.value)}
                                placeholder="Название документа"
                              />
                            </div>

                            <div className="space-y-2">
                              <Label htmlFor="ocr-text" className="text-sm font-medium">
                                Извлечённый текст
                              </Label>
                              <Textarea
                                id="ocr-text"
                                value={ocrText}
                                onChange={(e) => setOcrText(e.target.value)}
                                rows={12}
                                className="font-mono text-xs"
                              />
                            </div>

                            <div className="flex flex-wrap justify-end gap-2">
                              <Button
                                variant="outline"
                                onClick={handleOcrCopy}
                                disabled={!ocrText}
                              >
                                <CopyIcon className="w-4 h-4 mr-2" />
                                Копировать текст
                              </Button>
                              <Button
                                onClick={handleOcrSave}
                                disabled={ocrSaving || !ocrText.trim()}
                              >
                                {ocrSaving ? (
                                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                ) : (
                                  <SaveIcon className="w-4 h-4 mr-2" />
                                )}
                                Сохранить в базу знаний
                              </Button>
                            </div>

                            {ocrSaved && (
                              <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-900/20 p-4">
                                <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
                                  Сохранено
                                </p>
                                <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-1 mb-2">
                                  {ocrSaved.title}
                                </p>
                                <Link
                                  href={`/knowledge-v2/editor?id=${ocrSaved.articleId}&type=article`}
                                  className="text-sm text-primary hover:underline inline-flex items-center gap-1"
                                >
                                  Открыть в редакторе
                                  <ExternalLink className="w-3 h-3" />
                                </Link>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return one
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few
  return many
}

function getStatusMeta(status: ProgressRow["status"]): { label: string; className: string } {
  switch (status) {
    case "completed":
      return {
        label: "Завершён",
        className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
      }
    case "overdue":
      return {
        label: "Просрочен",
        className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
      }
    case "behind":
      return {
        label: "Отстаёт",
        className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
      }
    default:
      return {
        label: "В графике",
        className: "bg-muted text-muted-foreground",
      }
  }
}
