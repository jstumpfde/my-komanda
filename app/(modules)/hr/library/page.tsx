"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Plus, Eye, Pencil, Trash2, Loader2, Copy, BookOpen, FileText, Search, Puzzle, ListChecks, RotateCcw, Trash, AlertTriangle, MoreHorizontal, Globe, Lock } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { CardContent } from "@/components/ui/card"
import { TableCard, DataTable, DataHead, DataHeadCell, DataRow, DataCell } from "@/components/ui/data-table"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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

// Шаблон анкеты (questionnaire_templates, миграция 0147). questions хранится
// как Question[] (course-types); счётчики считаем из массива. Тип анкеты пока
// один — «Кандидат» (остальные не подключены), поэтому в UI его не показываем.
interface QuestionnaireTemplate {
  id: string
  name: string
  type: "candidate" | "client" | "post_demo"
  questions: { required?: boolean }[]
  isSystem: boolean
  deletedAt: string | null
  createdAt: string
}

/** Типы материалов, которые реально хранятся в demo_templates (length-based). */
type CreatableType = "demo" | "block" | "test"

// Унифицированная строка корзины: материалы и анкеты лежат в разных таблицах,
// но показываются вместе.
interface TrashRow {
  id: string
  name: string
  typeLabel: string
  typeCls: string
  deletedAt: string | null
  kind: "material" | "questionnaire"
}

// ─── Constants ──────────────────────────────────────────────────────────────

const TRASH_ANKETA_CLS = "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400"

// Копирайт пустого состояния + диалога создания по типу материала.
const TYPE_COPY: Record<CreatableType, {
  plural: string
  createBtn: string
  dialogDesc: string
}> = {
  demo:  { plural: "демонстраций", createBtn: "Создать первую демонстрацию", dialogDesc: "Полное демо вакансии" },
  block: { plural: "блоков",       createBtn: "Создать первый блок",          dialogDesc: "Переиспользуемый блок («О компании» и т.п.)" },
  test:  { plural: "тестов",        createBtn: "Создать первый тест",           dialogDesc: "Тестовое задание для кандидата" },
}

const DIALOG_TITLE: Record<CreatableType, string> = {
  demo: "Демонстрация", block: "Блок", test: "Тест",
}

const CREATE_ICON: Record<CreatableType, typeof BookOpen> = {
  demo: BookOpen, block: Puzzle, test: ListChecks,
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function formatDate(d: string) {
  if (!d) return "—"
  return new Date(d).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" })
}

// Меню-«точки» (kebab) — как в вакансиях. Триггер + контент передаётся детьми.
function RowMenu({ children }: { children: React.ReactNode }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" title="Действия">
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ─── Empty state (переиспользуемый) ─────────────────────────────────────────

function EmptyMaterialsState({ type, onCreate }: { type: CreatableType; onCreate: () => void }) {
  const Icon = CREATE_ICON[type]
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

// ─── Materials table (демо / блоки / тесты) ──────────────────────────────────

function MaterialsTable({ rows, onDelete, onDuplicate }: {
  rows: TemplateData[]
  onDelete: (id: string) => void
  onDuplicate: (t: TemplateData) => void
}) {
  return (
    <DataTable>
      <DataHead>
        <DataHeadCell>Название</DataHeadCell>
        <DataHeadCell width="120px">Тип</DataHeadCell>
        <DataHeadCell width="180px">Должность</DataHeadCell>
        <DataHeadCell align="center" width="80px">Блоков</DataHeadCell>
        <DataHeadCell width="120px">Создан</DataHeadCell>
        <DataHeadCell align="right" width="80px">Действия</DataHeadCell>
      </DataHead>
      <tbody>
        {rows.map((t) => {
          const lengthInfo = LENGTH_LABELS[t.length as keyof typeof LENGTH_LABELS]
          const nicheInfo = NICHE_LABELS[t.niche as keyof typeof NICHE_LABELS]
          const mt = MATERIAL_TYPE_LABELS[getMaterialType(t.length)]
          const sectionsCount = Array.isArray(t.sections) ? t.sections.length : 0
          return (
            <DataRow key={t.id} className="group">
              <DataCell>
                <Link href={`/hr/library/create/editor?id=${t.id}`} className="flex items-center gap-2 min-w-0">
                  <span className="font-medium text-foreground group-hover:text-primary transition-colors truncate">{t.name}</span>
                  {t.isSystem && <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 shrink-0 font-normal">Системный</Badge>}
                </Link>
              </DataCell>
              <DataCell>
                <div className="flex flex-col items-start gap-1">
                  <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", mt.cls)}>{mt.label}</span>
                  {lengthInfo?.label && <span className="text-xs text-muted-foreground">{lengthInfo.label}</span>}
                </div>
              </DataCell>
              <DataCell className="text-muted-foreground truncate max-w-[180px]">{nicheInfo?.label || "—"}</DataCell>
              <DataCell align="center" className="text-muted-foreground">{sectionsCount}</DataCell>
              <DataCell className="text-muted-foreground whitespace-nowrap">{formatDate(t.createdAt)}</DataCell>
              <DataCell>
                <div className="flex justify-end">
                  <RowMenu>
                    <DropdownMenuItem asChild className="gap-2 cursor-pointer">
                      <Link href={`/hr/library/preview/${t.id}`} target="_blank"><Eye className="h-3.5 w-3.5" />Просмотр</Link>
                    </DropdownMenuItem>
                    {!t.isSystem && (
                      <DropdownMenuItem asChild className="gap-2 cursor-pointer">
                        <Link href={`/hr/library/create/editor?id=${t.id}`}><Pencil className="h-3.5 w-3.5" />Редактировать</Link>
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => onDuplicate(t)}>
                      <Copy className="h-3.5 w-3.5" />Дублировать
                    </DropdownMenuItem>
                    {!t.isSystem && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="gap-2 cursor-pointer text-destructive focus:text-destructive" onClick={() => onDelete(t.id)}>
                          <Trash2 className="h-3.5 w-3.5" />Удалить
                        </DropdownMenuItem>
                      </>
                    )}
                  </RowMenu>
                </div>
              </DataCell>
            </DataRow>
          )
        })}
      </tbody>
    </DataTable>
  )
}

// ─── Questionnaires table (анкеты) ──────────────────────────────────────────

function QuestionnairesTable({ rows, isPlatformAdmin, onEdit, onDuplicate, onDelete, onAssignAll, onUnassignAll }: {
  rows: QuestionnaireTemplate[]
  isPlatformAdmin: boolean
  onEdit: (q: QuestionnaireTemplate) => void
  onDuplicate: (q: QuestionnaireTemplate) => void
  onDelete: (id: string) => void
  onAssignAll: (q: QuestionnaireTemplate) => void
  onUnassignAll: (q: QuestionnaireTemplate) => void
}) {
  return (
    <DataTable>
      <DataHead>
        <DataHeadCell>Название</DataHeadCell>
        <DataHeadCell align="center" width="110px">Вопросов</DataHeadCell>
        <DataHeadCell align="center" width="110px">Обязат.</DataHeadCell>
        <DataHeadCell width="120px">Создан</DataHeadCell>
        <DataHeadCell align="right" width="80px">Действия</DataHeadCell>
      </DataHead>
      <tbody>
        {rows.map((q) => {
          const total = Array.isArray(q.questions) ? q.questions.length : 0
          const required = Array.isArray(q.questions) ? q.questions.filter((x) => x?.required).length : 0
          return (
            <DataRow key={q.id} className="group">
              <DataCell>
                <button type="button" onClick={() => onEdit(q)} className="flex items-center gap-2 min-w-0 text-left">
                  <span className="font-medium text-foreground group-hover:text-primary transition-colors truncate">{q.name}</span>
                  {q.isSystem && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 shrink-0 font-normal gap-0.5">
                      <Globe className="h-2.5 w-2.5" />Всем
                    </Badge>
                  )}
                </button>
              </DataCell>
              <DataCell align="center" className="text-muted-foreground">{total}</DataCell>
              <DataCell align="center" className="text-muted-foreground">{required}</DataCell>
              <DataCell className="text-muted-foreground whitespace-nowrap">{formatDate(q.createdAt)}</DataCell>
              <DataCell>
                <div className="flex justify-end">
                  <RowMenu>
                    <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => onEdit(q)}>
                      {q.isSystem ? <><Eye className="h-3.5 w-3.5" />Просмотр</> : <><Pencil className="h-3.5 w-3.5" />Редактировать</>}
                    </DropdownMenuItem>
                    <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => onDuplicate(q)}>
                      <Copy className="h-3.5 w-3.5" />Дублировать
                    </DropdownMenuItem>
                    {isPlatformAdmin && (
                      <>
                        <DropdownMenuSeparator />
                        {q.isSystem ? (
                          <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => onUnassignAll(q)}>
                            <Lock className="h-3.5 w-3.5" />Снять у всех
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => onAssignAll(q)}>
                            <Globe className="h-3.5 w-3.5" />Назначить всем компаниям
                          </DropdownMenuItem>
                        )}
                      </>
                    )}
                    {!q.isSystem && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="gap-2 cursor-pointer text-destructive focus:text-destructive" onClick={() => onDelete(q.id)}>
                          <Trash2 className="h-3.5 w-3.5" />Удалить
                        </DropdownMenuItem>
                      </>
                    )}
                  </RowMenu>
                </div>
              </DataCell>
            </DataRow>
          )
        })}
      </tbody>
    </DataTable>
  )
}

// ─── Trash (корзина) — материалы + анкеты вместе ────────────────────────────

function trashDaysLeft(deletedAt: string | null, retentionDays: number): number {
  if (!deletedAt) return retentionDays
  const elapsedDays = Math.floor((Date.now() - new Date(deletedAt).getTime()) / 86_400_000)
  return Math.max(0, retentionDays - elapsedDays)
}

function TrashTable({ rows, retentionDays, onRestore, onPermanent }: {
  rows: TrashRow[]
  retentionDays: number
  onRestore: (t: TrashRow) => void
  onPermanent: (t: TrashRow) => void
}) {
  return (
    <DataTable>
      <DataHead>
        <DataHeadCell>Название</DataHeadCell>
        <DataHeadCell width="140px">Тип</DataHeadCell>
        <DataHeadCell width="120px">Удалён</DataHeadCell>
        <DataHeadCell width="140px">До удаления</DataHeadCell>
        <DataHeadCell align="right" width="80px">Действия</DataHeadCell>
      </DataHead>
      <tbody>
        {rows.map((t) => {
          const daysLeft = trashDaysLeft(t.deletedAt, retentionDays)
          return (
            <DataRow key={`${t.kind}-${t.id}`}>
              <DataCell className="font-medium text-foreground truncate max-w-[280px]">{t.name}</DataCell>
              <DataCell>
                <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", t.typeCls)}>{t.typeLabel}</span>
              </DataCell>
              <DataCell className="text-muted-foreground whitespace-nowrap">{formatDate(t.deletedAt ?? "")}</DataCell>
              <DataCell>
                <span className={cn(
                  "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                  daysLeft <= 1 ? "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400" : "bg-muted text-muted-foreground",
                )}>
                  {daysLeft === 0 ? "сегодня" : `${daysLeft} дн.`}
                </span>
              </DataCell>
              <DataCell>
                <div className="flex justify-end">
                  <RowMenu>
                    <DropdownMenuItem className="gap-2 cursor-pointer" onClick={() => onRestore(t)}>
                      <RotateCcw className="h-3.5 w-3.5" />Восстановить
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="gap-2 cursor-pointer text-destructive focus:text-destructive" onClick={() => onPermanent(t)}>
                      <Trash className="h-3.5 w-3.5" />Удалить навсегда
                    </DropdownMenuItem>
                  </RowMenu>
                </div>
              </DataCell>
            </DataRow>
          )
        })}
      </tbody>
    </DataTable>
  )
}

// Подтверждение необратимого удаления вводом точного названия.
function PermanentDeleteDialog({ target, open, onOpenChange, onDeleted }: {
  target: TrashRow | null
  open: boolean
  onOpenChange: (v: boolean) => void
  onDeleted: () => void
}) {
  const [typed, setTyped] = useState("")
  const [deleting, setDeleting] = useState(false)
  useEffect(() => { if (!open) { setTyped(""); setDeleting(false) } }, [open])

  const name = target?.name ?? ""
  const confirmed = typed.trim() === name.trim() && name.trim().length > 0

  const handleDelete = async () => {
    if (!target || !confirmed) return
    const base = target.kind === "questionnaire" ? "/api/questionnaire-templates" : "/api/demo-templates"
    setDeleting(true)
    try {
      const res = await fetch(`${base}/${target.id}/permanent`, { method: "DELETE" })
      if (!res.ok) throw new Error()
      toast.success("Удалено навсегда")
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
          <DialogDescription>«{name}» будет удалён без возможности восстановления.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="confirm-tmpl" className="text-xs">Введите название для подтверждения:</Label>
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

type TabKey = "questionnaires" | "demos" | "blocks" | "tests" | "trash"

export default function LibraryPage() {
  const router = useRouter()
  const [templates, setTemplates] = useState<TemplateData[]>([])
  const [questionnaires, setQuestionnaires] = useState<QuestionnaireTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingQ, setLoadingQ] = useState(true)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleteQId, setDeleteQId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false)
  // Анкеты — главное, с них начинают → вкладка по умолчанию.
  const [activeTab, setActiveTab] = useState<TabKey>("questionnaires")
  const [search, setSearch] = useState("")
  const [createOpen, setCreateOpen] = useState(false)
  // Корзина: удалённые материалы и анкеты грузятся отдельными запросами.
  const [trashedRows, setTrashedRows] = useState<TemplateData[]>([])
  const [trashedQ, setTrashedQ] = useState<QuestionnaireTemplate[]>([])
  const [retentionDays, setRetentionDays] = useState(30)
  const [permanentTarget, setPermanentTarget] = useState<TrashRow | null>(null)

  const demoRows  = useMemo(() => templates.filter(t => getMaterialType(t.length) === "demo"),  [templates])
  const blockRows = useMemo(() => templates.filter(t => getMaterialType(t.length) === "block"), [templates])
  const testRows  = useMemo(() => templates.filter(t => getMaterialType(t.length) === "test"),  [templates])

  const bySearch = useCallback((list: TemplateData[]) => {
    const q = search.trim().toLowerCase()
    return q ? list.filter(t => t.name.toLowerCase().includes(q)) : list
  }, [search])

  const filteredQuestionnaires = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? questionnaires.filter(x => x.name.toLowerCase().includes(q)) : questionnaires
  }, [questionnaires, search])

  // Единый список корзины: материалы + анкеты.
  const trashRows = useMemo<TrashRow[]>(() => {
    const mats: TrashRow[] = trashedRows.map((t) => {
      const mt = MATERIAL_TYPE_LABELS[getMaterialType(t.length)]
      return { id: t.id, name: t.name, typeLabel: mt.label, typeCls: mt.cls, deletedAt: t.deletedAt, kind: "material" }
    })
    const qs: TrashRow[] = trashedQ.map((q) => (
      { id: q.id, name: q.name, typeLabel: "Анкета", typeCls: TRASH_ANKETA_CLS, deletedAt: q.deletedAt, kind: "questionnaire" }
    ))
    return [...mats, ...qs].sort((a, b) => (b.deletedAt ?? "").localeCompare(a.deletedAt ?? ""))
  }, [trashedRows, trashedQ])

  const startCreate = (kind: CreatableType) => {
    setCreateOpen(false)
    if (kind === "demo") router.push("/hr/library/create")
    else router.push(`/hr/library/create/editor?type=${kind}`)
  }
  const startCreateAnketa = () => {
    setCreateOpen(false)
    router.push("/hr/library/anketa-editor")
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

  const fetchQuestionnaires = () => {
    setLoadingQ(true)
    fetch("/api/questionnaire-templates")
      .then((r) => r.json())
      .then((data) => {
        const rows = data.data ?? data
        setQuestionnaires(Array.isArray(rows) ? rows : [])
        setLoadingQ(false)
      })
      .catch(() => setLoadingQ(false))
  }

  const fetchTrashed = () => {
    fetch("/api/demo-templates?trashed=true")
      .then((r) => r.json())
      .then((data) => { const rows = data.data ?? data; setTrashedRows(Array.isArray(rows) ? rows : []) })
      .catch(() => { /* пусто */ })
    fetch("/api/questionnaire-templates?trashed=true")
      .then((r) => r.json())
      .then((data) => { const rows = data.data ?? data; setTrashedQ(Array.isArray(rows) ? rows : []) })
      .catch(() => { /* пусто */ })
  }

  useEffect(() => {
    if (typeof window !== "undefined") {
      const tab = new URLSearchParams(window.location.search).get("tab") as TabKey | null
      if (tab && ["questionnaires", "demos", "blocks", "tests", "trash"].includes(tab)) setActiveTab(tab)
    }
    fetchTemplates()
    fetchQuestionnaires()
    fetchTrashed()
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { setIsPlatformAdmin(!!(d?.data ?? d)?.isPlatformAdmin) })
      .catch(() => { /* не админ */ })
    fetch("/api/modules/hr/company/trash-retention")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { const days = (d?.data ?? d)?.retentionDays; if (typeof days === "number") setRetentionDays(days) })
      .catch(() => { /* дефолт 30 */ })
  }, [])

  // ── Материалы ────────────────────────────────────────────────────────────
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

  const handleDuplicate = async (t: TemplateData) => {
    try {
      const res = await fetch("/api/demo-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: `${t.name} (копия)`.slice(0, 76), niche: t.niche, length: t.length, sections: t.sections }),
      })
      if (!res.ok) { toast.error("Не удалось дублировать"); return }
      toast.success("Создана копия шаблона")
      fetchTemplates()
    } catch {
      toast.error("Ошибка сети")
    }
  }

  // ── Анкеты ───────────────────────────────────────────────────────────────
  const editQuestionnaire = (q: QuestionnaireTemplate) => {
    router.push(`/hr/library/anketa-editor?id=${q.id}`)
  }

  const duplicateQuestionnaire = async (q: QuestionnaireTemplate) => {
    try {
      const res = await fetch("/api/questionnaire-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: `${q.name} (копия)`.slice(0, 120), type: q.type, questions: q.questions }),
      })
      if (!res.ok) { toast.error("Не удалось дублировать"); return }
      toast.success("Создана копия анкеты")
      fetchQuestionnaires()
    } catch {
      toast.error("Ошибка сети")
    }
  }

  const handleDeleteQuestionnaire = async () => {
    if (!deleteQId) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/questionnaire-templates/${deleteQId}`, { method: "DELETE" })
      if (res.ok) {
        toast.success("Анкета перемещена в корзину")
        setQuestionnaires((prev) => prev.filter((q) => q.id !== deleteQId))
        fetchTrashed()
      } else {
        const body = await res.json().catch(() => ({}))
        toast.error(body.error || "Ошибка удаления")
      }
    } catch {
      toast.error("Ошибка сети")
    }
    setDeleting(false)
    setDeleteQId(null)
  }

  // Платформенный админ: раздать всем компаниям / снять (возврат в приватные).
  const assignAll = async (q: QuestionnaireTemplate) => {
    try {
      const res = await fetch(`/api/questionnaire-templates/${q.id}/assign-all`, { method: "POST" })
      if (!res.ok) { toast.error("Не удалось назначить"); return }
      toast.success("Анкета доступна всем компаниям")
      fetchQuestionnaires()
    } catch { toast.error("Ошибка сети") }
  }
  const unassignAll = async (q: QuestionnaireTemplate) => {
    try {
      const res = await fetch(`/api/questionnaire-templates/${q.id}/unassign-all`, { method: "POST" })
      if (!res.ok) { toast.error("Не удалось снять"); return }
      toast.success("Анкета снята у всех (осталась в вашей компании)")
      fetchQuestionnaires()
    } catch { toast.error("Ошибка сети") }
  }

  // ── Корзина: восстановление ───────────────────────────────────────────────
  const handleRestore = async (t: TrashRow) => {
    const base = t.kind === "questionnaire" ? "/api/questionnaire-templates" : "/api/demo-templates"
    try {
      const res = await fetch(`${base}/${t.id}/restore`, { method: "POST" })
      if (!res.ok) { toast.error("Не удалось восстановить"); return }
      toast.success("Восстановлено")
      fetchTrashed()
      if (t.kind === "questionnaire") fetchQuestionnaires()
      else fetchTemplates()
    } catch {
      toast.error("Ошибка сети")
    }
  }

  const renderMaterialsTab = (kind: CreatableType, rows: TemplateData[]) => {
    const shown = bySearch(rows)
    return (
      <TableCard>
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
      </TableCard>
    )
  }

  return (
    <SidebarProvider>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <div className="flex-1 overflow-auto bg-background min-w-0">
          <div className="pt-6 pb-6 px-4 sm:px-14">
            <div className="mb-5">
              <div className="flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-violet-600" />
                <h1 className="text-lg font-semibold">Библиотека</h1>
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">Шаблоны анкет, демонстраций, блоков и тестов</p>
            </div>

            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabKey)}>
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
                    <span className="ml-1 text-muted-foreground">({trashRows.length})</span>
                  </TabsTrigger>
                </TabsList>
                <div className="flex items-center gap-2 ml-auto flex-1 justify-end min-w-0">
                  <div className="relative flex-1 max-w-xs min-w-[160px]">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Поиск по названию..."
                      className="pl-8 h-9 text-sm"
                    />
                  </div>
                  <Button size="sm" className="gap-1.5 h-9 shrink-0" onClick={() => setCreateOpen(true)}>
                    <Plus className="h-4 w-4" />Создать шаблон
                  </Button>
                </div>
              </div>

              <TabsContent value="demos" className="mt-0">{renderMaterialsTab("demo", demoRows)}</TabsContent>
              <TabsContent value="blocks" className="mt-0">{renderMaterialsTab("block", blockRows)}</TabsContent>
              <TabsContent value="tests" className="mt-0">{renderMaterialsTab("test", testRows)}</TabsContent>

              <TabsContent value="questionnaires" className="mt-0">
                <TableCard>
                  <CardContent className="p-0">
                    {loadingQ ? (
                      <div className="flex items-center justify-center py-12 gap-2 text-muted-foreground">
                        <Loader2 className="w-4 h-4 animate-spin" />Загрузка...
                      </div>
                    ) : filteredQuestionnaires.length === 0 ? (
                      search.trim() ? (
                        <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                          <Search className="h-10 w-10 text-muted-foreground/30 mb-3" />
                          <p className="text-sm text-muted-foreground">Ничего не найдено</p>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                          <FileText className="h-10 w-10 text-muted-foreground/30 mb-3" />
                          <p className="text-sm text-muted-foreground mb-1">Нет анкет</p>
                          <p className="text-xs text-muted-foreground/70 mb-3 max-w-xs">
                            Создайте анкету — её можно будет загрузить в любую вакансию
                          </p>
                          <Button size="sm" variant="outline" onClick={startCreateAnketa}>
                            <Plus className="h-3.5 w-3.5 mr-1" />Создать первую анкету
                          </Button>
                        </div>
                      )
                    ) : (
                      <QuestionnairesTable
                        rows={filteredQuestionnaires}
                        isPlatformAdmin={isPlatformAdmin}
                        onEdit={editQuestionnaire}
                        onDuplicate={duplicateQuestionnaire}
                        onDelete={(id) => setDeleteQId(id)}
                        onAssignAll={assignAll}
                        onUnassignAll={unassignAll}
                      />
                    )}
                  </CardContent>
                </TableCard>
              </TabsContent>

              <TabsContent value="trash" className="mt-0">
                <TableCard>
                  <CardContent className="p-0">
                    {trashRows.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                        <Trash2 className="h-10 w-10 text-muted-foreground/30 mb-3" />
                        <p className="text-sm text-muted-foreground">Корзина пуста</p>
                        <p className="text-xs text-muted-foreground/70 mt-1">
                          Удалённые шаблоны хранятся здесь и удаляются навсегда через {retentionDays} дн.
                        </p>
                      </div>
                    ) : (
                      <TrashTable
                        rows={trashRows}
                        retentionDays={retentionDays}
                        onRestore={handleRestore}
                        onPermanent={(t) => setPermanentTarget(t)}
                      />
                    )}
                  </CardContent>
                </TableCard>
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
            <button
              type="button"
              onClick={startCreateAnketa}
              className="w-full flex items-start gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:border-primary/50 hover:bg-muted/50"
            >
              <FileText className="h-5 w-5 mt-0.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="text-sm font-semibold">Анкета</p>
                <p className="text-xs text-muted-foreground">Набор вопросов для вакансии</p>
              </div>
            </button>
            {(["demo", "test", "block"] as CreatableType[]).map((kind) => {
              const Icon = CREATE_ICON[kind]
              return (
                <button
                  key={kind}
                  type="button"
                  onClick={() => startCreate(kind)}
                  className="w-full flex items-start gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:border-primary/50 hover:bg-muted/50"
                >
                  <Icon className="h-5 w-5 mt-0.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{DIALOG_TITLE[kind]}</p>
                    <p className="text-xs text-muted-foreground">{TYPE_COPY[kind].dialogDesc}</p>
                  </div>
                </button>
              )
            })}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete material confirmation */}
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

      {/* Delete questionnaire confirmation */}
      <Dialog open={!!deleteQId} onOpenChange={(open) => { if (!open) setDeleteQId(null) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Удалить анкету?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            Удалить анкету «{questionnaires.find(q => q.id === deleteQId)?.name ?? ""}»? Она будет перемещена в корзину
            и автоматически удалена через {retentionDays} дн.
          </p>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" size="sm" onClick={() => setDeleteQId(null)}>Отмена</Button>
            <Button variant="destructive" size="sm" onClick={handleDeleteQuestionnaire} disabled={deleting}>
              {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
              Удалить
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Permanent delete (из корзины) */}
      <PermanentDeleteDialog
        target={permanentTarget}
        open={!!permanentTarget}
        onOpenChange={(o) => { if (!o) setPermanentTarget(null) }}
        onDeleted={() => { setPermanentTarget(null); fetchTrashed() }}
      />
    </SidebarProvider>
  )
}
