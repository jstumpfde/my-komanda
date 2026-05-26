"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Plus, Eye, Pencil, Trash2, Loader2, Copy, BookOpen, FileText, Search, Puzzle, ListChecks, RotateCcw, Trash, AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { LENGTH_LABELS, NICHE_LABELS, MATERIAL_TYPE_LABELS, getMaterialType } from "@/lib/demo-types"
import { toast } from "sonner"

// ─── Types ──────────────────────────────────────────────────────────────────

interface TemplateData {
  id: string
  name: string
  niche: string
  length: string
  isSystem: boolean
  sections: unknown[]
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}

interface QuestionnaireTemplate {
  id: string
  name: string
  type: "candidate" | "client" | "post_demo"
  questionsCount: number
  requiredCount: number
  createdAt: string
  usageCount: number
}

/** Типы материалов, которые реально хранятся в demo_templates (length-based).
 *  Анкеты — отдельная (мок) сущность, в этот тип не входят. */
type CreatableType = "demo" | "block" | "test"

// ─── Constants ──────────────────────────────────────────────────────────────

const TYPE_BADGE: Record<string, { label: string; cls: string }> = {
  candidate: { label: "Кандидат", cls: "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400" },
  client: { label: "Заказчик", cls: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400" },
  post_demo: { label: "После демо", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400" },
}

// Копирайт пустого состояния + диалога создания по типу материала.
const TYPE_COPY: Record<CreatableType, {
  emoji: string
  plural: string          // «Нет {plural}»
  createBtn: string       // кнопка в empty-state / option в диалоге
  dialogDesc: string      // подпись опции в диалоге «Что создать?»
}> = {
  demo:  { emoji: "📖", plural: "демонстраций", createBtn: "Создать первую демонстрацию", dialogDesc: "Полное демо вакансии" },
  block: { emoji: "🧩", plural: "блоков",       createBtn: "Создать первый блок",          dialogDesc: "Переиспользуемый блок («О компании» и т.п.)" },
  test:  { emoji: "✅", plural: "тестов",        createBtn: "Создать первый тест",           dialogDesc: "Тестовое задание для кандидата" },
}

const DIALOG_TITLE: Record<CreatableType, string> = {
  demo: "Демонстрация",
  block: "Блок",
  test: "Тест",
}

// ─── Mock questionnaire data ────────────────────────────────────────────────

const MOCK_QUESTIONNAIRES: QuestionnaireTemplate[] = [
  { id: "q1", name: "Анкета кандидата — базовая", type: "candidate", questionsCount: 12, requiredCount: 8, createdAt: "2026-04-12T10:00:00Z", usageCount: 7 },
  { id: "q2", name: "Анкета кандидата — расширенная", type: "candidate", questionsCount: 25, requiredCount: 15, createdAt: "2026-04-11T10:00:00Z", usageCount: 3 },
  { id: "q3", name: "Анкета заказчика (intake)", type: "client", questionsCount: 10, requiredCount: 10, createdAt: "2026-04-10T10:00:00Z", usageCount: 2 },
  { id: "q4", name: "Опрос после демонстрации", type: "post_demo", questionsCount: 8, requiredCount: 5, createdAt: "2026-04-09T10:00:00Z", usageCount: 4 },
]

// ─── Helpers ──────────────────────────────────────────────────────────────

function formatDate(d: string) {
  if (!d) return "—"
  return new Date(d).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" })
}

// ─── Empty state (переиспользуемый) ─────────────────────────────────────────

function EmptyMaterialsState({ type, onCreate }: { type: CreatableType; onCreate: () => void }) {
  const Icon = type === "block" ? Puzzle : type === "test" ? ListChecks : BookOpen
  const copy = TYPE_COPY[type]
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center px-4">
      <Icon className="h-10 w-10 text-muted-foreground/30 mb-3" />
      <p className="text-sm text-muted-foreground mb-1">Нет {copy.plural}</p>
      <p className="text-xs text-muted-foreground/70 mb-3 max-w-xs">
        Создайте {copy.createBtn.replace(/^Создать /, "").toLowerCase()} для использования в вакансиях
      </p>
      <Button size="sm" variant="outline" onClick={onCreate}>
        <Plus className="h-3.5 w-3.5 mr-1" />{copy.createBtn}
      </Button>
    </div>
  )
}

// ─── Materials table (демо / блоки / тесты — одинаковая структура) ──────────

function MaterialsTable({ rows, onDelete, onDuplicate }: {
  rows: TemplateData[]
  onDelete: (id: string) => void
  onDuplicate: (t: TemplateData) => void
}) {
  return (
    <div className="overflow-auto" style={{ maxHeight: "60vh" }}>
      <table className="w-full">
        <thead className="bg-muted/50 border-b border-t border-border sticky top-0">
          <tr>
            <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-2.5">Название</th>
            <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-2.5 w-[100px]">Тип</th>
            <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-2.5 w-[160px]">Должность</th>
            <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-2.5 w-[70px]">Блоков</th>
            <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-2.5 w-[110px]">Создан</th>
            <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-2.5 w-[110px]">Действия</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => {
            const lengthInfo = LENGTH_LABELS[t.length as keyof typeof LENGTH_LABELS]
            const nicheInfo = NICHE_LABELS[t.niche as keyof typeof NICHE_LABELS]
            const mt = MATERIAL_TYPE_LABELS[getMaterialType(t.length)]
            const sectionsCount = Array.isArray(t.sections) ? t.sections.length : 0
            const firstEmoji = Array.isArray(t.sections) && t.sections.length > 0
              ? (t.sections[0] as { emoji?: string })?.emoji || "📄" : "📄"
            return (
              <tr key={t.id} className="border-b border-border/50 hover:bg-muted/50 transition-colors group">
                <td className="px-4 py-2.5">
                  <Link href={`/hr/library/create/editor?id=${t.id}`} className="flex items-center gap-2 min-w-0">
                    <span className="text-base shrink-0">{firstEmoji}</span>
                    <span className="text-sm font-medium text-foreground group-hover:text-primary transition-colors truncate">{t.name}</span>
                    {t.isSystem && <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 shrink-0">Системный</Badge>}
                  </Link>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex flex-col items-start gap-1">
                    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium", mt.cls)}>{mt.label}</span>
                    {lengthInfo?.label && <span className="text-[10px] text-muted-foreground">{lengthInfo.label}</span>}
                  </div>
                </td>
                <td className="px-4 py-2.5 text-sm text-muted-foreground truncate max-w-[160px]">{nicheInfo?.label || "—"}</td>
                <td className="px-4 py-2.5 text-center text-sm text-muted-foreground">{sectionsCount}</td>
                <td className="px-4 py-2.5 text-sm text-muted-foreground whitespace-nowrap">{formatDate(t.createdAt)}</td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-0.5 justify-end">
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" asChild title="Просмотр">
                      <Link href={`/hr/library/preview/${t.id}`} target="_blank"><Eye className="h-3.5 w-3.5" /></Link>
                    </Button>
                    {/* Редактирование недоступно для системных (PATCH tenant-scoped → 404) */}
                    {!t.isSystem && (
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" asChild title="Редактировать">
                        <Link href={`/hr/library/create/editor?id=${t.id}`}><Pencil className="h-3.5 w-3.5" /></Link>
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Дублировать" onClick={() => onDuplicate(t)}>
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    {!t.isSystem && (
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" title="Удалить" onClick={() => onDelete(t.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ─── Trash (корзина) ─────────────────────────────────────────────────────

// Дней до автоудаления = retention − прошедшие дни с deleted_at (Этап 3).
function trashDaysLeft(deletedAt: string | null, retentionDays: number): number {
  if (!deletedAt) return retentionDays
  const elapsedDays = Math.floor((Date.now() - new Date(deletedAt).getTime()) / 86_400_000)
  return Math.max(0, retentionDays - elapsedDays)
}

function TrashTable({ rows, retentionDays, onRestore, onPermanent }: {
  rows: TemplateData[]
  retentionDays: number
  onRestore: (t: TemplateData) => void
  onPermanent: (t: TemplateData) => void
}) {
  return (
    <div className="overflow-auto" style={{ maxHeight: "60vh" }}>
      <table className="w-full">
        <thead className="bg-muted/50 border-b border-t border-border sticky top-0">
          <tr>
            <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-2.5">Название</th>
            <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-2.5 w-[100px]">Тип</th>
            <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-2.5 w-[120px]">Удалён</th>
            <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-2.5 w-[140px]">До удаления</th>
            <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-2.5 w-[150px]">Действия</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => {
            const mt = MATERIAL_TYPE_LABELS[getMaterialType(t.length)]
            const daysLeft = trashDaysLeft(t.deletedAt, retentionDays)
            return (
              <tr key={t.id} className="border-b border-border/50 hover:bg-muted/50 transition-colors">
                <td className="px-4 py-2.5 text-sm font-medium text-foreground truncate max-w-[280px]">{t.name}</td>
                <td className="px-4 py-2.5">
                  <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium", mt.cls)}>{mt.label}</span>
                </td>
                <td className="px-4 py-2.5 text-sm text-muted-foreground whitespace-nowrap">{formatDate(t.deletedAt ?? "")}</td>
                <td className="px-4 py-2.5">
                  <span className={cn(
                    "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
                    daysLeft <= 1 ? "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400" : "bg-muted text-muted-foreground",
                  )}>
                    {daysLeft === 0 ? "сегодня" : `${daysLeft} дн.`}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-1 justify-end">
                    <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs" title="Восстановить" onClick={() => onRestore(t)}>
                      <RotateCcw className="h-3.5 w-3.5" />Восстановить
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" title="Удалить навсегда" onClick={() => onPermanent(t)}>
                      <Trash className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// Лёгкий аналог vacancy PermanentDeleteDialog — для шаблонов (Этап 3).
// Не трогаем vacancy-флоу; подтверждение через ввод точного названия.
function PermanentDeleteTemplateDialog({ template, open, onOpenChange, onDeleted }: {
  template: TemplateData | null
  open: boolean
  onOpenChange: (v: boolean) => void
  onDeleted: () => void
}) {
  const [typed, setTyped] = useState("")
  const [deleting, setDeleting] = useState(false)
  useEffect(() => { if (!open) { setTyped(""); setDeleting(false) } }, [open])

  const name = template?.name ?? ""
  const confirmed = typed.trim() === name.trim() && name.trim().length > 0

  const handleDelete = async () => {
    if (!template || !confirmed) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/demo-templates/${template.id}/permanent`, { method: "DELETE" })
      if (!res.ok) throw new Error()
      toast.success("Шаблон удалён навсегда")
      onOpenChange(false)
      onDeleted()
    } catch {
      toast.error("Не удалось удалить")
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="size-4" />Удалить навсегда?
          </DialogTitle>
          <DialogDescription>Шаблон «{name}» будет удалён без возможности восстановления.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="confirm-tmpl" className="text-xs">Введите название шаблона для подтверждения:</Label>
          <Input id="confirm-tmpl" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={name} autoComplete="off" />
        </div>
        <div className="flex justify-end gap-2 mt-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={deleting}>Отмена</Button>
          <Button variant="destructive" size="sm" onClick={handleDelete} disabled={!confirmed || deleting} className="gap-1.5">
            {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash className="w-3.5 h-3.5" />}Удалить навсегда
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function LibraryPage() {
  const router = useRouter()
  const [templates, setTemplates] = useState<TemplateData[]>([])
  const [loading, setLoading] = useState(true)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [questionnaires] = useState<QuestionnaireTemplate[]>(MOCK_QUESTIONNAIRES)
  const [activeTab, setActiveTab] = useState<"demos" | "blocks" | "questionnaires" | "tests" | "trash">("demos")
  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState<"all" | "candidate" | "client" | "post_demo">("all")
  const [createOpen, setCreateOpen] = useState(false)
  // Этап 3: корзина. Удалённые шаблоны грузятся отдельным запросом (?trashed=true),
  // retentionDays — для бейджа «дней до удаления» и текста confirm.
  const [trashedRows, setTrashedRows] = useState<TemplateData[]>([])
  const [retentionDays, setRetentionDays] = useState(30)
  const [permanentTarget, setPermanentTarget] = useState<TemplateData | null>(null)

  // Тип материала выводится из length (см. getMaterialType). Анкеты — мок,
  // отдельной вкладкой. Счётчики во вкладках считают весь список типа,
  // поиск — только отображаемые строки.
  const demoRows  = useMemo(() => templates.filter(t => getMaterialType(t.length) === "demo"),  [templates])
  const blockRows = useMemo(() => templates.filter(t => getMaterialType(t.length) === "block"), [templates])
  const testRows  = useMemo(() => templates.filter(t => getMaterialType(t.length) === "test"),  [templates])

  const bySearch = useCallback((list: TemplateData[]) => {
    const q = search.trim().toLowerCase()
    return q ? list.filter(t => t.name.toLowerCase().includes(q)) : list
  }, [search])

  const filteredQuestionnaires = useMemo(() => {
    const q = search.trim().toLowerCase()
    return questionnaires.filter(x =>
      (typeFilter === "all" || x.type === typeFilter) &&
      (!q || x.name.toLowerCase().includes(q))
    )
  }, [questionnaires, search, typeFilter])

  // Демо ведём через богатый мастер (AI / документ / вручную). Блок и тест —
  // структурно простые, открываем редактор напрямую с ?type=.
  const startCreate = (kind: CreatableType) => {
    setCreateOpen(false)
    if (kind === "demo") router.push("/hr/library/create")
    else router.push(`/hr/library/create/editor?type=${kind}`)
  }

  const fetchTemplates = () => {
    setLoading(true)
    fetch("/api/demo-templates")
      .then((r) => r.json())
      .then((data) => {
        const rows = data.data ?? data
        setTemplates(Array.isArray(rows) ? rows : [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }

  const fetchTrashed = () => {
    fetch("/api/demo-templates?trashed=true")
      .then((r) => r.json())
      .then((data) => {
        const rows = data.data ?? data
        setTrashedRows(Array.isArray(rows) ? rows : [])
      })
      .catch(() => { /* корзина просто будет пустой */ })
  }

  useEffect(() => {
    fetchTemplates()
    fetchTrashed()
    fetch("/api/modules/hr/company/trash-retention")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { const days = (d?.data ?? d)?.retentionDays; if (typeof days === "number") setRetentionDays(days) })
      .catch(() => { /* дефолт 30 */ })
  }, [])

  const handleDelete = async () => {
    if (!deleteId) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/demo-templates/${deleteId}`, { method: "DELETE" })
      if (res.ok) {
        toast.success("Шаблон перемещён в корзину")
        setTemplates((prev) => prev.filter((t) => t.id !== deleteId))
        fetchTrashed()
      } else {
        const body = await res.json().catch(() => ({}))
        toast.error(body.error || "Ошибка удаления")
      }
    } catch {
      toast.error("Ошибка сети")
    }
    setDeleting(false)
    setDeleteId(null)
  }

  // Этап 3: восстановить из корзины.
  const handleRestore = async (t: TemplateData) => {
    try {
      const res = await fetch(`/api/demo-templates/${t.id}/restore`, { method: "POST" })
      if (!res.ok) { toast.error("Не удалось восстановить"); return }
      toast.success("Шаблон восстановлен")
      setTrashedRows((prev) => prev.filter((x) => x.id !== t.id))
      fetchTemplates()
    } catch {
      toast.error("Ошибка сети")
    }
  }

  // Дублирование: POST /api/demo-templates всегда создаёт пользовательский
  // (is_system=false) шаблон. length сохраняется → копия блока остаётся блоком,
  // копия теста — тестом. После успеха обновляем список (копия видна сразу).
  const handleDuplicate = async (t: TemplateData) => {
    try {
      const res = await fetch("/api/demo-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${t.name} (копия)`.slice(0, 76),
          niche: t.niche,
          length: t.length,
          sections: t.sections,
        }),
      })
      if (!res.ok) { toast.error("Не удалось дублировать"); return }
      toast.success("Создана копия шаблона")
      fetchTemplates()
    } catch {
      toast.error("Ошибка сети")
    }
  }

  // Один и тот же рендер для вкладок демо/блоки/тесты.
  const renderMaterialsTab = (kind: CreatableType, rows: TemplateData[]) => {
    const shown = bySearch(rows)
    return (
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />Загрузка...
            </div>
          ) : shown.length === 0 ? (
            search.trim() ? (
              <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                <Search className="h-10 w-10 text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground">Ничего не найдено</p>
              </div>
            ) : (
              <EmptyMaterialsState type={kind} onCreate={() => startCreate(kind)} />
            )
          ) : (
            <MaterialsTable rows={shown} onDelete={(id) => setDeleteId(id)} onDuplicate={handleDuplicate} />
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <SidebarProvider>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <div className="flex-1 overflow-auto bg-background min-w-0">
          <div className="py-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
            {/* Header */}
            <div className="mb-6">
              <h1 className="text-2xl font-bold tracking-tight">Библиотека</h1>
              <p className="text-sm text-muted-foreground mt-1">Шаблоны демонстраций, блоков, анкет и тестов</p>
            </div>

            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
              <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
                <TabsList className="shrink-0">
                  <TabsTrigger value="questionnaires" className="gap-1.5">
                    <FileText className="w-3.5 h-3.5" />Анкеты
                    <span className="ml-1 text-muted-foreground">({questionnaires.length})</span>
                  </TabsTrigger>
                  <TabsTrigger value="demos" className="gap-1.5">
                    <BookOpen className="w-3.5 h-3.5" />Демонстрации
                    <span className="ml-1 text-muted-foreground">({demoRows.length})</span>
                  </TabsTrigger>
                  <TabsTrigger value="tests" className="gap-1.5">
                    <ListChecks className="w-3.5 h-3.5" />Тесты
                    <span className="ml-1 text-muted-foreground">({testRows.length})</span>
                  </TabsTrigger>
                  <TabsTrigger value="blocks" className="gap-1.5">
                    <Puzzle className="w-3.5 h-3.5" />Блоки
                    <span className="ml-1 text-muted-foreground">({blockRows.length})</span>
                  </TabsTrigger>
                  <TabsTrigger value="trash" className="gap-1.5">
                    <Trash2 className="w-3.5 h-3.5" />Корзина
                    <span className="ml-1 text-muted-foreground">({trashedRows.length})</span>
                  </TabsTrigger>
                </TabsList>
                <div className="flex items-center gap-2 ml-auto flex-1 justify-end min-w-0">
                  <div className="relative flex-1 max-w-xs min-w-[160px]">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Поиск по названию..."
                      className="pl-8 h-8 text-sm"
                    />
                  </div>
                  {activeTab === "questionnaires" && (
                    <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as typeof typeFilter)}>
                      <SelectTrigger className="h-8 w-[150px] text-sm">
                        <SelectValue placeholder="Тип" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Все типы</SelectItem>
                        <SelectItem value="candidate">Кандидат</SelectItem>
                        <SelectItem value="client">Заказчик</SelectItem>
                        <SelectItem value="post_demo">После демо</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                  <Button size="sm" className="gap-1.5 h-8 text-xs shrink-0" onClick={() => setCreateOpen(true)}>
                    <Plus className="h-3.5 w-3.5" />Создать шаблон
                  </Button>
                </div>
              </div>

              <TabsContent value="demos" className="mt-0">{renderMaterialsTab("demo", demoRows)}</TabsContent>
              <TabsContent value="blocks" className="mt-0">{renderMaterialsTab("block", blockRows)}</TabsContent>
              <TabsContent value="tests" className="mt-0">{renderMaterialsTab("test", testRows)}</TabsContent>

              <TabsContent value="trash" className="mt-0">
                <Card>
                  <CardContent className="p-0">
                    {trashedRows.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                        <Trash2 className="h-10 w-10 text-muted-foreground/30 mb-3" />
                        <p className="text-sm text-muted-foreground">Корзина пуста</p>
                        <p className="text-xs text-muted-foreground/70 mt-1">
                          Удалённые шаблоны хранятся здесь и удаляются навсегда через {retentionDays} дн.
                        </p>
                      </div>
                    ) : (
                      <TrashTable
                        rows={trashedRows}
                        retentionDays={retentionDays}
                        onRestore={handleRestore}
                        onPermanent={(t) => setPermanentTarget(t)}
                      />
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="questionnaires" className="mt-0">
                <Card>
                  <CardContent className="p-0">
                    {filteredQuestionnaires.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                        <FileText className="h-10 w-10 text-muted-foreground/30 mb-3" />
                        <p className="text-sm text-muted-foreground">
                          {questionnaires.length === 0 ? "Нет шаблонов анкет" : "Ничего не найдено"}
                        </p>
                      </div>
                    ) : (
                      <div className="overflow-auto" style={{ maxHeight: "60vh" }}>
                        <table className="w-full">
                          <thead className="bg-muted/50 border-b border-t border-border sticky top-0">
                            <tr>
                              <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-2.5">Название</th>
                              <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-2.5 w-[110px]">Тип</th>
                              <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-2.5 w-[90px]">Вопросов</th>
                              <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-2.5 w-[110px]">Обязат.</th>
                              <th className="text-left text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-2.5 w-[110px]">Создан</th>
                              <th className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-2.5 w-[110px]">Использ.</th>
                              <th className="text-right text-xs font-medium text-muted-foreground uppercase tracking-wider px-4 py-2.5 w-[110px]">Действия</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredQuestionnaires.map((q) => {
                              const tb = TYPE_BADGE[q.type]
                              return (
                                <tr key={q.id} className="border-b border-border/50 hover:bg-muted/50 transition-colors group">
                                  <td className="px-4 py-2.5">
                                    <span className="text-sm font-medium text-foreground">{q.name}</span>
                                  </td>
                                  <td className="px-4 py-2.5">
                                    {tb && <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium", tb.cls)}>{tb.label}</span>}
                                  </td>
                                  <td className="px-4 py-2.5 text-center text-sm text-muted-foreground">{q.questionsCount}</td>
                                  <td className="px-4 py-2.5 text-center text-sm text-muted-foreground">{q.requiredCount}</td>
                                  <td className="px-4 py-2.5 text-sm text-muted-foreground whitespace-nowrap">{formatDate(q.createdAt)}</td>
                                  <td className="px-4 py-2.5 text-center text-sm text-muted-foreground">{q.usageCount}</td>
                                  <td className="px-4 py-2.5">
                                    <div className="flex items-center gap-0.5 justify-end">
                                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => toast("Просмотр анкеты — в разработке")}>
                                        <Eye className="h-3.5 w-3.5" />
                                      </Button>
                                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => toast("Редактирование анкеты — в разработке")}>
                                        <Pencil className="h-3.5 w-3.5" />
                                      </Button>
                                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => toast("Шаблон скопирован")}>
                                        <Copy className="h-3.5 w-3.5" />
                                      </Button>
                                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => toast("Удаление анкеты — в разработке")}>
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </Button>
                                    </div>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>

          </div>
        </div>
      </SidebarInset>

      {/* Create-type chooser */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Что создать?</DialogTitle>
            <DialogDescription>Выберите тип материала для библиотеки</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {(["demo", "test", "block"] as CreatableType[]).map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() => startCreate(kind)}
                className="w-full flex items-start gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:border-primary/50 hover:bg-muted/50"
              >
                <span className="text-2xl leading-none shrink-0">{TYPE_COPY[kind].emoji}</span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{DIALOG_TITLE[kind]}</p>
                  <p className="text-xs text-muted-foreground">{TYPE_COPY[kind].dialogDesc}</p>
                </div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deleteId} onOpenChange={(open) => { if (!open) setDeleteId(null) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Удалить шаблон?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Удалить шаблон «{templates.find(t => t.id === deleteId)?.name ?? ""}»? Он будет перемещён в корзину
            и автоматически удалён через {retentionDays} дн.
          </p>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" size="sm" onClick={() => setDeleteId(null)}>Отмена</Button>
            <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleting}>
              {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
              Удалить
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Permanent delete (из корзины) */}
      <PermanentDeleteTemplateDialog
        template={permanentTarget}
        open={!!permanentTarget}
        onOpenChange={(o) => { if (!o) setPermanentTarget(null) }}
        onDeleted={() => { setPermanentTarget(null); fetchTrashed() }}
      />
    </SidebarProvider>
  )
}
