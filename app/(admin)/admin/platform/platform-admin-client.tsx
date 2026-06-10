"use client"

import { useEffect, useState, useTransition } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PresenceTab } from "./presence-tab"
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
  actionGetYuliaConversation,
  actionUpdatePlatformBranding,
  actionUpdatePlatformFavicon,
  actionUpdatePublicSeoDefaults,
} from "./actions"
import {
  AlertTriangle, Bot, Loader2, ShieldAlert, LibraryBig, Plus, Pencil, Trash2,
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

interface YuliaConvItem {
  id: string
  contextType: string
  status: string
  resultingEntityId: string | null
  createdAt: string | null
  updatedAt: string | null
  userEmail: string | null
  userName: string | null
  companyName: string | null
  messageCount: number
}

interface YuliaProps {
  metrics: {
    total:       number
    active:      number
    completed:   number
    abandoned:   number
    avgMessages: number
  }
  systemPrompt: string
  conversations: YuliaConvItem[]
}

interface CronRunItem {
  id: string
  cronName: string
  startedAt: string | null
  finishedAt: string | null
  status: string
  durationMs: number | null
  errorMessage: string | null
  metadata: unknown
}

interface BrandingProps {
  title:       string
  description: string
  ogImage:     string | null
  favicon: {
    light: string
    dark:  string
    svg:   string
    apple: string
  }
  publicSeo: {
    ogImage:               string | null
    careersTitleSuffix:    string
    vacancyTitleTemplate:  string
  }
}

interface Props {
  cronRuns: CronRunItem[]
  migrations: MigrationItem[]
  companies: CompanyItem[]
  companiesTotal: number
  vacancies: VacancyItem[]
  recentActions: ActionItem[]
  templates: TemplateItem[]
  minableVacancies: MinableVacancy[]
  yulia: YuliaProps
  branding: BrandingProps
  // defaultTab позволяет подстраницам /admin/platform/{section} открывать нужный таб сразу.
  defaultTab?: string
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
  cronRuns,
  migrations,
  companies,
  companiesTotal,
  vacancies,
  recentActions,
  templates,
  minableVacancies,
  yulia,
  branding,
  defaultTab = "companies",
}: Props) {
  return (
    <div className="p-6 max-w-7xl">
      <Tabs defaultValue={defaultTab}>
        <TabsList>
          <TabsTrigger value="presence">Присутствие</TabsTrigger>
          <TabsTrigger value="migrations">Migrations</TabsTrigger>
          <TabsTrigger value="companies">Companies ({companiesTotal})</TabsTrigger>
          <TabsTrigger value="vacancies">AI vacancies ({vacancies.length})</TabsTrigger>
          <TabsTrigger value="templates">Templates ({templates.length})</TabsTrigger>
          <TabsTrigger value="yulia">Yulia ({yulia.metrics.total})</TabsTrigger>
          <TabsTrigger value="cron">Cron</TabsTrigger>
          <TabsTrigger value="deadlines">Сроки</TabsTrigger>
          <TabsTrigger value="branding">Брендинг и SEO</TabsTrigger>
          <TabsTrigger value="emergency" className="text-red-600">Emergency</TabsTrigger>
          <TabsTrigger value="logs">Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="presence" className="mt-4">
          <PresenceTab />
        </TabsContent>
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
        <TabsContent value="yulia" className="mt-4">
          <YuliaTab data={yulia} />
        </TabsContent>
        <TabsContent value="cron" className="mt-4">
          <CronTab items={cronRuns} />
        </TabsContent>
        <TabsContent value="deadlines" className="mt-4">
          <DeadlinesTab />
        </TabsContent>
        <TabsContent value="branding" className="mt-4">
          <BrandingTab data={branding} />
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

// ─── Сроки / инфраструктура (серты, hh-токены, кроны) ────────────────────────

interface DeadlinesData {
  checkedAt: string
  certs: { name: string; host: string; validTo: string | null; daysLeft: number | null; error?: string }[]
  hhTokens: { company: string; employerName: string | null; expiresAt: string | null; daysLeft: number | null; isActive: boolean; lastSyncedAt: string | null }[]
  crons: { name: string; lastRun: string; status: string; error: string | null }[]
  backups: { note: string }
}

function dateRu(s: string | null): string {
  if (!s) return "—"
  const t = Date.parse(s)
  if (Number.isNaN(t)) return s
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(t))
}
function daysBadge(days: number | null): { cls: string; text: string } {
  if (days == null) return { cls: "bg-muted text-muted-foreground border-border", text: "—" }
  if (days < 0) return { cls: "bg-red-500/10 text-red-700 border-red-200", text: `истёк ${-days} дн. назад` }
  if (days <= 14) return { cls: "bg-red-500/10 text-red-700 border-red-200", text: `${days} дн.` }
  if (days <= 30) return { cls: "bg-amber-500/10 text-amber-700 border-amber-200", text: `${days} дн.` }
  return { cls: "bg-emerald-500/10 text-emerald-700 border-emerald-200", text: `${days} дн.` }
}

function DeadlinesTab() {
  const [data, setData] = useState<DeadlinesData | null>(null)
  const [loading, setLoading] = useState(true)
  const load = () => {
    setLoading(true)
    fetch("/api/platform/deadlines").then(r => r.ok ? r.json() : null).then(j => setData(j)).catch(() => setData(null)).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Сроки и здоровье инфраструктуры. {data?.checkedAt ? `Проверено: ${dateRu(data.checkedAt)}.` : ""}
        </p>
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>{loading ? "Проверяю…" : "↻ Обновить"}</Button>
      </div>

      {/* TLS-серты */}
      <Card>
        <CardHeader><CardTitle className="text-base">TLS-сертификаты</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Что</TableHead><TableHead>Хост</TableHead><TableHead>Истекает</TableHead><TableHead>Осталось</TableHead></TableRow></TableHeader>
            <TableBody>
              {(data?.certs ?? []).map((c) => {
                const b = daysBadge(c.daysLeft)
                return (
                  <TableRow key={c.host}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="font-mono text-xs">{c.host}</TableCell>
                    <TableCell>{c.error ? <span className="text-red-600 text-xs">ошибка: {c.error}</span> : dateRu(c.validTo)}</TableCell>
                    <TableCell><Badge variant="outline" className={b.cls}>{b.text}</Badge></TableCell>
                  </TableRow>
                )
              })}
              {!loading && (data?.certs?.length ?? 0) === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Нет данных</TableCell></TableRow>}
            </TableBody>
          </Table>
          <p className="text-[11px] text-muted-foreground mt-2">Продление wildcard *.company24.pro — вручную через Timeweb (DNS-01). Авто-обновление здесь не делаем — только мониторинг срока.</p>
        </CardContent>
      </Card>

      {/* hh-токены */}
      <Card>
        <CardHeader><CardTitle className="text-base">hh.ru — токены компаний</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Компания</TableHead><TableHead>Работодатель hh</TableHead><TableHead>Токен истекает</TableHead><TableHead>Осталось</TableHead><TableHead>Активна</TableHead></TableRow></TableHeader>
            <TableBody>
              {(data?.hhTokens ?? []).map((h, i) => {
                const b = daysBadge(h.daysLeft)
                return (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{h.company}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{h.employerName ?? "—"}</TableCell>
                    <TableCell>{dateRu(h.expiresAt)}</TableCell>
                    <TableCell><Badge variant="outline" className={b.cls}>{b.text}</Badge></TableCell>
                    <TableCell>{h.isActive ? <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 border-emerald-200">да</Badge> : <Badge variant="outline" className="bg-muted text-muted-foreground">нет</Badge>}</TableCell>
                  </TableRow>
                )
              })}
              {!loading && (data?.hhTokens?.length ?? 0) === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">Нет подключённых hh-интеграций</TableCell></TableRow>}
            </TableBody>
          </Table>
          <p className="text-[11px] text-muted-foreground mt-2">hh-токены обновляются автоматически (cron hh-token-refresh) — здесь видно срок и активность.</p>
        </CardContent>
      </Card>

      {/* Кроны */}
      <Card>
        <CardHeader><CardTitle className="text-base">Кроны — последний запуск</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>Крон</TableHead><TableHead>Последний запуск</TableHead><TableHead>Статус</TableHead></TableRow></TableHeader>
            <TableBody>
              {(data?.crons ?? []).map((c) => (
                <TableRow key={c.name}>
                  <TableCell className="font-mono text-xs">{c.name}</TableCell>
                  <TableCell>{dateRu(c.lastRun)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={c.status === "ok" ? "bg-emerald-500/10 text-emerald-700 border-emerald-200" : c.status === "error" ? "bg-red-500/10 text-red-700 border-red-200" : "bg-amber-500/10 text-amber-700 border-amber-200"}>{c.status}</Badge>
                    {c.error && <span className="text-[11px] text-red-600 ml-2">{c.error}</span>}
                  </TableCell>
                </TableRow>
              ))}
              {!loading && (data?.crons?.length ?? 0) === 0 && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-6">Нет запусков кронов в логе</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Бэкапы */}
      <Card>
        <CardHeader><CardTitle className="text-base">Бэкапы</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-muted-foreground">{data?.backups?.note ?? "—"}</p></CardContent>
      </Card>
    </div>
  )
}

function CronTab({ items }: { items: CronRunItem[] }) {
  const statusColor = (s: string) =>
    s === "ok"      ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800" :
    s === "error"   ? "bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800" :
    s === "running" ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800" :
                      "bg-muted text-muted-foreground border-border"
  return (
    <Card>
      <CardHeader>
        <CardTitle>Запуски cron (последние 50)</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cron</TableHead>
              <TableHead>Старт</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead>Длит.</TableHead>
              <TableHead>Результат</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map(r => (
              <TableRow key={r.id}>
                <TableCell className="font-medium text-xs whitespace-nowrap">{r.cronName}</TableCell>
                <TableCell className="text-xs whitespace-nowrap">{fmtDate(r.startedAt)}</TableCell>
                <TableCell><Badge variant="outline" className={statusColor(r.status)}>{r.status}</Badge></TableCell>
                <TableCell className="text-xs whitespace-nowrap">{r.durationMs != null ? `${(r.durationMs / 1000).toFixed(1)}с` : "—"}</TableCell>
                <TableCell className="font-mono text-xs">
                  {r.errorMessage
                    ? <span className="text-red-600 dark:text-red-400">{r.errorMessage}</span>
                    : (r.metadata ? JSON.stringify(r.metadata) : "—")}
                </TableCell>
              </TableRow>
            ))}
            {items.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">Запусков пока нет</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

// ─── Группа 28: Yulia ─────────────────────────────────────────────────────────

interface YuliaMessageView {
  id:             string
  role:           string
  content:        string
  pending_action: unknown
  action_status:  string | null
  created_at:     string | null
}

function statusBadge(status: string) {
  const cls =
    status === "completed" ? "bg-green-100 text-green-800"
    : status === "active"    ? "bg-blue-100 text-blue-800"
    : "bg-gray-100 text-gray-700"
  return <Badge className={cls}>{status}</Badge>
}

function YuliaTab({ data }: { data: YuliaProps }) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [messages, setMessages] = useState<YuliaMessageView[]>([])
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [showPrompt, setShowPrompt] = useState(false)

  useEffect(() => {
    if (!selectedId) return
    let cancelled = false
    setLoadingMsgs(true)
    setMessages([])
    actionGetYuliaConversation(selectedId)
      .then(res => { if (!cancelled) setMessages(res.messages as YuliaMessageView[]) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoadingMsgs(false) })
    return () => { cancelled = true }
  }, [selectedId])

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <MetricCard label="Всего диалогов"  value={data.metrics.total} />
        <MetricCard label="Активных"        value={data.metrics.active} />
        <MetricCard label="Завершено"       value={data.metrics.completed} accent="green" />
        <MetricCard label="Брошено"         value={data.metrics.abandoned} accent="gray" />
        <MetricCard label="Ср. сообщений"   value={data.metrics.avgMessages} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bot className="w-4 h-4" />
            Последние 30 диалогов
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Дата</TableHead>
                <TableHead>Юзер</TableHead>
                <TableHead>Компания</TableHead>
                <TableHead>Контекст</TableHead>
                <TableHead>Статус</TableHead>
                <TableHead className="text-right">Сообщений</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.conversations.map(c => (
                <TableRow key={c.id}>
                  <TableCell className="text-xs">{fmtDate(c.updatedAt)}</TableCell>
                  <TableCell className="text-xs">{c.userName ?? c.userEmail ?? "—"}</TableCell>
                  <TableCell className="text-xs">{c.companyName ?? "—"}</TableCell>
                  <TableCell className="text-xs">{c.contextType}</TableCell>
                  <TableCell>{statusBadge(c.status)}</TableCell>
                  <TableCell className="text-right text-xs">{c.messageCount}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => setSelectedId(c.id)}>
                      Открыть
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {data.conversations.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    Диалогов пока нет
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            <span>Системный промпт</span>
            <Button size="sm" variant="ghost" onClick={() => setShowPrompt(p => !p)}>
              {showPrompt ? "Скрыть" : "Показать"}
            </Button>
          </CardTitle>
        </CardHeader>
        {showPrompt && (
          <CardContent>
            <pre className="text-xs whitespace-pre-wrap bg-muted/40 p-3 rounded-md max-h-96 overflow-auto">
              {data.systemPrompt}
            </pre>
          </CardContent>
        )}
      </Card>

      <Dialog open={!!selectedId} onOpenChange={(v) => !v && setSelectedId(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Диалог Юлии</DialogTitle>
            <DialogDescription className="text-xs">
              ID: {selectedId}
            </DialogDescription>
          </DialogHeader>
          {loadingMsgs ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-2">
              {messages.map(m => (
                <div
                  key={m.id}
                  className={
                    m.role === "user"
                      ? "ml-12 bg-primary/10 rounded-lg p-3 text-sm"
                      : "mr-12 bg-muted rounded-lg p-3 text-sm"
                  }
                >
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">
                    {m.role}{m.action_status ? ` · action ${m.action_status}` : ""}
                  </div>
                  <div className="whitespace-pre-wrap">{m.content}</div>
                  {m.pending_action ? (
                    <pre className="mt-2 text-[10px] bg-background/60 rounded p-2 overflow-auto">
                      {JSON.stringify(m.pending_action, null, 2)}
                    </pre>
                  ) : null}
                </div>
              ))}
              {messages.length === 0 && (
                <div className="text-center text-muted-foreground text-sm py-6">
                  Сообщений нет
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function MetricCard({
  label,
  value,
  accent,
}: {
  label:   string
  value:   number
  accent?: "green" | "gray"
}) {
  const valueCls =
    accent === "green" ? "text-green-600"
    : accent === "gray"  ? "text-muted-foreground"
    : "text-foreground"
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-bold ${valueCls}`}>{value}</div>
    </div>
  )
}

// ─── Брендинг и SEO ───────────────────────────────────────────────────────────

function BrandingTab({ data }: { data: BrandingProps }) {
  // Секция 1: описание сайта
  const [title, setTitle]           = useState(data.title)
  const [description, setDescription] = useState(data.description)
  const [ogImage, setOgImage]       = useState(data.ogImage ?? "")
  const [brandingPending, startBrandingTransition] = useTransition()
  const [brandingMsg, setBrandingMsg] = useState<string | null>(null)

  // Секция 2: фавикон
  const [faviconUrls, setFaviconUrls] = useState(data.favicon)
  const [faviconUploading, setFaviconUploading] = useState<Record<string, boolean>>({})
  const [faviconMsg, setFaviconMsg]   = useState<string | null>(null)
  const [faviconPending, startFaviconTransition] = useTransition()

  // Секция 3: SEO публичных страниц
  const [seoOgImage, setSeoOgImage]                   = useState(data.publicSeo.ogImage ?? "")
  const [careersSuffix, setCareersSuffix]             = useState(data.publicSeo.careersTitleSuffix)
  const [vacancyTemplate, setVacancyTemplate]         = useState(data.publicSeo.vacancyTitleTemplate)
  const [seoPending, startSeoTransition]               = useTransition()
  const [seoMsg, setSeoMsg]                            = useState<string | null>(null)

  // ─ Загрузка файла фавикона ──────────────────────────────────────────────────
  async function uploadFaviconFile(slot: string, file: File) {
    setFaviconUploading(prev => ({ ...prev, [slot]: true }))
    setFaviconMsg(null)
    try {
      const fd = new FormData()
      fd.append("file", file)
      fd.append("slot", slot)
      const res = await fetch("/api/admin/platform/favicon", { method: "POST", body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Ошибка загрузки")
      setFaviconUrls(prev => ({ ...prev, [slot]: json.url }))
      setFaviconMsg(`Иконка «${slot}» загружена`)
    } catch (e) {
      setFaviconMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setFaviconUploading(prev => ({ ...prev, [slot]: false }))
    }
  }

  // ─ Сохранение фавикона в БД ─────────────────────────────────────────────────
  function saveFavicon() {
    startFaviconTransition(async () => {
      try {
        await actionUpdatePlatformFavicon(faviconUrls)
        setFaviconMsg("Иконки сохранены")
      } catch (e) {
        setFaviconMsg(e instanceof Error ? e.message : String(e))
      }
    })
  }

  function resetFavicon() {
    startFaviconTransition(async () => {
      try {
        await actionUpdatePlatformFavicon({ light: "", dark: "", svg: "", apple: "" })
        setFaviconUrls({ light: "/icon-light-32x32.png", dark: "/icon-dark-32x32.png", svg: "/icon.svg", apple: "/apple-icon.png" })
        setFaviconMsg("Иконки сброшены к дефолту")
      } catch (e) {
        setFaviconMsg(e instanceof Error ? e.message : String(e))
      }
    })
  }

  // ─ Сохранение описания ───────────────────────────────────────────────────────
  function saveBranding() {
    startBrandingTransition(async () => {
      try {
        await actionUpdatePlatformBranding({
          title: title.trim(),
          description: description.trim(),
          ogImage: ogImage.trim() || null,
        })
        setBrandingMsg("Сохранено")
      } catch (e) {
        setBrandingMsg(e instanceof Error ? e.message : String(e))
      }
    })
  }

  // ─ Сохранение SEO-дефолтов ───────────────────────────────────────────────────
  function saveSeo() {
    startSeoTransition(async () => {
      try {
        await actionUpdatePublicSeoDefaults({
          ogImage:              seoOgImage.trim() || null,
          careersTitleSuffix:   careersSuffix.trim(),
          vacancyTitleTemplate: vacancyTemplate.trim(),
        })
        setSeoMsg("Сохранено")
      } catch (e) {
        setSeoMsg(e instanceof Error ? e.message : String(e))
      }
    })
  }

  const FAVICON_SLOTS: { slot: "light" | "dark" | "svg" | "apple"; label: string; hint: string }[] = [
    { slot: "light", label: "Светлая тема (32×32 PNG)",  hint: "PNG, ICO, SVG, макс 512 КБ" },
    { slot: "dark",  label: "Тёмная тема (32×32 PNG)",   hint: "PNG, ICO, SVG, макс 512 КБ" },
    { slot: "svg",   label: "SVG иконка",                hint: "SVG, макс 512 КБ" },
    { slot: "apple", label: "Apple Touch Icon (PNG)",     hint: "PNG, макс 512 КБ" },
  ]

  return (
    <div className="space-y-6">

      {/* ── Секция: Иконка сайта ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Иконка сайта (фавикон)</CardTitle>
          <p className="text-sm text-muted-foreground">
            Загрузите иконки для разных режимов. После загрузки нажмите «Сохранить».
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {FAVICON_SLOTS.map(({ slot, label, hint }) => (
              <div key={slot} className="space-y-2 rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">{label}</Label>
                  {faviconUrls[slot] && (
                    <img
                      src={faviconUrls[slot]}
                      alt={slot}
                      className="w-7 h-7 rounded object-contain border bg-muted"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none" }}
                    />
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    value={faviconUrls[slot]}
                    onChange={e => setFaviconUrls(prev => ({ ...prev, [slot]: e.target.value }))}
                    placeholder="/uploads/platform/favicon-light.png"
                    className="text-xs"
                  />
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      accept=".png,.svg,.ico,image/png,image/svg+xml,image/x-icon"
                      className="hidden"
                      disabled={faviconUploading[slot]}
                      onChange={async e => {
                        const file = e.target.files?.[0]
                        if (file) await uploadFaviconFile(slot, file)
                        e.target.value = ""
                      }}
                    />
                    <Button size="sm" variant="outline" asChild disabled={faviconUploading[slot]}>
                      <span>
                        {faviconUploading[slot]
                          ? <Loader2 className="w-3 h-3 animate-spin" />
                          : "Загрузить"}
                      </span>
                    </Button>
                  </label>
                </div>
                <p className="text-[11px] text-muted-foreground">{hint}</p>
              </div>
            ))}
          </div>

          {faviconMsg && (
            <p className={`text-sm ${faviconMsg.startsWith("Ошибка") || faviconMsg.includes("Ошибка") ? "text-destructive" : "text-green-600"}`}>
              {faviconMsg}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <Button onClick={saveFavicon} disabled={faviconPending}>
              {faviconPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Сохранить иконки
            </Button>
            <Button variant="outline" onClick={resetFavicon} disabled={faviconPending}>
              Сбросить к дефолту
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Секция: Описание сайта ───────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Описание сайта</CardTitle>
          <p className="text-sm text-muted-foreground">
            Title и description отображаются во вкладке браузера и в результатах поиска.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Заголовок сайта (title)</Label>
              <span className={`text-xs ${title.length > 60 ? "text-amber-600" : "text-muted-foreground"}`}>
                {title.length}/60
              </span>
            </div>
            <Input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Company24 — HR Рекрутинговая платформа"
              maxLength={200}
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Описание (meta description)</Label>
              <span className={`text-xs ${description.length > 160 ? "text-amber-600" : "text-muted-foreground"}`}>
                {description.length}/160
              </span>
            </div>
            <Textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Современная платформа для управления процессом найма"
              rows={3}
              maxLength={500}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">OG-картинка (URL)</Label>
            <Input
              value={ogImage}
              onChange={e => setOgImage(e.target.value)}
              placeholder="https://company24.pro/og-image.png"
            />
            <p className="text-[11px] text-muted-foreground">
              Используется при шаринге в соцсетях. Оставьте пустым, чтобы не задавать OG-тег.
            </p>
          </div>

          {/* Превью сниппета */}
          <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide font-medium">Превью в поиске</p>
            <p className="text-sm font-medium text-blue-600 truncate">{title || "Заголовок сайта"}</p>
            <p className="text-xs text-green-700">https://company24.pro</p>
            <p className="text-xs text-muted-foreground line-clamp-2">{description || "Описание сайта..."}</p>
          </div>

          {brandingMsg && (
            <p className={`text-sm ${brandingMsg === "Сохранено" ? "text-green-600" : "text-destructive"}`}>
              {brandingMsg}
            </p>
          )}

          <Button onClick={saveBranding} disabled={brandingPending}>
            {brandingPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Сохранить описание
          </Button>
        </CardContent>
      </Card>

      {/* ── Секция: SEO публичных страниц ────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">SEO публичных страниц</CardTitle>
          <p className="text-sm text-muted-foreground">
            Настройки для карьерных страниц компаний и страниц вакансий.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Дефолтная OG-картинка (URL)</Label>
            <Input
              value={seoOgImage}
              onChange={e => setSeoOgImage(e.target.value)}
              placeholder="https://company24.pro/og-careers.png"
            />
            <p className="text-[11px] text-muted-foreground">
              Используется на страницах компаний/вакансий, если у компании нет логотипа.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Суффикс заголовка карьерных страниц</Label>
            <Input
              value={careersSuffix}
              onChange={e => setCareersSuffix(e.target.value)}
              placeholder="— Вакансии"
            />
            <p className="text-[11px] text-muted-foreground">
              Добавляется к названию компании: «ИП Штумпф {careersSuffix || "— Вакансии"}»
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Шаблон заголовка страницы вакансии</Label>
            <Input
              value={vacancyTemplate}
              onChange={e => setVacancyTemplate(e.target.value)}
              placeholder="{title} — {company}"
            />
            <p className="text-[11px] text-muted-foreground">
              Плейсхолдеры: <code className="bg-muted px-1 rounded">{"{title}"}</code> — название вакансии,{" "}
              <code className="bg-muted px-1 rounded">{"{company}"}</code> — название компании
            </p>
          </div>

          {seoMsg && (
            <p className={`text-sm ${seoMsg === "Сохранено" ? "text-green-600" : "text-destructive"}`}>
              {seoMsg}
            </p>
          )}

          <Button onClick={saveSeo} disabled={seoPending}>
            {seoPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Сохранить SEO-дефолты
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
