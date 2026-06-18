"use client"

import { useEffect, useState } from "react"
import { AdminPageLayout } from "@/components/admin/admin-page-layout"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { TableCard, DataTable, DataHead, DataHeadCell, DataRow, DataCell } from "@/components/ui/data-table"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import {
  Mail, Loader2, Check, X, UserPlus, Copy, Phone, Building2, PhoneCall,
  List, Columns2,
} from "lucide-react"
import { FUNNEL_TEMPLATES, DEFAULT_TEMPLATE_KEY } from "@/lib/funnel-builder/blocks"
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import { cn } from "@/lib/utils"

// ─── Верхние разделы ─────────────────────────────────────────────────────────
type Section = "registration" | "email"
const SECTIONS: Array<{ key: Section; label: string }> = [
  { key: "registration", label: "Заявки на регистрацию" },
  { key: "email",        label: "Запросы на смену email" },
]

function formatDate(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (isNaN(d.getTime())) return "—"
  return d.toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
}

type ViewMode = "table" | "kanban"

export default function AdminRequestsPage() {
  const [section, setSection] = useState<Section>("registration")
  const [viewMode, setViewMode] = useState<ViewMode>("table")

  return (
    <AdminPageLayout>
      <div className="py-6 space-y-6 px-8">
        <div>
          <div className="flex items-center gap-2 pt-3 pb-2">
            <Mail className="h-5 w-5 text-violet-600" />
            <h1 className="text-lg font-semibold">Заявки</h1>
          </div>
          <p className="text-muted-foreground text-sm">
            Заявки на регистрацию новых компаний и запросы директоров на смену email.
          </p>
        </div>

        {/* Верхние табы-разделы */}
        <div className="flex items-center justify-between border-b border-border">
          <div className="flex items-center gap-1">
            {SECTIONS.map(s => (
              <button
                key={s.key}
                type="button"
                onClick={() => setSection(s.key)}
                className={`px-3 py-2 text-sm border-b-2 -mb-px transition-colors ${
                  section === s.key
                    ? "border-primary text-foreground font-medium"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* Переключатель вида — только для раздела заявок на регистрацию */}
          {section === "registration" && (
            <div className="flex items-center bg-muted rounded-lg p-1 gap-0.5 mb-0.5">
              <Button
                variant={viewMode === "table" ? "default" : "ghost"}
                size="sm"
                className={cn(
                  "h-7 px-2.5 text-xs gap-1.5 transition-all",
                  viewMode !== "table" && "text-muted-foreground hover:text-foreground"
                )}
                onClick={() => setViewMode("table")}
                title="Таблица"
              >
                <List className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Таблица</span>
              </Button>
              <Button
                variant={viewMode === "kanban" ? "default" : "ghost"}
                size="sm"
                className={cn(
                  "h-7 px-2.5 text-xs gap-1.5 transition-all",
                  viewMode !== "kanban" && "text-muted-foreground hover:text-foreground"
                )}
                onClick={() => setViewMode("kanban")}
                title="Канбан"
              >
                <Columns2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Канбан</span>
              </Button>
            </div>
          )}
        </div>

        {section === "registration"
          ? <RegistrationRequests viewMode={viewMode} />
          : <EmailChangeRequests />}
      </div>
    </AdminPageLayout>
  )
}

// ─── Заявки на регистрацию (access_requests) ─────────────────────────────────

interface AccessRequestRow {
  id:          string
  name:        string
  email:       string
  phone:       string | null
  companyName: string | null
  comment:     string | null
  status:      string | null
  requestType: string | null
  createdAt:   string | null
}

const ACCESS_STATUS_TABS: Array<{ key: string; label: string }> = [
  { key: "new",       label: "Новые" },
  { key: "contacted", label: "Связались" },
  { key: "approved",  label: "Одобренные" },
  { key: "rejected",  label: "Отклонённые" },
]

// Стиль колонок канбана (градиент) — аналогично kanban-board.tsx
const KANBAN_COLUMN_COLORS: Record<string, { from: string; to: string }> = {
  new:       { from: "#8b5cf6", to: "#7c3aed" },
  contacted: { from: "#3b82f6", to: "#2563eb" },
  approved:  { from: "#22c55e", to: "#16a34a" },
  rejected:  { from: "#94a3b8", to: "#64748b" },
}

const STATUS_META: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  new:       { label: "Новая",      variant: "default" },
  contacted: { label: "Связались",  variant: "secondary" },
  approved:  { label: "Одобрена",   variant: "outline" },
  rejected:  { label: "Отклонена",  variant: "destructive" },
}

const REQUEST_TYPE_LABEL: Record<string, string> = {
  access:        "Доступ",
  demo:          "Демо",
  tariff_change: "Смена тарифа",
  partner:       "Партнёр",
}

interface ApprovedCreds {
  companyId: string
  directorEmail: string
  tempPassword: string
}

interface ManagerOption {
  id: string
  name: string | null
  email: string
  role: string
}

// Параметры диалога «Параметры заведения»
interface SetupParams {
  requestId: string
  isPartner: boolean
  funnelScenario: string
  salesManagerId: string
  accountManagerId: string
}

// Список шаблонов воронки для Select
const FUNNEL_TEMPLATE_OPTIONS = Object.entries(FUNNEL_TEMPLATES).map(([key, tpl]) => ({
  value: key,
  label: tpl.name,
}))

function RegistrationRequests({ viewMode }: { viewMode: ViewMode }) {
  const [status, setStatus] = useState("new")
  // Для таблицы — строки текущего таба; для канбана — все строки всех статусов
  const [rows, setRows] = useState<AccessRequestRow[]>([])
  const [allRows, setAllRows] = useState<AccessRequestRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [creds, setCreds] = useState<ApprovedCreds | null>(null)

  // Диалог «Параметры заведения»
  const [setupParams, setSetupParams] = useState<SetupParams | null>(null)
  const [managers, setManagers] = useState<ManagerOption[]>([])
  const [managersLoading, setManagersLoading] = useState(false)

  const load = (st: string) => {
    setLoading(true)
    fetch(`/api/admin/access-requests?status=${encodeURIComponent(st)}`)
      .then(r => r.json())
      .then(d => setRows(Array.isArray(d) ? d : []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false))
  }

  // Для канбана загружаем все статусы
  const loadAll = () => {
    setLoading(true)
    const statuses = ["new", "contacted", "approved", "rejected"]
    Promise.all(
      statuses.map(st =>
        fetch(`/api/admin/access-requests?status=${encodeURIComponent(st)}`)
          .then(r => r.json())
          .then(d => (Array.isArray(d) ? d : []))
          .catch(() => [] as AccessRequestRow[])
      )
    )
      .then(results => setAllRows(results.flat()))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (viewMode === "kanban") {
      loadAll()
    } else {
      load(status)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, viewMode])

  // Загрузить список менеджеров один раз при открытии диалога параметров
  const openSetupDialog = (row: AccessRequestRow) => {
    setSetupParams({
      requestId: row.id,
      isPartner: row.requestType === "partner",
      funnelScenario: DEFAULT_TEMPLATE_KEY,
      salesManagerId: "",
      accountManagerId: "",
    })
    if (managers.length === 0) {
      setManagersLoading(true)
      fetch("/api/admin/managers")
        .then(r => r.json())
        .then(d => setManagers(Array.isArray(d.managers) ? d.managers : []))
        .catch(() => setManagers([]))
        .finally(() => setManagersLoading(false))
    }
  }

  // Сменить статус: contacted / rejected
  const setStatusAction = async (id: string, next: "contacted" | "rejected") => {
    setBusyId(id)
    try {
      const res = await fetch(`/api/admin/access-requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(json.error ?? "Ошибка"); return }
      toast.success(next === "contacted" ? "Помечено «связались»" : "Заявка отклонена")
      if (viewMode === "kanban") {
        setAllRows(prev => prev.map(r => r.id === id ? { ...r, status: next } : r))
      } else {
        setRows(prev => prev.filter(r => r.id !== id))
      }
    } catch { toast.error("Ошибка сети") }
    finally { setBusyId(null) }
  }

  // Отправить одобрение с параметрами из диалога
  const approveWithParams = async () => {
    if (!setupParams) return
    const { requestId, isPartner, funnelScenario, salesManagerId, accountManagerId } = setupParams
    setBusyId(requestId)
    setSetupParams(null)
    try {
      const body: Record<string, unknown> = { funnelScenario }
      if (salesManagerId === "__none__") {
        body.salesManagerId = null
      } else if (salesManagerId !== "") {
        body.salesManagerId = salesManagerId
      }
      if (accountManagerId && accountManagerId !== "__none__") {
        body.accountManagerId = accountManagerId
      }

      const res = await fetch(`/api/admin/access-requests/${requestId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(json.error ?? "Ошибка одобрения"); return }
      toast.success(isPartner ? "Компания и партнёр созданы" : "Компания и директор созданы")
      if (viewMode === "kanban") {
        setAllRows(prev => prev.map(r => r.id === requestId ? { ...r, status: "approved" } : r))
      } else {
        setRows(prev => prev.filter(r => r.id !== requestId))
      }
      setCreds({
        companyId: json.companyId,
        directorEmail: json.directorEmail,
        tempPassword: json.tempPassword,
      })
    } catch { toast.error("Ошибка сети") }
    finally { setBusyId(null) }
  }

  const copy = (text: string, label: string) => {
    navigator.clipboard?.writeText(text).then(
      () => toast.success(`${label} скопирован`),
      () => toast.error("Не удалось скопировать"),
    )
  }

  // Обработчик drag-and-drop для канбана
  const handleDragEnd = async (rowId: string, newStatus: string) => {
    const row = allRows.find(r => r.id === rowId)
    if (!row || row.status === newStatus) return

    // Оптимистично обновляем
    setAllRows(prev => prev.map(r => r.id === rowId ? { ...r, status: newStatus } : r))

    // Если одобряем — открываем диалог
    if (newStatus === "approved") {
      openSetupDialog({ ...row, status: newStatus })
      return
    }

    setBusyId(rowId)
    try {
      const res = await fetch(`/api/admin/access-requests/${rowId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json.error ?? "Ошибка")
        // Откатываем
        setAllRows(prev => prev.map(r => r.id === rowId ? { ...r, status: row.status } : r))
      } else {
        const meta = STATUS_META[newStatus]
        toast.success(`Статус изменён: ${meta?.label ?? newStatus}`)
      }
    } catch {
      toast.error("Ошибка сети")
      setAllRows(prev => prev.map(r => r.id === rowId ? { ...r, status: row.status } : r))
    } finally {
      setBusyId(null)
    }
  }

  const activeRows = viewMode === "kanban" ? allRows : rows

  return (
    <div className="space-y-4">
      {/* Фильтр по статусу — только для таблицы */}
      {viewMode === "table" && (
        <div className="flex items-center gap-1 flex-wrap">
          {ACCESS_STATUS_TABS.map(t => (
            <button
              key={t.key}
              type="button"
              onClick={() => setStatus(t.key)}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                status === t.key
                  ? "bg-primary text-primary-foreground font-medium"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : viewMode === "table" ? (
        /* ── Табличный вид ── */
        rows.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              Заявок нет
            </CardContent>
          </Card>
        ) : (
          <TableCard>
            <DataTable>
              <DataHead>
                <DataHeadCell>Контакт</DataHeadCell>
                <DataHeadCell>Компания</DataHeadCell>
                <DataHeadCell>Тип</DataHeadCell>
                <DataHeadCell>Статус</DataHeadCell>
                <DataHeadCell>Дата</DataHeadCell>
                <DataHeadCell align="right">Действия</DataHeadCell>
              </DataHead>
              <tbody>
                {rows.map(row => {
                  const meta = STATUS_META[row.status ?? "new"] ?? STATUS_META.new
                  const typeLabel = REQUEST_TYPE_LABEL[row.requestType ?? "access"] ?? (row.requestType ?? "—")
                  const isPartner = row.requestType === "partner"
                  return (
                    <DataRow key={row.id} className="align-top">
                      <DataCell>
                        <div className="font-medium">{row.name || "—"}</div>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                          <Mail className="w-3 h-3" /> {row.email}
                        </div>
                        {row.phone && (
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                            <Phone className="w-3 h-3" /> {row.phone}
                          </div>
                        )}
                        {row.comment && (
                          <div className="text-xs text-muted-foreground mt-1 max-w-xs whitespace-pre-wrap break-words">
                            {row.comment}
                          </div>
                        )}
                      </DataCell>
                      <DataCell className="text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 shrink-0" />
                          {row.companyName || "—"}
                        </div>
                      </DataCell>
                      <DataCell>
                        <Badge
                          variant={isPartner ? "default" : "outline"}
                          className={`text-[10px] ${isPartner ? "bg-violet-600 hover:bg-violet-600 text-white" : ""}`}
                        >
                          {typeLabel}
                        </Badge>
                      </DataCell>
                      <DataCell>
                        <Badge variant={meta.variant} className="text-[10px]">{meta.label}</Badge>
                      </DataCell>
                      <DataCell className="text-muted-foreground whitespace-nowrap">
                        {formatDate(row.createdAt)}
                      </DataCell>
                      <DataCell align="right">
                        {row.status === "approved" || row.status === "rejected" ? (
                          <span className="text-xs text-muted-foreground italic">{meta.label}</span>
                        ) : (
                          <div className="inline-flex items-center gap-2 flex-wrap justify-end">
                            {row.status !== "contacted" && (
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={busyId === row.id}
                                onClick={() => setStatusAction(row.id, "contacted")}
                              >
                                <PhoneCall className="w-3.5 h-3.5 mr-1" /> Связались
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busyId === row.id}
                              onClick={() => setStatusAction(row.id, "rejected")}
                            >
                              <X className="w-3.5 h-3.5 mr-1" /> Отклонить
                            </Button>
                            <Button
                              size="sm"
                              disabled={busyId === row.id}
                              onClick={() => openSetupDialog(row)}
                            >
                              {busyId === row.id
                                ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                                : <UserPlus className="w-3.5 h-3.5 mr-1" />}
                              Одобрить
                            </Button>
                          </div>
                        )}
                      </DataCell>
                    </DataRow>
                  )
                })}
              </tbody>
            </DataTable>
          </TableCard>
        )
      ) : (
        /* ── Канбан-вид ── */
        <KanbanView
          rows={allRows}
          busyId={busyId}
          onDragEnd={handleDragEnd}
          onContacted={(id) => setStatusAction(id, "contacted")}
          onReject={(id) => setStatusAction(id, "rejected")}
          onApprove={(row) => openSetupDialog(row)}
        />
      )}

      {/* Диалог «Параметры заведения» */}
      <Dialog open={!!setupParams} onOpenChange={(o) => { if (!o) setSetupParams(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Параметры заведения</DialogTitle>
            <DialogDescription>
              Настройте сценарий и ответственных менеджеров перед созданием компании.
            </DialogDescription>
          </DialogHeader>
          {setupParams && (
            <div className="space-y-4 py-1">
              <div className="space-y-1.5">
                <Label>Сценарий обработки</Label>
                <Select
                  value={setupParams.funnelScenario}
                  onValueChange={(v) => setSetupParams(p => p ? { ...p, funnelScenario: v } : p)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Выберите сценарий" />
                  </SelectTrigger>
                  <SelectContent>
                    {FUNNEL_TEMPLATE_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Менеджер продаж</Label>
                <Select
                  value={setupParams.salesManagerId}
                  onValueChange={(v) => setSetupParams(p => p ? { ...p, salesManagerId: v } : p)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Я (по умолчанию)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Я (по умолчанию)</SelectItem>
                    <SelectItem value="__none__">— не назначен —</SelectItem>
                    {managersLoading ? (
                      <SelectItem value="__loading__" disabled>Загрузка…</SelectItem>
                    ) : managers.map(m => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name || m.email}
                        {m.role ? <span className="text-muted-foreground ml-1 text-xs">({m.role})</span> : null}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  «По умолчанию» — автоматически назначается одобряющий оператор.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label>Клиентский менеджер</Label>
                <Select
                  value={setupParams.accountManagerId}
                  onValueChange={(v) => setSetupParams(p => p ? { ...p, accountManagerId: v } : p)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="— не назначен —" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">— не назначен —</SelectItem>
                    {managersLoading ? (
                      <SelectItem value="__loading__" disabled>Загрузка…</SelectItem>
                    ) : managers.map(m => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name || m.email}
                        {m.role ? <span className="text-muted-foreground ml-1 text-xs">({m.role})</span> : null}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setSetupParams(null)}>Отмена</Button>
            <Button onClick={approveWithParams} disabled={!!busyId}>
              <UserPlus className="w-3.5 h-3.5 mr-1" />
              Одобрить и завести
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Креды после одобрения */}
      <Dialog open={!!creds} onOpenChange={(o) => { if (!o) setCreds(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Компания создана</DialogTitle>
            <DialogDescription>
              Передайте директору эти данные для входа. Временный пароль больше не
              будет показан — скопируйте его сейчас.
            </DialogDescription>
          </DialogHeader>
          {creds && (
            <div className="space-y-3">
              <div>
                <div className="text-xs text-muted-foreground mb-1">Email (логин)</div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded-md bg-muted px-3 py-2 text-sm break-all">
                    {creds.directorEmail}
                  </code>
                  <Button size="icon" variant="outline" onClick={() => copy(creds.directorEmail, "Email")}>
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">Временный пароль</div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded-md bg-muted px-3 py-2 text-sm font-mono break-all">
                    {creds.tempPassword}
                  </code>
                  <Button size="icon" variant="outline" onClick={() => copy(creds.tempPassword, "Пароль")}>
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setCreds(null)}>Готово</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Канбан-доска ─────────────────────────────────────────────────────────────

interface KanbanViewProps {
  rows: AccessRequestRow[]
  busyId: string | null
  onDragEnd: (rowId: string, newStatus: string) => void
  onContacted: (id: string) => void
  onReject: (id: string) => void
  onApprove: (row: AccessRequestRow) => void
}

function KanbanView({ rows, busyId, onDragEnd, onContacted, onReject, onApprove }: KanbanViewProps) {
  const [activeId, setActiveId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  )

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id))
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    setActiveId(null)
    if (!over) return
    const rowId = String(active.id)
    const newStatus = String(over.id)
    onDragEnd(rowId, newStatus)
  }

  const activeRow = activeId ? rows.find(r => r.id === activeId) : null

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div
        className="grid gap-3 w-full"
        style={{ gridTemplateColumns: `repeat(4, minmax(220px, 1fr))` }}
      >
        {ACCESS_STATUS_TABS.map(tab => {
          const colRows = rows.filter(r => (r.status ?? "new") === tab.key)
          const colors = KANBAN_COLUMN_COLORS[tab.key]
          return (
            <KanbanColumn
              key={tab.key}
              id={tab.key}
              label={tab.label}
              count={colRows.length}
              colorFrom={colors.from}
              colorTo={colors.to}
              rows={colRows}
              busyId={busyId}
              onContacted={onContacted}
              onReject={onReject}
              onApprove={onApprove}
            />
          )
        })}
      </div>

      <DragOverlay>
        {activeRow && (
          <KanbanCard
            row={activeRow}
            busyId={busyId}
            isDragging
            onContacted={onContacted}
            onReject={onReject}
            onApprove={onApprove}
          />
        )}
      </DragOverlay>
    </DndContext>
  )
}

// ─── Колонка канбана ──────────────────────────────────────────────────────────

interface KanbanColumnProps {
  id: string
  label: string
  count: number
  colorFrom: string
  colorTo: string
  rows: AccessRequestRow[]
  busyId: string | null
  onContacted: (id: string) => void
  onReject: (id: string) => void
  onApprove: (row: AccessRequestRow) => void
}

function KanbanColumn({ id, label, count, colorFrom, colorTo, rows, busyId, onContacted, onReject, onApprove }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id })

  return (
    <div className="flex flex-col rounded-xl min-w-0">
      {/* Шапка колонки */}
      <div className="mb-3 rounded-lg overflow-hidden">
        <div
          className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg"
          style={{ background: `linear-gradient(135deg, ${colorFrom}, ${colorTo})` }}
        >
          <h3 className="font-medium text-white text-xs truncate">{label}</h3>
          <span className="text-white/90 font-bold text-xs">{count}</span>
        </div>
      </div>

      {/* Зона дропа + карточки */}
      <div
        ref={setNodeRef}
        className={cn(
          "space-y-2 flex-1 min-h-[300px] rounded-lg p-1.5 transition-colors",
          isOver ? "bg-primary/5 ring-2 ring-primary/30" : "bg-muted/30",
          rows.length === 0 && "flex items-center justify-center"
        )}
      >
        {rows.length === 0 ? (
          <span className="text-xs text-muted-foreground/50">Пусто</span>
        ) : (
          rows.map(row => (
            <KanbanCard
              key={row.id}
              row={row}
              busyId={busyId}
              onContacted={onContacted}
              onReject={onReject}
              onApprove={onApprove}
            />
          ))
        )}
      </div>
    </div>
  )
}

// ─── Карточка канбана ─────────────────────────────────────────────────────────

interface KanbanCardProps {
  row: AccessRequestRow
  busyId: string | null
  isDragging?: boolean
  onContacted: (id: string) => void
  onReject: (id: string) => void
  onApprove: (row: AccessRequestRow) => void
}

function KanbanCard({ row, busyId, isDragging, onContacted, onReject, onApprove }: KanbanCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging: isDrag } = useDraggable({ id: row.id })

  const isPartner = row.requestType === "partner"
  const typeLabel = REQUEST_TYPE_LABEL[row.requestType ?? "access"] ?? (row.requestType ?? "—")
  const isBusy = busyId === row.id

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        "bg-background rounded-lg border border-border p-3 cursor-grab active:cursor-grabbing shadow-sm",
        "hover:shadow-md transition-shadow select-none",
        (isDrag || isDragging) && "opacity-50 shadow-lg ring-2 ring-primary/30"
      )}
    >
      {/* Имя + тип */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="font-medium text-sm leading-tight truncate">{row.name || "—"}</div>
        <Badge
          variant={isPartner ? "default" : "outline"}
          className={cn("text-[10px] shrink-0", isPartner && "bg-violet-600 hover:bg-violet-600 text-white")}
        >
          {typeLabel}
        </Badge>
      </div>

      {/* Email */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
        <Mail className="w-3 h-3 shrink-0" />
        <span className="truncate">{row.email}</span>
      </div>

      {/* Компания */}
      {row.companyName && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
          <Building2 className="w-3 h-3 shrink-0" />
          <span className="truncate">{row.companyName}</span>
        </div>
      )}

      {/* Телефон */}
      {row.phone && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
          <Phone className="w-3 h-3 shrink-0" />
          <span>{row.phone}</span>
        </div>
      )}

      {/* Комментарий */}
      {row.comment && (
        <div className="text-xs text-muted-foreground mt-1.5 line-clamp-2 italic border-t border-border/50 pt-1.5">
          {row.comment}
        </div>
      )}

      {/* Дата */}
      <div className="text-[10px] text-muted-foreground/60 mt-2">{formatDate(row.createdAt)}</div>

      {/* Действия — только для неконечных статусов */}
      {row.status !== "approved" && row.status !== "rejected" && (
        <div
          className="flex items-center gap-1 mt-2 pt-2 border-t border-border/50"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {row.status !== "contacted" && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[10px]"
              disabled={isBusy}
              onClick={(e) => { e.stopPropagation(); onContacted(row.id) }}
            >
              <PhoneCall className="w-3 h-3 mr-1" /> Связались
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="h-6 px-2 text-[10px]"
            disabled={isBusy}
            onClick={(e) => { e.stopPropagation(); onReject(row.id) }}
          >
            <X className="w-3 h-3 mr-1" /> Отклонить
          </Button>
          <Button
            size="sm"
            className="h-6 px-2 text-[10px]"
            disabled={isBusy}
            onClick={(e) => { e.stopPropagation(); onApprove(row) }}
          >
            {isBusy
              ? <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              : <UserPlus className="w-3 h-3 mr-1" />}
            Одобрить
          </Button>
        </div>
      )}
    </div>
  )
}

// ─── Запросы на смену email (support_requests) ───────────────────────────────

interface EmailRequestRow {
  id:           string
  createdAt:    string | null
  status:       string | null
  data:         { newEmail?: string; reason?: string; currentEmail?: string } | null
  userId:       string
  userName:     string | null
  userEmail:    string | null
  userRole:     string | null
  companyId:    string | null
  companyName:  string | null
}

const EMAIL_STATUS_TABS: Array<{ key: string; label: string }> = [
  { key: "new",      label: "Новые" },
  { key: "done",     label: "Принятые" },
  { key: "rejected", label: "Отклонённые" },
]

function EmailChangeRequests() {
  const [status, setStatus] = useState("new")
  const [rows, setRows] = useState<EmailRequestRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = (st: string) => {
    setLoading(true)
    fetch(`/api/admin/email-change-requests?status=${st}`)
      .then(r => r.json())
      .then(d => setRows(Array.isArray(d) ? d : []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load(status) }, [status])

  const act = async (id: string, action: "approve" | "reject") => {
    setBusyId(id)
    try {
      const res = await fetch(`/api/admin/email-change-requests/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(json.error ?? "Ошибка"); return }
      toast.success(action === "approve" ? "Email изменён" : "Запрос отклонён")
      setRows(prev => prev.filter(r => r.id !== id))
    } catch { toast.error("Ошибка сети") }
    finally { setBusyId(null) }
  }

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        Заявки от директоров компаний. Остальные роли меняют email сами без запроса.
      </p>

      <div className="flex items-center gap-1 flex-wrap">
        {EMAIL_STATUS_TABS.map(t => (
          <button
            key={t.key}
            type="button"
            onClick={() => setStatus(t.key)}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              status === t.key
                ? "bg-primary text-primary-foreground font-medium"
                : "text-muted-foreground hover:bg-muted"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Запросов нет
          </CardContent>
        </Card>
      ) : (
        <TableCard>
          <DataTable>
            <DataHead>
              <DataHeadCell>Пользователь</DataHeadCell>
              <DataHeadCell>Компания</DataHeadCell>
              <DataHeadCell>Текущий → Новый</DataHeadCell>
              <DataHeadCell>Причина</DataHeadCell>
              <DataHeadCell>Дата</DataHeadCell>
              <DataHeadCell align="right">Действия</DataHeadCell>
            </DataHead>
            <tbody>
              {rows.map(row => {
                const newEmail = row.data?.newEmail ?? "—"
                const currentEmail = row.data?.currentEmail ?? row.userEmail ?? "—"
                const reason = row.data?.reason ?? ""
                return (
                  <DataRow key={row.id} className="align-top">
                    <DataCell>
                      <div className="font-medium">{row.userName ?? "—"}</div>
                      {row.userRole && (
                        <Badge variant="outline" className="text-[10px] mt-1">{row.userRole}</Badge>
                      )}
                    </DataCell>
                    <DataCell className="text-muted-foreground">{row.companyName ?? "—"}</DataCell>
                    <DataCell>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Mail className="w-3 h-3" /> {currentEmail}
                      </div>
                      <div className="flex items-center gap-1.5 text-sm font-medium mt-0.5">
                        <Mail className="w-3.5 h-3.5 text-primary" /> {newEmail}
                      </div>
                    </DataCell>
                    <DataCell className="text-muted-foreground max-w-xs">
                      {reason ? <span className="whitespace-pre-wrap break-words">{reason}</span> : "—"}
                    </DataCell>
                    <DataCell className="text-muted-foreground whitespace-nowrap">
                      {formatDate(row.createdAt)}
                    </DataCell>
                    <DataCell align="right">
                      {status === "new" ? (
                        <div className="inline-flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busyId === row.id}
                            onClick={() => act(row.id, "reject")}
                          >
                            <X className="w-3.5 h-3.5 mr-1" /> Отклонить
                          </Button>
                          <Button
                            size="sm"
                            disabled={busyId === row.id}
                            onClick={() => act(row.id, "approve")}
                          >
                            {busyId === row.id
                              ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                              : <Check className="w-3.5 h-3.5 mr-1" />}
                            Принять
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">{row.status}</span>
                      )}
                    </DataCell>
                  </DataRow>
                )
              })}
            </tbody>
          </DataTable>
        </TableCard>
      )}
    </div>
  )
}
