"use client"

import { useState, useRef, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Switch } from "@/components/ui/switch"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { TableCard, DataTable, DataHead, DataHeadCell, DataRow, DataCell } from "@/components/ui/data-table"
import {
  Users, Plus, Settings, Trash2, Save, UserPlus,
  Mail, AlertTriangle, Check,
  CalendarClock, Link2, Copy, X, Clock, RotateCcw,
  Loader2, ExternalLink, Camera, KeyRound, Ban, ChevronDown,
} from "lucide-react"
import { getVacancyCategories } from "@/lib/vacancy-storage"
import { useAuth } from "@/lib/auth"

// ─── Типы ────────────────────────────────────────────────────

type TeamRole =
  | "director"
  | "hr_lead"
  | "hr_manager"
  | "department_head"
  | "observer"
  | "employee"

type MemberStatus = "active" | "invited" | "disabled" | "pending"
type CandidateVisibility = "own" | "all" | "categories"

interface TeamMember {
  id: string
  name: string
  email: string
  role: TeamRole
  status: MemberStatus
  avatar: string
  avatarUrl?: string
  vacancyIds: string[]
  categories: string[]
  candidateVisibility: CandidateVisibility
  substituteId?: string
  permissions?: Record<string, boolean>
}

interface InviteLink {
  id: string
  token: string
  role: string
  label: string | null
  maxUses: number | null
  usesCount: number
  isActive: boolean
  expiresAt: string | null
  createdAt: string
  createdByName?: string | null
}

// ─── Конфиг ролей ───────────────────────────────────────────

const ROLE_CONFIG: Record<TeamRole, { label: string; description: string; color: string }> = {
  director: {
    label: "Директор",
    description: "Полный доступ + управление тарифом и настройками",
    color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  },
  hr_lead: {
    label: "Главный HR",
    description: "Видит всех кандидатов + управление командой",
    color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  },
  hr_manager: {
    label: "HR-менеджер",
    description: "Работа с кандидатами (настраивается по категориям)",
    color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  },
  department_head: {
    label: "Руководитель отдела",
    description: "Просмотр своей категории + одобрение/отклонение",
    color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  },
  observer: {
    label: "Наблюдатель",
    description: "Только просмотр аналитики",
    color: "bg-gray-100 text-gray-700 dark:bg-gray-800/30 dark:text-gray-400",
  },
  employee: {
    label: "Сотрудник",
    description: "Только профиль, ожидает настройки прав",
    color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  },
}

const PERMISSIONS_CONFIG = [
  { key: "manage_company", label: "Настройки компании" },
  { key: "manage_team", label: "Управление командой" },
  { key: "manage_billing", label: "Управление тарифом" },
  { key: "create_vacancies", label: "Создание вакансий" },
  { key: "edit_knowledge", label: "База знаний" },
  { key: "view_analytics", label: "Аналитика" },
  { key: "manage_org_structure", label: "Структура компании" },
] as const

// ─── Компонент ──────────────────────────────────────────────

export default function TeamPage() {
  const { hasAccess } = useAuth()
  const [members, setMembers] = useState<TeamMember[]>([])

  // Реальные участники компании из БД (GET /api/team), а не демо-данные.
  useEffect(() => {
    let alive = true
    fetch("/api/team")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: { id: string; name: string; email: string; role: string; avatarUrl?: string | null; isActive?: boolean; permissions?: Record<string, boolean> | null }[]) => {
        if (!alive || !Array.isArray(rows)) return
        const VALID: TeamRole[] = ["director", "hr_lead", "hr_manager", "department_head", "observer", "employee"]
        setMembers(rows.map((u) => ({
          id: u.id,
          name: u.name || u.email,
          email: u.email,
          role: (VALID.includes(u.role as TeamRole) ? u.role : "employee") as TeamRole,
          status: (u.isActive === false ? "disabled" : "active") as MemberStatus,
          permissions: (u.permissions as Record<string, boolean>) ?? undefined,
          avatar: (u.name || u.email).split(/\s+/).map((s) => s[0]).filter(Boolean).slice(0, 2).join("").toUpperCase(),
          avatarUrl: u.avatarUrl || undefined,
          vacancyIds: [], categories: [], candidateVisibility: "all",
        })))
      })
      .catch(() => { /* оставляем пустой список */ })
    return () => { alive = false }
  }, [])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  // «Добавить участника вручную» — отдельная модалка, создаёт реального
  // user'а через POST /api/team (см. app/api/team/route.ts). В отличие от
  // «Пригласить участника», который только создаёт строку в localStorage.
  const [addOpen, setAddOpen] = useState(false)
  const [addName, setAddName] = useState("")
  const [addEmail, setAddEmail] = useState("")
  const [addRole, setAddRole] = useState<TeamRole>("hr_manager")
  const [addAvatarFile, setAddAvatarFile] = useState<File | null>(null)
  const [addBusy, setAddBusy] = useState(false)
  const addFileInputRef = useRef<HTMLInputElement>(null)

  const handleAddMember = async () => {
    if (!addName.trim()) { toast.error("Введите имя"); return }
    if (!addEmail.trim()) { toast.error("Введите email"); return }
    setAddBusy(true)
    try {
      // 1) Создаём пользователя
      const res = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: addName.trim(),
          email: addEmail.trim(),
          role: addRole,
        }),
      })
      const json = await res.json().catch(() => ({})) as {
        data?: { id: string; name: string; email: string; role: string; avatarUrl: string | null; tempPassword: string }
        error?: string
      }
      const payload = json.data
      if (!res.ok || !payload) throw new Error(json.error || "Ошибка")

      // 2) Опционально — загружаем фото на этого пользователя
      if (addAvatarFile) {
        const fd = new FormData()
        fd.append("file", addAvatarFile)
        fd.append("userId", payload.id)
        await fetch("/api/team/avatar", { method: "POST", body: fd }).catch(() => {})
      }

      // 3) Добавляем в локальный список (localStorage — для UI-консистентности
      //    со старой логикой страницы). При следующем визите подтянется из API.
      const initials = payload.name.split(" ").map(s => s[0]).join("").slice(0, 2).toUpperCase() || "??"
      setMembers(prev => [...prev, {
        id: payload.id,
        name: payload.name,
        email: payload.email,
        role: payload.role as TeamRole,
        status: "active",
        avatar: initials,
        avatarUrl: payload.avatarUrl ?? undefined,
        vacancyIds: [],
        categories: [],
        candidateVisibility: payload.role === "observer" ? "all" : "own",
      }])

      // 4) Закрываем модалку и показываем временный пароль ОДИН РАЗ —
      //    дальше API его уже не отдаёт.
      setAddOpen(false)
      setAddName(""); setAddEmail(""); setAddAvatarFile(null); setAddRole("hr_manager")
      toast.success(`Добавлен: ${payload.email}. Временный пароль: ${payload.tempPassword}`, { duration: 15000 })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка добавления")
    } finally {
      setAddBusy(false)
    }
  }

  // Inline edit state for expanded row
  const [editRole, setEditRole] = useState<TeamRole>("hr_manager")
  const [editPermissions, setEditPermissions] = useState<Record<string, boolean>>({})

  // Join link state
  // Постоянная ссылка-приглашение = уникальный join_code компании (например
  // orlink). Грузим реальный из /api/companies, редактируем и сохраняем.
  const [joinCode, setJoinCode] = useState("")
  const [joinCodeSaved, setJoinCodeSaved] = useState("")
  const [joinEnabled, setJoinEnabled] = useState(true)
  const [joinSaving, setJoinSaving] = useState(false)
  const [joinOrigin, setJoinOrigin] = useState("company24.pro")

  useEffect(() => {
    if (typeof window !== "undefined") setJoinOrigin(window.location.host)
    fetch("/api/companies")
      .then((r) => (r.ok ? r.json() : null))
      .then((c: { joinCode?: string | null; joinEnabled?: boolean } | null) => {
        if (!c) return
        const code = c.joinCode || ""
        setJoinCode(code); setJoinCodeSaved(code)
        setJoinEnabled(c.joinEnabled !== false)
      })
      .catch(() => {})
  }, [])

  const saveJoin = async (patch: { join_code?: string; join_enabled?: boolean }) => {
    setJoinSaving(true)
    try {
      const res = await fetch("/api/companies", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
      })
      const data = await res.json().catch(() => null) as { joinCode?: string | null; joinEnabled?: boolean; error?: string } | null
      if (!res.ok) throw new Error(data?.error || "Не удалось сохранить")
      if (patch.join_code !== undefined) {
        const code = data?.joinCode || ""
        setJoinCode(code); setJoinCodeSaved(code)
      }
      if (patch.join_enabled !== undefined) setJoinEnabled(data?.joinEnabled !== false)
      toast.success("Сохранено")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Ошибка")
      // откатываем тумблер при ошибке
      if (patch.join_enabled !== undefined) setJoinEnabled((v) => !v)
    } finally { setJoinSaving(false) }
  }

  // Invite by email form
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState<TeamRole>("hr_manager")
  const [inviteVacancyIds, setInviteVacancyIds] = useState<string[]>([])
  const vacancyCategories = getVacancyCategories()

  // ── Invite links state ──────────────────────────────────
  const [linkDialogOpen, setLinkDialogOpen] = useState(false)
  const [links, setLinks]                   = useState<InviteLink[]>([])
  const [linksLoading, setLinksLoading]     = useState(false)
  const [linkRole, setLinkRole]             = useState<TeamRole>("hr_manager")
  const [linkLabel, setLinkLabel]           = useState("")
  const [linkMaxUses, setLinkMaxUses]       = useState<string>("1")
  const [linkExpireDays, setLinkExpireDays] = useState<string>("7")
  const [creating, setCreating]             = useState(false)

  if (!hasAccess(["platform_admin", "admin", "director", "client"])) {
    return (
      <div className="max-w-2xl mx-auto py-16 text-center">
        <h1 className="text-lg font-semibold mb-2">Доступ ограничен</h1>
        <p className="text-sm text-muted-foreground">Эта страница доступна только директору компании.</p>
      </div>
    )
  }

  const openLinkDialog = async () => {
    setLinkDialogOpen(true)
    setLinksLoading(true)
    try {
      const res = await fetch("/api/invites")
      const data = await res.json()
      setLinks(data.links ?? [])
    } catch {
      toast.error("Не удалось загрузить список ссылок")
    } finally {
      setLinksLoading(false)
    }
  }

  const createLink = async () => {
    setCreating(true)
    try {
      const res = await fetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: linkRole,
          label: linkLabel || null,
          maxUses: linkMaxUses === "unlimited" ? null : parseInt(linkMaxUses) || 1,
          expiresInDays: linkExpireDays === "never" ? null : parseInt(linkExpireDays) || 7,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Ошибка")
      setLinks(prev => [data.link, ...prev])
      setLinkLabel("")
      toast.success("Ссылка создана")
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setCreating(false)
    }
  }

  const revokeLink = async (id: string) => {
    try {
      await fetch(`/api/invites?id=${id}`, { method: "DELETE" })
      setLinks(prev => prev.map(l => l.id === id ? { ...l, isActive: false } : l))
      toast.success("Ссылка деактивирована")
    } catch {
      toast.error("Не удалось деактивировать ссылку")
    }
  }

  const copyLink = (token: string) => {
    const url = `${window.location.origin}/invite/${token}`
    navigator.clipboard.writeText(url)
    toast.success("Ссылка скопирована в буфер обмена")
  }

  // ── Expand row ──────────────────────────────────────────

  const toggleExpand = (member: TeamMember) => {
    if (expandedId === member.id) {
      setExpandedId(null)
      return
    }
    setExpandedId(member.id)
    setEditRole(member.role)
    setEditPermissions({
      manage_company: false,
      manage_team: false,
      manage_billing: false,
      create_vacancies: false,
      edit_knowledge: false,
      view_analytics: false,
      ...(member.permissions ?? {}),
    })
    setConfirmDeleteId(null)
  }

  const handleSaveInline = async (memberId: string) => {
    const snapshot = members
    const nextRole = editRole
    const nextPerms = editPermissions
    setMembers(prev => prev.map(m =>
      m.id === memberId ? { ...m, role: nextRole, permissions: nextPerms } : m
    ))
    setExpandedId(null)
    try {
      const res = await fetch("/api/team", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: memberId, role: nextRole, permissions: nextPerms }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`)
      toast.success("Настройки сохранены")
    } catch (e) {
      setMembers(snapshot) // откат — на сервере не сохранилось
      toast.error(e instanceof Error ? e.message : "Не удалось сохранить")
    }
  }

  const handleDeleteMember = async (memberId: string) => {
    const member = members.find(m => m.id === memberId)
    const snapshot = members
    setMembers(prev => prev.filter(m => m.id !== memberId))
    setExpandedId(null)
    try {
      const res = await fetch(`/api/team?id=${encodeURIComponent(memberId)}`, { method: "DELETE" })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`)
      toast.success(`${member?.name ?? "Участник"} удалён из команды`)
    } catch (e) {
      setMembers(snapshot) // откат
      toast.error(e instanceof Error ? e.message : "Не удалось удалить")
    }
  }

  const handleBlockMember = async (memberId: string) => {
    const member = members.find(m => m.id === memberId)
    const snapshot = members
    const willDisable = member?.status !== "disabled"
    setMembers(prev => prev.map(m =>
      m.id === memberId ? { ...m, status: (willDisable ? "disabled" : "active") as MemberStatus } : m
    ))
    try {
      const res = await fetch("/api/team", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: memberId, isActive: !willDisable }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`)
      toast.success(willDisable ? `${member?.name} заблокирован` : `${member?.name} разблокирован`)
    } catch (e) {
      setMembers(snapshot) // откат
      toast.error(e instanceof Error ? e.message : "Не удалось изменить статус")
    }
  }

  const handleResetPassword = (memberId: string) => {
    const member = members.find(m => m.id === memberId)
    toast.success(`Ссылка для сброса пароля отправлена на ${member?.email}`)
  }

  // ── Invite ──────────────────────────────────────────────

  const handleInvite = () => {
    if (!inviteEmail) { toast.error("Введите email"); return }
    const initials = inviteEmail.slice(0, 2).toUpperCase()
    const newMember: TeamMember = {
      id: `m-${Date.now()}`,
      name: inviteEmail.split("@")[0],
      email: inviteEmail,
      role: inviteRole,
      status: "invited",
      avatar: initials,
      avatarUrl: undefined,
      vacancyIds: inviteVacancyIds,
      categories: [],
      candidateVisibility: inviteRole === "observer" ? "all" : "own",
    }
    setMembers(prev => [...prev, newMember])
    setInviteOpen(false)
    setInviteEmail("")
    setInviteVacancyIds([])
    toast.success(`Приглашение отправлено на ${inviteEmail}`)
  }

  const toggleInviteVacancy = (vacId: string) =>
    setInviteVacancyIds(prev =>
      prev.includes(vacId) ? prev.filter(v => v !== vacId) : [...prev, vacId]
    )

  // ─── Render ─────────────────────────────────────────────

  return (
    <>
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
        <div>
          <div className="flex items-center gap-2"><Users className="h-5 w-5 text-violet-600" /><h1 className="text-lg font-semibold">Команда</h1></div>
          <p className="text-muted-foreground text-sm">Управление участниками и ролями</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-1.5" onClick={openLinkDialog}>
            <Link2 className="w-4 h-4" />
            Ссылка-приглашение
          </Button>
          <Button variant="outline" className="gap-1.5" onClick={() => setAddOpen(true)}>
            <UserPlus className="w-4 h-4" />
            Добавить участника
          </Button>
          <Button className="gap-1.5" onClick={() => setInviteOpen(true)}>
            <Plus className="w-4 h-4" />
            Пригласить участника
          </Button>
        </div>
      </div>

      {/* ═══ Приглашения: часть 1 — публичная ссылка (роль: Сотрудник) ═══ */}
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Link2 className="w-4 h-4" /> Публичная ссылка <span className="text-xs font-normal text-muted-foreground">(роль: Сотрудник)</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Постоянная ссылка-приглашение компании (без срока и лимита). Любой, кто перейдёт,
            присоединится с ролью &laquo;Сотрудник&raquo; — права настроите в его карточке.
            Адрес можно менять; он уникален для всего портала.
          </p>
          <p className="text-xs text-muted-foreground">
            <b>Когда использовать:</b> массовый набор сотрудников по одной ссылке. Нужна
            конкретная роль (HR, директор) или срок/лимит — используйте{" "}
            <button type="button" onClick={openLinkDialog} className="text-primary hover:underline">персональные приглашения</button>.
          </p>
          {/* Редактируемый код: префикс + поле + кнопка — единый контрол */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center flex-1 min-w-[260px] rounded-md border border-input bg-background overflow-hidden focus-within:ring-2 focus-within:ring-ring/50 focus-within:border-ring transition-[box-shadow,border-color]">
              <span className="px-3 py-2 font-mono text-sm text-muted-foreground bg-muted select-none whitespace-nowrap border-r border-input">
                {joinOrigin}/join/
              </span>
              <Input
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                placeholder="company"
                className="h-9 border-0 shadow-none rounded-none bg-transparent font-mono text-sm focus-visible:ring-0 focus-visible:border-0 px-2 flex-1"
              />
              {joinCode === joinCodeSaved && (
                <button
                  type="button"
                  className="px-3 h-full flex items-center text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40 border-l border-input"
                  disabled={!joinCodeSaved}
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/join/${joinCodeSaved}`)
                    toast.success("Ссылка скопирована")
                  }}
                  title="Скопировать ссылку"
                >
                  <Copy className="w-4 h-4" />
                </button>
              )}
            </div>
            {joinCode !== joinCodeSaved && (
              <Button size="sm" disabled={joinSaving || !joinCode.trim()} onClick={() => saveJoin({ join_code: joinCode.trim() })}>
                Сохранить
              </Button>
            )}
          </div>
          {!joinCodeSaved && (
            <p className="text-xs text-amber-600">
              Ссылка ещё не задана — впишите уникальный адрес (например <b>company</b>) и нажмите «Сохранить».
            </p>
          )}
          <div className="flex items-center gap-2">
            <Switch checked={joinEnabled} onCheckedChange={(v) => { setJoinEnabled(v); void saveJoin({ join_enabled: v }) }} disabled={joinSaving} />
            <span className="text-sm text-foreground">Ссылка активна</span>
          </div>
        </CardContent>
      </Card>

      {/* Таблица участников */}
      <TableCard className="mb-8">
            <DataTable>
              <DataHead>
                <DataHeadCell>Участник</DataHeadCell>
                <DataHeadCell width="140px">Роль</DataHeadCell>
                <DataHeadCell>Email</DataHeadCell>
                <DataHeadCell align="center" width="100px">Статус</DataHeadCell>
                <DataHeadCell align="center" width="50px"></DataHeadCell>
              </DataHead>
              <tbody>
                {members.map(member => {
                  const roleCfg = ROLE_CONFIG[member.role]
                  const isActive = member.status === "active"
                  const isExpanded = expandedId === member.id
                  return (
                    <MemberRow
                      key={member.id}
                      member={member}
                      roleCfg={roleCfg}
                      isActive={isActive}
                      isExpanded={isExpanded}
                      onToggle={() => toggleExpand(member)}
                      editRole={editRole}
                      editPermissions={editPermissions}
                      onRoleChange={setEditRole}
                      onPermissionChange={(key, val) => setEditPermissions(prev => ({ ...prev, [key]: val }))}
                      onSave={() => handleSaveInline(member.id)}
                      onResetPassword={() => handleResetPassword(member.id)}
                      onBlock={() => handleBlockMember(member.id)}
                      onDelete={() => handleDeleteMember(member.id)}
                      confirmDeleteId={confirmDeleteId}
                      setConfirmDeleteId={setConfirmDeleteId}
                    />
                  )
                })}
              </tbody>
            </DataTable>
      </TableCard>

      {/* ═══ Диалог ссылок-приглашений ══════════════════════════════ */}
      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="w-5 h-5" />
              Персональные приглашения <span className="text-xs font-normal text-muted-foreground">(роль + срок)</span>
            </DialogTitle>
            <p className="text-xs text-muted-foreground pt-1">
              Адресные ссылки на любую роль (вплоть до HR/директора) со сроком и лимитом
              использований. Для массового набора сотрудников проще одна публичная ссылка
              на странице «Команда».
            </p>
          </DialogHeader>

          {/* Форма создания */}
          <div className="rounded-xl border bg-muted/30 p-4 space-y-4">
            <p className="text-sm font-medium text-foreground">Создать новую ссылку</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Роль</Label>
                <Select value={linkRole} onValueChange={v => setLinkRole(v as TeamRole)}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.entries(ROLE_CONFIG) as [TeamRole, typeof ROLE_CONFIG[TeamRole]][]).map(([key, cfg]) => (
                      <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Кол-во использований</Label>
                <Select value={linkMaxUses} onValueChange={setLinkMaxUses}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 раз</SelectItem>
                    <SelectItem value="5">5 раз</SelectItem>
                    <SelectItem value="10">10 раз</SelectItem>
                    <SelectItem value="unlimited">Без ограничений</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Срок действия</Label>
                <Select value={linkExpireDays} onValueChange={setLinkExpireDays}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 день</SelectItem>
                    <SelectItem value="7">7 дней</SelectItem>
                    <SelectItem value="30">30 дней</SelectItem>
                    <SelectItem value="never">Бессрочно</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Описание (необязательно)</Label>
                <Input
                  className="h-8 text-sm"
                  value={linkLabel}
                  onChange={e => setLinkLabel(e.target.value)}
                  placeholder="Для Ани из маркетинга"
                />
              </div>
            </div>

            <Button size="sm" onClick={createLink} disabled={creating} className="gap-1.5">
              {creating
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Plus className="w-3.5 h-3.5" />
              }
              Создать ссылку
            </Button>
          </div>

          <Separator />

          {/* Список ссылок */}
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Активные ссылки</p>

            {linksLoading && (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            )}

            {!linksLoading && links.filter(l => l.isActive).length === 0 && (
              <p className="text-sm text-muted-foreground py-3 text-center">
                Нет активных ссылок-приглашений
              </p>
            )}

            {links.filter(l => l.isActive).map(link => {
              const url = `${typeof window !== "undefined" ? window.location.origin : ""}/invite/${link.token}`
              const roleCfg    = ROLE_CONFIG[link.role as TeamRole]
              const usageLabel = link.maxUses === null
                ? `${link.usesCount} / ∞`
                : `${link.usesCount} / ${link.maxUses}`
              const expiresLabel = link.expiresAt
                ? `до ${new Date(link.expiresAt).toLocaleDateString("ru-RU")}`
                : "бессрочно"

              return (
                <div key={link.id} className="flex items-center gap-3 rounded-lg border bg-card p-3">
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {roleCfg && (
                        <span className={cn(
                          "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border-transparent",
                          roleCfg.color
                        )}>
                          {roleCfg.label}
                        </span>
                      )}
                      {link.label && (
                        <span className="text-xs text-muted-foreground italic">&laquo;{link.label}&raquo;</span>
                      )}
                      <span className="text-xs text-muted-foreground">{expiresLabel}</span>
                      <span className="text-xs text-muted-foreground">использований: {usageLabel}</span>
                    </div>
                    <p className="text-xs text-muted-foreground font-mono truncate">{url}</p>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7"
                      onClick={() => copyLink(link.token)}
                      title="Скопировать ссылку"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7"
                      onClick={() => window.open(`/invite/${link.token}`, "_blank")}
                      title="Открыть ссылку"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost" size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => revokeLink(link.id)}
                      title="Деактивировать"
                    >
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              )
            })}

            {/* Неактивные ссылки */}
            {links.filter(l => !l.isActive).length > 0 && (
              <details className="mt-3">
                <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
                  Неактивные ссылки ({links.filter(l => !l.isActive).length})
                </summary>
                <div className="mt-2 space-y-1.5">
                  {links.filter(l => !l.isActive).map(link => (
                    <div
                      key={link.id}
                      className="flex items-center gap-3 rounded-lg border border-dashed bg-muted/20 p-2.5 opacity-60"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs opacity-60">
                            {ROLE_CONFIG[link.role as TeamRole]?.label ?? link.role}
                          </Badge>
                          {link.label && (
                            <span className="text-xs text-muted-foreground">&laquo;{link.label}&raquo;</span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground font-mono truncate mt-0.5">
                          ...{link.token.slice(-8)}
                        </p>
                      </div>
                      <Badge variant="outline" className="text-xs shrink-0">Деактивирована</Badge>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ═══ Диалог «Добавить участника вручную» ═════════════════════════
          Создаёт реального user'а через POST /api/team (с генерацией
          временного пароля). В отличие от Invite — без email-уведомления. */}
      <Dialog open={addOpen} onOpenChange={(o) => { if (!addBusy) setAddOpen(o) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5" />
              Добавить участника
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-sm">Полное имя</Label>
              <Input value={addName} onChange={(e) => setAddName(e.target.value)} placeholder="Иван Иванов" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Email</Label>
              <Input type="email" value={addEmail} onChange={(e) => setAddEmail(e.target.value)} placeholder="user@example.com" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Роль</Label>
              <Select value={addRole} onValueChange={(v) => setAddRole(v as TeamRole)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="director">Директор</SelectItem>
                  <SelectItem value="hr_manager">HR-менеджер</SelectItem>
                  <SelectItem value="department_head">Руководитель отдела</SelectItem>
                  <SelectItem value="observer">Наблюдатель</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Фото (необязательно)</Label>
              <input
                ref={addFileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => setAddAvatarFile(e.target.files?.[0] ?? null)}
              />
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => addFileInputRef.current?.click()} className="gap-1.5">
                  <Camera className="w-3.5 h-3.5" />
                  {addAvatarFile ? "Заменить" : "Выбрать файл"}
                </Button>
                {addAvatarFile && (
                  <>
                    <span className="text-xs text-muted-foreground truncate flex-1">{addAvatarFile.name}</span>
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => setAddAvatarFile(null)}>
                      <X className="w-3 h-3" />
                    </Button>
                  </>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">jpg / png / webp, до 2 МБ</p>
            </div>
            <p className="text-[11px] text-muted-foreground border-t pt-2">
              Будет сгенерирован временный пароль. Скопируйте его из уведомления —
              после закрытия пароль не покажется снова.
            </p>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setAddOpen(false)} disabled={addBusy}>Отмена</Button>
              <Button onClick={handleAddMember} disabled={addBusy || !addName.trim() || !addEmail.trim()}>
                {addBusy ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Plus className="w-4 h-4 mr-1.5" />}
                Добавить
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ═══ Диалог приглашения по email ════════════════════════════════ */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="w-5 h-5" />
              Пригласить участника
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label className="text-sm">Email</Label>
              <Input
                type="email"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                placeholder="colleague@romashka.ru"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">Роль</Label>
              <Select value={inviteRole} onValueChange={v => setInviteRole(v as TeamRole)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.entries(ROLE_CONFIG) as [TeamRole, typeof ROLE_CONFIG[TeamRole]][]).map(([key, cfg]) => (
                    <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{ROLE_CONFIG[inviteRole].description}</p>
            </div>

            <div className="space-y-2">
              <Label className="text-sm">Доступные вакансии</Label>
              {vacancyCategories.length === 0 ? (
                <p className="text-xs text-muted-foreground">Нет созданных вакансий</p>
              ) : (
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {vacancyCategories.map(cat => (
                    <div key={cat.id}>
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-1 pt-2 mb-1">{cat.name}</p>
                      {cat.items.map(vac => (
                        <label key={vac.id} className="flex items-start gap-2 px-1 py-1.5 cursor-pointer hover:bg-muted/20 rounded w-full">
                          <Checkbox
                            checked={inviteVacancyIds.includes(vac.id)}
                            onCheckedChange={() => toggleInviteVacancy(vac.id)}
                            className="mt-0.5 shrink-0"
                          />
                          <span className="text-sm text-foreground break-words">{vac.name}</span>
                        </label>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Button className="w-full gap-1.5" onClick={handleInvite}>
              <Mail className="w-4 h-4" />
              Отправить приглашение
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

// ─── Expandable Member Row ──────────────────────────────────

function MemberRow({
  member,
  roleCfg,
  isActive,
  isExpanded,
  onToggle,
  editRole,
  editPermissions,
  onRoleChange,
  onPermissionChange,
  onSave,
  onResetPassword,
  onBlock,
  onDelete,
  confirmDeleteId,
  setConfirmDeleteId,
}: {
  member: TeamMember
  roleCfg: { label: string; description: string; color: string }
  isActive: boolean
  isExpanded: boolean
  onToggle: () => void
  editRole: TeamRole
  editPermissions: Record<string, boolean>
  onRoleChange: (r: TeamRole) => void
  onPermissionChange: (key: string, val: boolean) => void
  onSave: () => void
  onResetPassword: () => void
  onBlock: () => void
  onDelete: () => void
  confirmDeleteId: string | null
  setConfirmDeleteId: (id: string | null) => void
}) {
  const isFullAccess = editRole === "director" || editRole === "hr_lead"
  const isConfirmingDelete = confirmDeleteId === member.id

  return (
    <>
      <DataRow
        className={cn(
          "cursor-pointer",
          isExpanded && "bg-muted/30"
        )}
        onClick={onToggle}
      >
        <DataCell>
          <div className="flex items-center gap-3">
            <Avatar className="w-8 h-8 shrink-0">
              {member.avatarUrl && (
                <AvatarImage src={member.avatarUrl} alt={member.name} />
              )}
              <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">
                {member.avatar}
              </AvatarFallback>
            </Avatar>
            <span className="text-sm font-medium text-foreground truncate">{member.name}</span>
          </div>
        </DataCell>
        <DataCell>
          <span className={cn(
            "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border-transparent whitespace-nowrap",
            roleCfg.color
          )}>
            {roleCfg.label}
          </span>
        </DataCell>
        <DataCell className="text-muted-foreground truncate">{member.email}</DataCell>
        <DataCell align="center">
          <span className="inline-flex items-center gap-1.5 text-xs">
            <span className={cn(
              "w-2 h-2 rounded-full shrink-0",
              member.status === "disabled"
                ? "bg-red-500"
                : member.role === "employee" || member.status === "pending"
                  ? "bg-yellow-500"
                  : isActive ? "bg-emerald-500" : "bg-gray-400"
            )} />
            <span className={cn(
              "whitespace-nowrap",
              member.status === "disabled"
                ? "text-red-600 dark:text-red-400"
                : member.role === "employee" || member.status === "pending"
                  ? "text-yellow-600 dark:text-yellow-400"
                  : isActive ? "text-foreground" : "text-muted-foreground"
            )}>
              {member.status === "disabled"
                ? "Заблокирован"
                : member.role === "employee" || member.status === "pending"
                  ? "Ожидает"
                  : isActive ? "Активен" : "Не в сети"}
            </span>
          </span>
        </DataCell>
        <DataCell align="center">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={(e) => { e.stopPropagation(); onToggle() }}
          >
            <ChevronDown className={cn("w-4 h-4 transition-transform", isExpanded && "rotate-180")} />
          </Button>
        </DataCell>
      </DataRow>

      {/* Expandable content */}
      {isExpanded && (
        <tr className="border-b border-border/50">
          <td colSpan={5} className="p-0">
            <div className="bg-muted/20 px-6 py-4 space-y-4">
              <div className="flex flex-col lg:flex-row gap-6">
                {/* Роль */}
                <div className="space-y-1.5 min-w-[200px]">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Роль</Label>
                  <Select value={editRole} onValueChange={(v) => onRoleChange(v as TeamRole)}>
                    <SelectTrigger className="h-9 w-full bg-background border rounded-lg" onClick={e => e.stopPropagation()}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.entries(ROLE_CONFIG) as [TeamRole, typeof ROLE_CONFIG[TeamRole]][]).map(([key, cfg]) => (
                        <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">{ROLE_CONFIG[editRole].description}</p>
                </div>

                {/* Права доступа — 6 чекбоксов в 2 колонки */}
                <div className="flex-1 space-y-1.5">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Права доступа</Label>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                    {PERMISSIONS_CONFIG.map(perm => (
                      <label
                        key={perm.key}
                        className="flex items-center gap-2 py-1.5 cursor-pointer"
                        onClick={e => e.stopPropagation()}
                      >
                        <Checkbox
                          checked={isFullAccess ? true : !!editPermissions[perm.key]}
                          disabled={isFullAccess}
                          onCheckedChange={(checked) => onPermissionChange(perm.key, !!checked)}
                        />
                        <span className="text-sm text-foreground">{perm.label}</span>
                      </label>
                    ))}
                  </div>
                  {isFullAccess && (
                    <p className="text-xs text-muted-foreground">Для этой роли все права включены автоматически</p>
                  )}
                </div>
              </div>

              {/* Кнопки действий */}
              <div className="flex items-center gap-2 pt-2 border-t border-border/50">
                <Button size="sm" className="gap-1.5" onClick={(e) => { e.stopPropagation(); onSave() }}>
                  <Save className="w-3.5 h-3.5" />
                  Сохранить
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={(e) => { e.stopPropagation(); onResetPassword() }}
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  Сбросить пароль
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    "gap-1.5",
                    member.status === "disabled"
                      ? "text-emerald-600 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/20"
                      : "text-orange-600 hover:text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950/20"
                  )}
                  onClick={(e) => { e.stopPropagation(); onBlock() }}
                >
                  <Ban className="w-3.5 h-3.5" />
                  {member.status === "disabled" ? "Разблокировать" : "Заблокировать"}
                </Button>

                <div className="ml-auto">
                  {!isConfirmingDelete ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(member.id) }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Удалить
                    </Button>
                  ) : (
                    <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                      <span className="text-xs text-destructive font-medium flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        Удалить {member.name}?
                      </span>
                      <Button size="sm" variant="destructive" className="h-7 px-3 text-xs" onClick={onDelete}>
                        Да, удалить
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 px-3 text-xs" onClick={() => setConfirmDeleteId(null)}>
                        Отмена
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
