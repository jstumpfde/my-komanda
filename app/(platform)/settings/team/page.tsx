"use client"

import { useState, useRef } from "react"
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
import {
  Users, Plus, Settings, Trash2, Save, UserPlus,
  Mail, AlertTriangle, Check,
  CalendarClock, Link2, Copy, X,
  Loader2, ExternalLink, Camera,
} from "lucide-react"
import { getVacancyCategories } from "@/lib/vacancy-storage"
import { useLocalStorage } from "@/hooks/use-local-storage"

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

// ─── Тестовые данные ────────────────────────────────────────

const INITIAL_MEMBERS: TeamMember[] = [
  { id: "m1", name: "Анна Иванова",   email: "anna@romashka.ru",    role: "hr_lead",         status: "active",  avatar: "АИ", avatarUrl: undefined, vacancyIds: [], categories: [], candidateVisibility: "all" },
  { id: "m2", name: "Дмитрий Козлов", email: "dmitry@romashka.ru",  role: "hr_manager",      status: "active",  avatar: "ДК", avatarUrl: undefined, vacancyIds: [], categories: [], candidateVisibility: "own" },
  { id: "m3", name: "Михаил Романов", email: "mikhail@romashka.ru", role: "department_head", status: "active",  avatar: "МР", avatarUrl: undefined, vacancyIds: [], categories: [], candidateVisibility: "categories" },
  { id: "m4", name: "Ольга Тихонова", email: "olga@romashka.ru",    role: "observer",        status: "invited", avatar: "ОТ", avatarUrl: undefined, vacancyIds: [], categories: [], candidateVisibility: "all" },
]

// ─── Компонент ──────────────────────────────────────────────

export default function TeamPage() {
  const [members, setMembers] = useLocalStorage<TeamMember[]>("team-members", INITIAL_MEMBERS)
  const [editMember, setEditMember]   = useState<TeamMember | null>(null)
  const [sheetOpen, setSheetOpen]     = useState(false)
  const [inviteOpen, setInviteOpen]   = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const vacancyCategories = getVacancyCategories()
  const allVacancies = vacancyCategories.flatMap(cat => cat.items)
  const avatarInputRef = useRef<HTMLInputElement>(null)

  // Join link state
  const [joinCode] = useState("demo-abc123")
  const [joinEnabled, setJoinEnabled] = useState(true)

  // Edit permissions state
  const [editPermissions, setEditPermissions] = useState<Record<string, boolean>>({
    manage_company: false,
    manage_team: false,
    manage_billing: false,
    create_vacancies: false,
    edit_knowledge: false,
    view_analytics: false,
  })

  // Invite by email form
  const [inviteEmail, setInviteEmail]           = useState("")
  const [inviteRole, setInviteRole]             = useState<TeamRole>("hr_manager")
  const [inviteVacancyIds, setInviteVacancyIds] = useState<string[]>([])

  // ── Invite links state ──────────────────────────────────
  const [linkDialogOpen, setLinkDialogOpen] = useState(false)
  const [links, setLinks]                   = useState<InviteLink[]>([])
  const [linksLoading, setLinksLoading]     = useState(false)
  const [linkRole, setLinkRole]             = useState<TeamRole>("hr_manager")
  const [linkLabel, setLinkLabel]           = useState("")
  const [linkMaxUses, setLinkMaxUses]       = useState<string>("1")
  const [linkExpireDays, setLinkExpireDays] = useState<string>("7")
  const [creating, setCreating]             = useState(false)

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

  // ── Member CRUD ──────────────────────────────────────────

  const openEdit = (member: TeamMember) => {
    setEditMember({ ...member })
    setEditPermissions({
      manage_company: false,
      manage_team: false,
      manage_billing: false,
      create_vacancies: false,
      edit_knowledge: false,
      view_analytics: false,
      ...(member.permissions ?? {}),
    })
    setSheetOpen(true)
    setConfirmDelete(false)
  }

  const handleSaveMember = () => {
    if (!editMember) return
    const updated = { ...editMember, permissions: editPermissions }
    setMembers(prev => prev.map(m => m.id === updated.id ? updated : m))
    setSheetOpen(false)
    toast.success(`Настройки ${editMember.name} сохранены`)
  }

  const handleDeleteMember = () => {
    if (!editMember) return
    setMembers(prev => prev.filter(m => m.id !== editMember.id))
    setSheetOpen(false)
    toast.error(`${editMember.name} удален из команды`)
  }

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

  const updateEdit = (patch: Partial<TeamMember>) =>
    setEditMember(prev => prev ? { ...prev, ...patch } : null)

  const toggleEditVacancy = (vacId: string) => {
    if (!editMember) return
    const ids = editMember.vacancyIds.includes(vacId)
      ? editMember.vacancyIds.filter(v => v !== vacId)
      : [...editMember.vacancyIds, vacId]
    updateEdit({ vacancyIds: ids })
  }

  const toggleInviteVacancy = (vacId: string) =>
    setInviteVacancyIds(prev =>
      prev.includes(vacId) ? prev.filter(v => v !== vacId) : [...prev, vacId]
    )

  // ── Avatar upload ────────────────────────────────────────

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!editMember) return
    const file = e.target.files?.[0]
    if (!file) return

    const formData = new FormData()
    formData.append("file", file)
    formData.append("userId", editMember.id)

    try {
      const res = await fetch("/api/team/avatar", {
        method: "POST",
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Ошибка загрузки")
      const newUrl = data.avatarUrl ?? URL.createObjectURL(file)
      updateEdit({ avatarUrl: newUrl })
      setMembers(prev => prev.map(m => m.id === editMember.id ? { ...m, avatarUrl: newUrl } : m))
      toast.success("Фото профиля обновлено")
    } catch {
      // Fallback: use local object URL if API not available
      const localUrl = URL.createObjectURL(file)
      updateEdit({ avatarUrl: localUrl })
      setMembers(prev => prev.map(m => m.id === editMember.id ? { ...m, avatarUrl: localUrl } : m))
      toast.success("Фото профиля обновлено")
    }

    // Reset input
    if (avatarInputRef.current) avatarInputRef.current.value = ""
  }

  const handleAvatarDelete = async () => {
    if (!editMember) return
    try {
      await fetch("/api/team/avatar", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: editMember.id }),
      })
    } catch {
      // Ignore API errors, still remove locally
    }
    updateEdit({ avatarUrl: undefined })
    setMembers(prev => prev.map(m => m.id === editMember.id ? { ...m, avatarUrl: undefined } : m))
    toast.success("Фото профиля удалено")
  }

  // ── Select all / deselect all vacancies ──────────────────

  const handleSelectAllVacancies = () => {
    if (!editMember) return
    const allIds = allVacancies.map(v => v.id)
    const allSelected = allIds.every(id => editMember.vacancyIds.includes(id))
    updateEdit({ vacancyIds: allSelected ? [] : allIds })
  }

  // ─── Render ─────────────────────────────────────────────

  return (
    <>
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-foreground mb-1">Команда</h1>
          <p className="text-muted-foreground text-sm">Управление участниками и ролями</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="gap-1.5" onClick={openLinkDialog}>
            <Link2 className="w-4 h-4" />
            Ссылка-приглашение
          </Button>
          <Button className="gap-1.5" onClick={() => setInviteOpen(true)}>
            <Plus className="w-4 h-4" />
            Пригласить участника
          </Button>
        </div>
      </div>

      {/* Ссылка для присоединения */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Ссылка для присоединения к компании</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Любой сотрудник может присоединиться по этой ссылке. После регистрации он попадёт в компанию с ролью &laquo;Сотрудник&raquo; — настройте права в карточке.
          </p>
          <div className="flex items-center gap-2">
            <div className="bg-muted px-3 py-2 rounded-lg font-mono text-sm flex-1 truncate">
              company24.pro/join/{joinCode}
            </div>
            <Button
              variant="outline"
              size="icon"
              className="shrink-0"
              onClick={() => {
                navigator.clipboard.writeText(`company24.pro/join/${joinCode}`)
                toast.success("Ссылка скопирована")
              }}
            >
              <Copy className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={joinEnabled} onCheckedChange={setJoinEnabled} />
            <span className="text-sm text-foreground">Ссылка активна</span>
          </div>
        </CardContent>
      </Card>

      {/* Таблица участников */}
      <Card className="mb-8">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full table-fixed">
              <thead>
                <tr className="bg-muted/50 border-b">
                  <th className="text-left uppercase text-xs font-medium text-muted-foreground tracking-wider px-4 py-3">Участник</th>
                  <th className="text-left uppercase text-xs font-medium text-muted-foreground tracking-wider px-4 py-3 w-[180px]">Роль</th>
                  <th className="text-left uppercase text-xs font-medium text-muted-foreground tracking-wider px-4 py-3 w-[250px]">Email</th>
                  <th className="text-center uppercase text-xs font-medium text-muted-foreground tracking-wider px-4 py-3 w-[120px]">Статус</th>
                  <th className="text-center uppercase text-xs font-medium text-muted-foreground tracking-wider px-4 py-3 w-[80px]">Действия</th>
                </tr>
              </thead>
              <tbody>
                {members.map(member => {
                  const roleCfg = ROLE_CONFIG[member.role]
                  const isActive = member.status === "active"
                  return (
                    <tr key={member.id} className="border-b border-border/50 last:border-0 hover:bg-muted/50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar className="w-8 h-8 shrink-0">
                            {member.avatarUrl && (
                              <AvatarImage src={member.avatarUrl} alt={member.name} />
                            )}
                            <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">
                              {member.avatar}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-sm font-medium text-foreground">{member.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn(
                          "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border-transparent",
                          roleCfg.color
                        )}>
                          {roleCfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{member.email}</td>
                      <td className="text-center px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 text-xs">
                          <span className={cn(
                            "w-2 h-2 rounded-full shrink-0",
                            member.role === "employee" || member.status === "pending"
                              ? "bg-yellow-500"
                              : isActive ? "bg-emerald-500" : "bg-gray-400"
                          )} />
                          <span className={
                            member.role === "employee" || member.status === "pending"
                              ? "text-yellow-600 dark:text-yellow-400"
                              : isActive ? "text-foreground" : "text-muted-foreground"
                          }>
                            {member.role === "employee" || member.status === "pending"
                              ? "Ожидает настройки"
                              : isActive ? "Активен" : "Не в сети"}
                          </span>
                        </span>
                      </td>
                      <td className="text-center px-4 py-3">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(member)}>
                          <Settings className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* ═══ Диалог ссылок-приглашений ══════════════════════════════ */}
      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="w-5 h-5" />
              Ссылки-приглашения
            </DialogTitle>
          </DialogHeader>

          {/* Форма создания */}
          <div className="rounded-xl border bg-muted/30 p-4 space-y-4">
            <p className="text-sm font-medium text-foreground">Создать новую ссылку</p>

            <div className="grid grid-cols-2 gap-3">
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

      {/* ═══ Диалог редактирования участника ════════════════════ */}
      <Dialog open={sheetOpen} onOpenChange={setSheetOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Настройки участника</DialogTitle>
          </DialogHeader>

          {editMember && (
            <div className="space-y-6 mt-2">
              {/* Avatar section */}
              <div className="flex flex-col items-center gap-2">
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarUpload}
                />
                <button
                  type="button"
                  className="relative group cursor-pointer"
                  onClick={() => avatarInputRef.current?.click()}
                >
                  <Avatar className="w-16 h-16">
                    {editMember.avatarUrl && (
                      <AvatarImage src={editMember.avatarUrl} alt={editMember.name} />
                    )}
                    <AvatarFallback className="bg-primary/10 text-primary text-lg font-medium">
                      {editMember.avatar}
                    </AvatarFallback>
                  </Avatar>
                  <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Camera className="w-5 h-5 text-white" />
                  </div>
                </button>
                <p className="text-xs text-muted-foreground">Нажмите для загрузки фото</p>
                {editMember.avatarUrl && (
                  <button
                    type="button"
                    className="text-xs text-destructive hover:underline"
                    onClick={handleAvatarDelete}
                  >
                    Удалить фото
                  </button>
                )}
                <p className="font-medium text-foreground">{editMember.name}</p>
                <p className="text-sm text-muted-foreground -mt-1">{editMember.email}</p>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label className="text-sm font-medium">Роль</Label>
                <Select value={editMember.role} onValueChange={(v) => updateEdit({ role: v as TeamRole })}>
                  <SelectTrigger className="h-9 w-full max-w-[280px] bg-[var(--input-bg)] border rounded-lg">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.entries(ROLE_CONFIG) as [TeamRole, typeof ROLE_CONFIG[TeamRole]][]).map(([key, cfg]) => (
                      <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{ROLE_CONFIG[editMember.role].description}</p>
              </div>

              <Separator />

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Доступные вакансии</Label>
                  {allVacancies.length > 0 && (
                    <button
                      type="button"
                      className="text-xs text-primary hover:underline"
                      onClick={handleSelectAllVacancies}
                    >
                      {allVacancies.every(v => editMember.vacancyIds.includes(v.id))
                        ? "Снять все"
                        : "Выбрать все"
                      }
                    </button>
                  )}
                </div>
                {allVacancies.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Нет созданных вакансий</p>
                ) : (
                  <div className="border rounded-lg divide-y max-h-48 overflow-y-auto">
                    {allVacancies.map(vac => (
                      <label key={vac.id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-muted/20 cursor-pointer">
                        <Checkbox
                          checked={editMember.vacancyIds.includes(vac.id)}
                          onCheckedChange={() => toggleEditVacancy(vac.id)}
                        />
                        <span className="text-sm text-foreground flex-1">{vac.name}</span>
                        <span className="text-xs text-muted-foreground">{vac.candidates} канд.</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <Separator />

              <div className="space-y-3">
                <Label className="text-sm font-medium">Видимость кандидатов</Label>
                <div className="space-y-2">
                  {([
                    { value: "own"        as const, label: "Только свои",         desc: "Видит только добавленных собой" },
                    { value: "all"        as const, label: "Все кандидаты",       desc: "Полный доступ ко всем кандидатам" },
                    { value: "categories" as const, label: "Выбранные категории", desc: "Только по назначенным категориям" },
                  ]).map(opt => (
                    <button
                      key={opt.value}
                      className={cn(
                        "w-full flex items-start gap-3 p-3 rounded-lg text-left transition-all",
                        editMember.candidateVisibility === opt.value
                          ? "border-2 border-primary bg-primary/5"
                          : "border border-border hover:border-primary/30"
                      )}
                      onClick={() => updateEdit({ candidateVisibility: opt.value })}
                    >
                      <div className={cn(
                        "w-4 h-4 rounded-full border-2 mt-0.5 shrink-0 flex items-center justify-center",
                        editMember.candidateVisibility === opt.value ? "border-primary" : "border-muted-foreground/40"
                      )}>
                        {editMember.candidateVisibility === opt.value && (
                          <div className="w-2 h-2 rounded-full bg-primary" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">{opt.label}</p>
                        <p className="text-xs text-muted-foreground">{opt.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <Separator />

              <div className="space-y-3">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground font-medium">Права доступа</Label>
                <div className="border rounded-lg divide-y">
                  {([
                    { key: "manage_company", label: "Может настраивать компанию" },
                    { key: "manage_team", label: "Может управлять командой" },
                    { key: "manage_billing", label: "Может управлять тарифом" },
                    { key: "create_vacancies", label: "Может создавать вакансии" },
                    { key: "edit_knowledge", label: "Может редактировать базу знаний" },
                    { key: "view_analytics", label: "Может видеть аналитику" },
                  ] as const).map(perm => {
                    const isFullAccess = editMember.role === "director" || editMember.role === "hr_lead"
                    return (
                      <label key={perm.key} className="flex items-center gap-2.5 px-3 py-2 hover:bg-muted/20 cursor-pointer">
                        <Checkbox
                          checked={isFullAccess ? true : !!editPermissions[perm.key]}
                          disabled={isFullAccess}
                          onCheckedChange={(checked) => {
                            setEditPermissions(prev => ({ ...prev, [perm.key]: !!checked }))
                          }}
                        />
                        <span className="text-sm text-foreground">{perm.label}</span>
                      </label>
                    )
                  })}
                </div>
                {(editMember.role === "director" || editMember.role === "hr_lead") && (
                  <p className="text-xs text-muted-foreground">Для этой роли все права включены по умолчанию</p>
                )}
              </div>

              <Separator />

              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <CalendarClock className="w-4 h-4 text-muted-foreground" />
                  Замещение (на период отпуска)
                </Label>
                <Select
                  value={editMember.substituteId || "none"}
                  onValueChange={(v) => updateEdit({ substituteId: v === "none" ? undefined : v })}
                >
                  <SelectTrigger className="h-9 w-full max-w-[280px] bg-[var(--input-bg)] border rounded-lg">
                    <SelectValue placeholder="Не выбрано" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Не выбрано</SelectItem>
                    {members.filter(m => m.id !== editMember.id && m.status === "active").map(m => (
                      <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Коллега получит доступ к кандидатам и задачам на время отсутствия
                </p>
              </div>

              <Separator />

              <div className="space-y-3 pt-2">
                <Button className="w-full h-10 gap-1.5" onClick={handleSaveMember}>
                  <Save className="w-4 h-4" />
                  Сохранить
                </Button>

                {!confirmDelete ? (
                  <Button
                    variant="ghost"
                    className="w-full gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => setConfirmDelete(true)}
                  >
                    <Trash2 className="w-4 h-4" />
                    Удалить из команды
                  </Button>
                ) : (
                  <div className="p-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30 space-y-2">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-red-600" />
                      <span className="text-sm font-medium text-red-700 dark:text-red-400">
                        Удалить {editMember.name}?
                      </span>
                    </div>
                    <p className="text-xs text-red-600 dark:text-red-400">
                      Участник потеряет доступ ко всем данным. Это действие необратимо.
                    </p>
                    <div className="flex gap-2">
                      <Button size="sm" variant="destructive" className="flex-1" onClick={handleDeleteMember}>
                        Удалить
                      </Button>
                      <Button size="sm" variant="outline" className="flex-1" onClick={() => setConfirmDelete(false)}>
                        Отмена
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
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
