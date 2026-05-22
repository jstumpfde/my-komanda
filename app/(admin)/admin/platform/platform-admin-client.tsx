"use client"

import { useEffect, useState, useTransition } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  actionRunMigrations,
  actionKillAllChatbots,
  actionRestoreAllChatbots,
  actionAddGlobalStopWord,
  actionRegenerateAiPrompts,
  actionMineTemplateFromVacancy,
  actionUpdatePlatformTemplate,
  actionDeletePlatformTemplate,
} from "./actions"
import {
  AlertTriangle, Loader2, ShieldAlert, LibraryBig, Plus, Pencil, Trash2,
} from "lucide-react"
import {
  Select as SelectPrimitive,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"

interface MigrationItem {
  id: string
  description: string
  appliedAt: string | null
  affectedCount: number
}

interface CompanyItem {
  id: string
  name: string
  createdAt: string | null
  aiChatbotKilled: boolean
  vacanciesCount: number
  aiEnabledCount: number
}

interface VacancyItem {
  id: string
  title: string
  status: string | null
  companyId: string
  companyName: string
  aiChatbotEnabled: boolean
  promptLength: number
}

interface ActionItem {
  id: string
  actionType: string
  payload: unknown
  result: unknown
  executedAt: string | null
  executedBy: string | null
}

interface TemplateItem {
  id: string
  name: string
  description: string | null
  industry: string | null
  sourceVacancyId: string | null
  sourceCompanyId: string | null
  isPublished: boolean
  createdAt: string | null
}

interface MinableVacancy {
  id: string
  title: string
  companyId: string
  companyName: string
}

interface Props {
  migrations: MigrationItem[]
  companies: CompanyItem[]
  companiesTotal: number
  vacancies: VacancyItem[]
  recentActions: ActionItem[]
  templates: TemplateItem[]
  minableVacancies: MinableVacancy[]
}

const INDUSTRY_OPTIONS = [
  "Салоны красоты",
  "Медицина",
  "IT",
  "Общепит",
  "Торговля",
  "Производство",
  "Логистика",
  "Финансы",
  "Образование",
  "Другое",
] as const

function fmtDate(s: string | null): string {
  if (!s) return "—"
  try {
    return new Date(s).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })
  } catch {
    return s
  }
}

export function PlatformAdminClient({
  migrations,
  companies,
  companiesTotal,
  vacancies,
  recentActions,
  templates,
  minableVacancies,
}: Props) {
  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ShieldAlert className="w-6 h-6 text-red-500" />
          Platform Admin
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Скрытый раздел. Действия затрагивают ВСЕ компании платформы.
        </p>
      </div>

      <Tabs defaultValue="migrations">
        <TabsList>
          <TabsTrigger value="migrations">Migrations</TabsTrigger>
          <TabsTrigger value="companies">Companies ({companiesTotal})</TabsTrigger>
          <TabsTrigger value="vacancies">AI vacancies ({vacancies.length})</TabsTrigger>
          <TabsTrigger value="templates">Templates ({templates.length})</TabsTrigger>
          <TabsTrigger value="emergency" className="text-red-600">Emergency</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="migrations" className="mt-4">
          <MigrationsTab items={migrations} />
        </TabsContent>
        <TabsContent value="companies" className="mt-4">
          <CompaniesTab items={companies} />
        </TabsContent>
        <TabsContent value="vacancies" className="mt-4">
          <VacanciesTab items={vacancies} />
        </TabsContent>
        <TabsContent value="templates" className="mt-4">
          <TemplatesTab items={templates} minableVacancies={minableVacancies} />
        </TabsContent>
        <TabsContent value="emergency" className="mt-4">
          <EmergencyTab />
        </TabsContent>
        <TabsContent value="logs" className="mt-4">
          <LogsTab items={recentActions} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ─── Migrations ──────────────────────────────────────────────────────────────

function MigrationsTab({ items }: { items: MigrationItem[] }) {
  const [pending, startTransition] = useTransition()
  const [report, setReport] = useState<{ applied: string[]; skipped: string[]; failed: { id: string; error: string }[] } | null>(null)
  const pendingCount = items.filter(i => !i.appliedAt).length

  function run() {
    startTransition(async () => {
      try {
        const r = await actionRunMigrations()
        setReport(r)
      } catch (e) {
        alert(e instanceof Error ? e.message : String(e))
      }
    })
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Settings migrations</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Pending: <strong>{pendingCount}</strong> / Total: {items.length}
          </p>
        </div>
        <Button onClick={run} disabled={pending || pendingCount === 0}>
          {pending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Run pending migrations
        </Button>
      </CardHeader>
      <CardContent>
        {report && (
          <div className="mb-4 p-3 rounded border bg-muted text-sm">
            <div>Applied: <strong>{report.applied.length}</strong> {report.applied.join(", ")}</div>
            <div>Skipped: <strong>{report.skipped.length}</strong></div>
            {report.failed.length > 0 && (
              <div className="text-red-600">
                Failed: {report.failed.map(f => `${f.id}: ${f.error}`).join("; ")}
              </div>
            )}
          </div>
        )}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Applied at</TableHead>
              <TableHead className="text-right">Affected</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map(m => (
              <TableRow key={m.id}>
                <TableCell className="font-mono text-xs">{m.id}</TableCell>
                <TableCell>{m.description}</TableCell>
                <TableCell className="text-xs">{fmtDate(m.appliedAt)}</TableCell>
                <TableCell className="text-right">{m.affectedCount}</TableCell>
                <TableCell>
                  {m.appliedAt
                    ? <Badge className="bg-green-100 text-green-800">applied</Badge>
                    : <Badge variant="secondary">pending</Badge>}
                </TableCell>
              </TableRow>
            ))}
            {items.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Нет миграций</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

// ─── Companies ───────────────────────────────────────────────────────────────

function CompaniesTab({ items }: { items: CompanyItem[] }) {
  const [q, setQ] = useState("")
  const filtered = q.trim()
    ? items.filter(c => c.name.toLowerCase().includes(q.toLowerCase()))
    : items

  return (
    <Card>
      <CardHeader>
        <CardTitle>Companies</CardTitle>
        <Input placeholder="Поиск по названию…" value={q} onChange={e => setQ(e.target.value)} className="max-w-sm mt-2" />
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Vacancies</TableHead>
              <TableHead className="text-right">AI enabled</TableHead>
              <TableHead>Kill switch</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map(c => (
              <TableRow key={c.id}>
                <TableCell>{c.name}</TableCell>
                <TableCell className="text-xs">{fmtDate(c.createdAt)}</TableCell>
                <TableCell className="text-right">{c.vacanciesCount}</TableCell>
                <TableCell className="text-right">{c.aiEnabledCount}</TableCell>
                <TableCell>
                  {c.aiChatbotKilled
                    ? <Badge variant="destructive">KILLED</Badge>
                    : <Badge variant="secondary">active</Badge>}
                </TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Нет совпадений</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

// ─── Vacancies ───────────────────────────────────────────────────────────────

function VacanciesTab({ items }: { items: VacancyItem[] }) {
  const [q, setQ] = useState("")
  const filtered = q.trim()
    ? items.filter(v =>
        v.title.toLowerCase().includes(q.toLowerCase()) ||
        v.companyName.toLowerCase().includes(q.toLowerCase()),
      )
    : items

  return (
    <Card>
      <CardHeader>
        <CardTitle>Active vacancies with AI chatbot</CardTitle>
        <Input placeholder="Поиск по вакансии или компании…" value={q} onChange={e => setQ(e.target.value)} className="max-w-sm mt-2" />
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vacancy</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Prompt length</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map(v => (
              <TableRow key={v.id}>
                <TableCell>{v.title}</TableCell>
                <TableCell>{v.companyName}</TableCell>
                <TableCell><Badge variant="outline">{v.status ?? "—"}</Badge></TableCell>
                <TableCell className="text-right tabular-nums">{v.promptLength}</TableCell>
              </TableRow>
            ))}
            {filtered.length === 0 && (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">Нет совпадений</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

// ─── Emergency ───────────────────────────────────────────────────────────────

type EmergencyKind = "kill" | "restore" | "add-stop" | "regenerate"

function EmergencyTab() {
  const [open, setOpen] = useState<EmergencyKind | null>(null)
  const [confirm, setConfirm] = useState("")
  const [stopWord, setStopWord] = useState("")
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<string | null>(null)

  function exec(kind: EmergencyKind) {
    setConfirm("")
    setResult(null)
    setOpen(kind)
  }

  function close() {
    setOpen(null)
    setConfirm("")
    setStopWord("")
  }

  function run() {
    if (confirm !== "CONFIRM") return
    startTransition(async () => {
      try {
        let res: { affected?: number; scheduled?: number } | null = null
        if (open === "kill") res = await actionKillAllChatbots()
        if (open === "restore") res = await actionRestoreAllChatbots()
        if (open === "add-stop") res = await actionAddGlobalStopWord(stopWord)
        if (open === "regenerate") res = await actionRegenerateAiPrompts()
        const n = res?.affected ?? res?.scheduled ?? 0
        setResult(`OK — затронуто: ${n}`)
        setTimeout(() => close(), 1500)
      } catch (e) {
        setResult("Ошибка: " + (e instanceof Error ? e.message : String(e)))
      }
    })
  }

  return (
    <>
      <Card className="border-red-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-700">
            <AlertTriangle className="w-5 h-5" /> Emergency broadcast
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Каждое действие затрагивает ВСЕ компании. Требуется ввод «CONFIRM».
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button variant="destructive" className="w-full justify-start" onClick={() => exec("kill")}>
            🚨 Kill all AI chatbots
          </Button>
          <Button variant="outline" className="w-full justify-start" onClick={() => exec("restore")}>
            ↩ Restore all AI chatbots
          </Button>
          <Button variant="outline" className="w-full justify-start" onClick={() => exec("add-stop")}>
            ➕ Add global stop word
          </Button>
          <Button variant="outline" className="w-full justify-start" onClick={() => exec("regenerate")}>
            🔄 Force regenerate all AI prompts
          </Button>
        </CardContent>
      </Card>

      <Dialog open={open !== null} onOpenChange={(o) => !o && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700">
              <AlertTriangle className="w-5 h-5" /> Подтверждение
            </DialogTitle>
            <DialogDescription>
              Это действие затронет <strong>ВСЕ</strong> компании платформы.
              Введите <code className="font-mono">CONFIRM</code> для продолжения.
            </DialogDescription>
          </DialogHeader>

          {open === "add-stop" && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Стоп-слово</label>
              <Input
                placeholder="например, «не интересно»"
                value={stopWord}
                onChange={e => setStopWord(e.target.value)}
              />
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium">Введите «CONFIRM»</label>
            <Input
              autoFocus
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="CONFIRM"
            />
          </div>

          {result && (
            <div className={"text-sm p-2 rounded " + (result.startsWith("OK") ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800")}>
              {result}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={close} disabled={pending}>Отмена</Button>
            <Button
              variant="destructive"
              onClick={run}
              disabled={pending || confirm !== "CONFIRM" || (open === "add-stop" && !stopWord.trim())}
            >
              {pending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Выполнить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ─── Group 16: Templates ─────────────────────────────────────────────────────

function TemplatesTab({
  items, minableVacancies,
}: {
  items: TemplateItem[]
  minableVacancies: MinableVacancy[]
}) {
  const [mineOpen, setMineOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const editing = items.find(t => t.id === editingId) ?? null

  const onDelete = (id: string) => {
    if (!confirm("Удалить шаблон?")) return
    startTransition(async () => {
      try {
        await actionDeletePlatformTemplate(id)
      } catch (e) {
        alert(e instanceof Error ? e.message : String(e))
      }
    })
  }

  const onTogglePublish = (item: TemplateItem) => {
    startTransition(async () => {
      try {
        await actionUpdatePlatformTemplate(item.id, { isPublished: !item.isPublished })
      } catch (e) {
        alert(e instanceof Error ? e.message : String(e))
      }
    })
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <LibraryBig className="w-5 h-5" />
              Platform funnel templates
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Шаблоны воронки, доступные всем компаниям (при is_published=true).
            </p>
          </div>
          <Button onClick={() => setMineOpen(true)} disabled={minableVacancies.length === 0}>
            <Plus className="w-4 h-4 mr-2" />
            Создать шаблон из вакансии
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Industry</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Published</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map(t => (
                <TableRow key={t.id}>
                  <TableCell>
                    <div className="font-medium">{t.name}</div>
                    {t.description && (
                      <div className="text-xs text-muted-foreground line-clamp-1">{t.description}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    {t.industry ? <Badge variant="outline">{t.industry}</Badge> : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-xs font-mono text-muted-foreground">
                    {t.sourceVacancyId ? t.sourceVacancyId.slice(0, 8) : "manual"}
                  </TableCell>
                  <TableCell className="text-xs">{fmtDate(t.createdAt)}</TableCell>
                  <TableCell>
                    <Switch
                      checked={t.isPublished}
                      onCheckedChange={() => onTogglePublish(t)}
                      disabled={pending}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => setEditingId(t.id)} disabled={pending}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => onDelete(t.id)} disabled={pending}>
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-6">
                    Платформенных шаблонов пока нет. Создайте первый из существующей вакансии.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <MineTemplateDialog
        open={mineOpen}
        onOpenChange={setMineOpen}
        minableVacancies={minableVacancies}
      />

      <EditTemplateDialog
        template={editing}
        onClose={() => setEditingId(null)}
      />
    </>
  )
}

function MineTemplateDialog({
  open, onOpenChange, minableVacancies,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  minableVacancies: MinableVacancy[]
}) {
  const [vacancyId, setVacancyId] = useState("")
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [industry, setIndustry] = useState<string>("")
  const [isPublished, setIsPublished] = useState(true)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setVacancyId(""); setName(""); setDescription(""); setIndustry(""); setIsPublished(true); setError(null)
  }

  function submit() {
    setError(null)
    if (!vacancyId) { setError("Выберите вакансию"); return }
    if (!name.trim()) { setError("Введите название шаблона"); return }
    startTransition(async () => {
      try {
        await actionMineTemplateFromVacancy({
          sourceVacancyId: vacancyId,
          name:            name.trim(),
          description:     description.trim() || null,
          industry:        industry || null,
          isPublished,
        })
        reset()
        onOpenChange(false)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o) }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Создать шаблон из вакансии</DialogTitle>
          <DialogDescription>
            Скопирует funnel_config_json выбранной вакансии в новый платформенный шаблон.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Вакансия-источник</Label>
            <SelectPrimitive value={vacancyId} onValueChange={setVacancyId}>
              <SelectTrigger>
                <SelectValue placeholder="Выберите вакансию..." />
              </SelectTrigger>
              <SelectContent className="max-h-[300px]">
                {minableVacancies.map(v => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.title} <span className="text-muted-foreground">— {v.companyName}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </SelectPrimitive>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Название шаблона</Label>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="напр. «Для салонов красоты»"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Отрасль</Label>
            <SelectPrimitive value={industry} onValueChange={setIndustry}>
              <SelectTrigger>
                <SelectValue placeholder="Выберите отрасль..." />
              </SelectTrigger>
              <SelectContent>
                {INDUSTRY_OPTIONS.map(opt => (
                  <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                ))}
              </SelectContent>
            </SelectPrimitive>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Описание</Label>
            <Textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Что это за шаблон и кому подойдёт"
              rows={3}
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="text-sm">
              <div className="font-medium">Опубликовать</div>
              <div className="text-muted-foreground text-xs">
                Шаблон станет виден всем компаниям
              </div>
            </div>
            <Switch checked={isPublished} onCheckedChange={setIsPublished} />
          </div>

          {error && (
            <div className="text-sm text-destructive">{error}</div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onOpenChange(false) }} disabled={pending}>
            Отмена
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Создать
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EditTemplateDialog({
  template, onClose,
}: {
  template: TemplateItem | null
  onClose: () => void
}) {
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [industry, setIndustry] = useState<string>("")
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Сбросить форму когда открываем для нового шаблона.
  useEffect(() => {
    setName(template?.name ?? "")
    setDescription(template?.description ?? "")
    setIndustry(template?.industry ?? "")
    setError(null)
  }, [template?.id])

  if (!template) return null

  function submit() {
    if (!template) return
    setError(null)
    if (!name.trim()) { setError("Название не может быть пустым"); return }
    startTransition(async () => {
      try {
        await actionUpdatePlatformTemplate(template.id, {
          name:        name.trim(),
          description: description.trim() || null,
          industry:    industry || null,
        })
        onClose()
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      }
    })
  }

  return (
    <Dialog open={true} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Редактировать шаблон</DialogTitle>
          <DialogDescription>
            Конфигурация воронки шаблона не меняется через UI — только метаданные.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Название</Label>
            <Input value={name} onChange={e => setName(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Отрасль</Label>
            <SelectPrimitive value={industry} onValueChange={setIndustry}>
              <SelectTrigger>
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                {INDUSTRY_OPTIONS.map(opt => (
                  <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                ))}
              </SelectContent>
            </SelectPrimitive>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Описание</Label>
            <Textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          {error && <div className="text-sm text-destructive">{error}</div>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>Отмена</Button>
          <Button onClick={submit} disabled={pending}>
            {pending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Сохранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Logs ────────────────────────────────────────────────────────────────────

function LogsTab({ items }: { items: ActionItem[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Emergency actions log (последние 50)</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>By</TableHead>
              <TableHead>Payload</TableHead>
              <TableHead>Result</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map(a => (
              <TableRow key={a.id}>
                <TableCell className="text-xs whitespace-nowrap">{fmtDate(a.executedAt)}</TableCell>
                <TableCell><Badge variant="outline">{a.actionType}</Badge></TableCell>
                <TableCell className="text-xs">{a.executedBy ?? "—"}</TableCell>
                <TableCell className="font-mono text-xs">{a.payload ? JSON.stringify(a.payload) : "—"}</TableCell>
                <TableCell className="font-mono text-xs">{a.result ? JSON.stringify(a.result) : "—"}</TableCell>
              </TableRow>
            ))}
            {items.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Действий пока нет</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
