"use client"

import { useState } from "react"
import { DashboardSidebar } from "@/components/dashboard/sidebar"
import { DashboardHeader } from "@/components/dashboard/header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Checkbox } from "@/components/ui/checkbox"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import {
  Users, Plus, Settings, Trash2, Save, Shield, Eye, UserPlus,
  Mail, AlertTriangle, Check, ChevronRight, Crown, Briefcase,
  Building2, CalendarClock,
} from "lucide-react"

// ─── Типы ────────────────────────────────────────────────────

type TeamRole =
  | "owner"
  | "client_manager"
  | "hr_lead"
  | "hr_manager"
  | "department_head"
  | "observer"

type MemberStatus = "active" | "invited" | "disabled"
type CandidateVisibility = "own" | "all" | "categories"

interface TeamMember {
  id: string
  name: string
  email: string
  role: TeamRole
  status: MemberStatus
  avatar: string
  categories: string[]
  candidateVisibility: CandidateVisibility
  substituteId?: string
}

// ─── Конфиг ролей ───────────────────────────────────────────

const ROLE_CONFIG: Record<TeamRole, { label: string; description: string; color: string; source: string }> = {
  owner: {
    label: "Владелец",
    description: "Полный доступ без ограничений + управление тарифом",
    color: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800",
    source: "Платформа",
  },
  client_manager: {
    label: "Клиентский менеджер",
    description: "Ведение воронки назначенных клиентов, помощь и контроль",
    color: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800",
    source: "Платформа",
  },
  hr_lead: {
    label: "HR-менеджер (главный)",
    description: "Видит всех кандидатов + управление командой клиента",
    color: "bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-200 dark:border-purple-800",
    source: "Клиент",
  },
  hr_manager: {
    label: "HR-менеджер",
    description: "Работа с кандидатами (настраивается по категориям)",
    color: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800",
    source: "Клиент",
  },
  department_head: {
    label: "Руководитель отдела",
    description: "Просмотр своей категории + одобрение/отклонение",
    color: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800",
    source: "Клиент",
  },
  observer: {
    label: "Наблюдатель",
    description: "Только просмотр аналитики",
    color: "bg-muted text-muted-foreground border-border",
    source: "Клиент",
  },
}

const STATUS_CONFIG: Record<MemberStatus, { label: string; icon: typeof Check; color: string }> = {
  active: { label: "Активен", icon: Check, color: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800" },
  invited: { label: "Приглашён", icon: CalendarClock, color: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800" },
  disabled: { label: "Отключён", icon: AlertTriangle, color: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800" },
}

const VACANCY_CATEGORIES = [
  { id: "sales", name: "Продажи" },
  { id: "it", name: "IT" },
  { id: "operations", name: "Операции" },
  { id: "marketing", name: "Маркетинг" },
  { id: "hr", name: "HR" },
  { id: "finance", name: "Финансы" },
]

// ─── Тестовые данные ────────────────────────────────────────

const INITIAL_MEMBERS: TeamMember[] = [
  { id: "m1", name: "Анна Иванова", email: "anna@romashka.ru", role: "hr_lead", status: "active", avatar: "АИ", categories: ["sales", "it", "operations", "marketing", "hr", "finance"], candidateVisibility: "all" },
  { id: "m2", name: "Дмитрий Козлов", email: "dmitry@romashka.ru", role: "hr_manager", status: "active", avatar: "ДК", categories: ["sales", "it"], candidateVisibility: "own" },
  { id: "m3", name: "Михаил Романов", email: "mikhail@romashka.ru", role: "department_head", status: "active", avatar: "МР", categories: ["sales"], candidateVisibility: "categories" },
  { id: "m4", name: "Ольга Тихонова", email: "olga@romashka.ru", role: "observer", status: "invited", avatar: "ОТ", categories: [], candidateVisibility: "all" },
]

// ─── Компонент ──────────────────────────────────────────────

export default function TeamPage() {
  const [members, setMembers] = useState<TeamMember[]>(INITIAL_MEMBERS)
  const [editMember, setEditMember] = useState<TeamMember | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Invite form
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState<TeamRole>("hr_manager")
  const [inviteCategories, setInviteCategories] = useState<string[]>([])

  const openEdit = (member: TeamMember) => {
    setEditMember({ ...member })
    setSheetOpen(true)
    setConfirmDelete(false)
  }

  const handleSaveMember = () => {
    if (!editMember) return
    setMembers(prev => prev.map(m => m.id === editMember.id ? editMember : m))
    setSheetOpen(false)
    toast.success(`Настройки ${editMember.name} сохранены`)
  }

  const handleDeleteMember = () => {
    if (!editMember) return
    setMembers(prev => prev.filter(m => m.id !== editMember.id))
    setSheetOpen(false)
    toast.error(`${editMember.name} удалён из команды`)
  }

  const handleInvite = () => {
    if (!inviteEmail) {
      toast.error("Введите email")
      return
    }
    const initials = inviteEmail.slice(0, 2).toUpperCase()
    const newMember: TeamMember = {
      id: `m-${Date.now()}`,
      name: inviteEmail.split("@")[0],
      email: inviteEmail,
      role: inviteRole,
      status: "invited",
      avatar: initials,
      categories: inviteCategories,
      candidateVisibility: inviteRole === "observer" ? "all" : "own",
    }
    setMembers(prev => [...prev, newMember])
    setInviteOpen(false)
    setInviteEmail("")
    setInviteCategories([])
    toast.success(`Приглашение отправлено на ${inviteEmail}`)
  }

  const updateEdit = (patch: Partial<TeamMember>) => {
    setEditMember(prev => prev ? { ...prev, ...patch } : null)
  }

  const toggleEditCategory = (catId: string) => {
    if (!editMember) return
    const cats = editMember.categories.includes(catId)
      ? editMember.categories.filter(c => c !== catId)
      : [...editMember.categories, catId]
    updateEdit({ categories: cats })
  }

  const toggleInviteCategory = (catId: string) => {
    setInviteCategories(prev =>
      prev.includes(catId) ? prev.filter(c => c !== catId) : [...prev, catId]
    )
  }

  return (
    <SidebarProvider defaultOpen={true}>
      <DashboardSidebar />
      <SidebarInset>
        <DashboardHeader />
        <main className="flex-1 overflow-auto bg-background">
          <div className="p-4 sm:p-6 max-w-5xl">
            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
              <div>
                <h1 className="text-2xl font-semibold text-foreground mb-1">Команда</h1>
                <p className="text-muted-foreground text-sm">Управление участниками и ролями</p>
              </div>
              <Button className="gap-1.5" onClick={() => setInviteOpen(true)}>
                <Plus className="w-4 h-4" />
                Пригласить участника
              </Button>
            </div>

            {/* Таблица участников */}
            <Card className="mb-8">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Участник</th>
                        <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Роль</th>
                        <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">Email</th>
                        <th className="text-center text-xs font-semibold text-muted-foreground px-4 py-3">Статус</th>
                        <th className="text-center text-xs font-semibold text-muted-foreground px-4 py-3">Действия</th>
                      </tr>
                    </thead>
                    <tbody>
                      {members.map(member => {
                        const roleCfg = ROLE_CONFIG[member.role]
                        const statusCfg = STATUS_CONFIG[member.status]
                        const StatusIcon = statusCfg.icon
                        return (
                          <tr key={member.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <Avatar className="w-8 h-8 shrink-0">
                                  <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">
                                    {member.avatar}
                                  </AvatarFallback>
                                </Avatar>
                                <span className="text-sm font-medium text-foreground">{member.name}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="space-y-1">
                                <Badge variant="outline" className={cn("text-xs", roleCfg.color)}>
                                  {roleCfg.label}
                                </Badge>
                                <p className="text-[10px] text-muted-foreground">{roleCfg.source}</p>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm text-muted-foreground">{member.email}</td>
                            <td className="text-center px-4 py-3">
                              <Badge variant="outline" className={cn("text-xs", statusCfg.color)}>
                                <StatusIcon className="w-3 h-3 mr-1" />
                                {statusCfg.label}
                              </Badge>
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

            {/* Роли и права */}
            <h3 className="text-lg font-semibold text-foreground mb-4">Роли и права</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-8">
              {(Object.entries(ROLE_CONFIG) as [TeamRole, typeof ROLE_CONFIG[TeamRole]][]).map(([key, cfg]) => (
                <Card key={key} className="transition-all hover:shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5", cfg.color)}>
                        {key === "owner" && <Crown className="w-4 h-4" />}
                        {key === "client_manager" && <Building2 className="w-4 h-4" />}
                        {key === "hr_lead" && <Shield className="w-4 h-4" />}
                        {key === "hr_manager" && <Briefcase className="w-4 h-4" />}
                        {key === "department_head" && <Users className="w-4 h-4" />}
                        {key === "observer" && <Eye className="w-4 h-4" />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-foreground">{cfg.label}</p>
                          <Badge variant="outline" className="text-[10px]">{cfg.source}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{cfg.description}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </main>
      </SidebarInset>

      {/* ═══ Sheet редактирования участника ════════════════════ */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Настройки участника</SheetTitle>
          </SheetHeader>

          {editMember && (
            <div className="space-y-6 mt-6">
              {/* Info */}
              <div className="flex items-center gap-3">
                <Avatar className="w-12 h-12">
                  <AvatarFallback className="bg-primary/10 text-primary font-medium">
                    {editMember.avatar}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium text-foreground">{editMember.name}</p>
                  <p className="text-sm text-muted-foreground">{editMember.email}</p>
                </div>
              </div>

              <Separator />

              {/* Роль */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Роль</Label>
                <Select value={editMember.role} onValueChange={(v) => updateEdit({ role: v as TeamRole })}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.entries(ROLE_CONFIG) as [TeamRole, typeof ROLE_CONFIG[TeamRole]][]).map(([key, cfg]) => (
                      <SelectItem key={key} value={key}>
                        <span>{cfg.label}</span>
                        <span className="text-muted-foreground ml-1 text-xs">({cfg.source})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{ROLE_CONFIG[editMember.role].description}</p>
              </div>

              <Separator />

              {/* Категории вакансий */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">Категории вакансий</Label>
                <div className="space-y-2">
                  {VACANCY_CATEGORIES.map(cat => (
                    <label key={cat.id} className="flex items-center gap-2.5 cursor-pointer">
                      <Checkbox
                        checked={editMember.categories.includes(cat.id)}
                        onCheckedChange={() => toggleEditCategory(cat.id)}
                      />
                      <span className="text-sm text-foreground">{cat.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              <Separator />

              {/* Видимость кандидатов */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">Видимость кандидатов</Label>
                <div className="space-y-2">
                  {([
                    { value: "own" as const, label: "Только свои", desc: "Видит только добавленных собой" },
                    { value: "all" as const, label: "Все кандидаты", desc: "Полный доступ ко всем кандидатам" },
                    { value: "categories" as const, label: "Выбранные категории", desc: "Только по назначенным категориям" },
                  ]).map(opt => (
                    <button
                      key={opt.value}
                      className={cn(
                        "w-full flex items-start gap-3 p-3 rounded-lg border text-left transition-all",
                        editMember.candidateVisibility === opt.value
                          ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                          : "border-border hover:border-primary/30"
                      )}
                      onClick={() => updateEdit({ candidateVisibility: opt.value })}
                    >
                      <div className={cn(
                        "w-4 h-4 rounded-full border-2 mt-0.5 shrink-0 flex items-center justify-center",
                        editMember.candidateVisibility === opt.value ? "border-primary" : "border-muted-foreground/40"
                      )}>
                        {editMember.candidateVisibility === opt.value && <div className="w-2 h-2 rounded-full bg-primary" />}
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

              {/* Замещение */}
              <div className="space-y-2">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <CalendarClock className="w-4 h-4 text-muted-foreground" />
                  Замещение (на период отпуска)
                </Label>
                <Select
                  value={editMember.substituteId || "none"}
                  onValueChange={(v) => updateEdit({ substituteId: v === "none" ? undefined : v })}
                >
                  <SelectTrigger className="h-9">
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

              {/* Кнопки */}
              <div className="space-y-3 pt-2">
                <Button className="w-full gap-1.5" onClick={handleSaveMember}>
                  <Save className="w-4 h-4" />
                  Сохранить
                </Button>

                {!confirmDelete ? (
                  <Button
                    variant="outline"
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
                      <Button
                        size="sm"
                        variant="destructive"
                        className="flex-1"
                        onClick={handleDeleteMember}
                      >
                        Удалить
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1"
                        onClick={() => setConfirmDelete(false)}
                      >
                        Отмена
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* ═══ Диалог приглашения ════════════════════════════════ */}
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
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.entries(ROLE_CONFIG) as [TeamRole, typeof ROLE_CONFIG[TeamRole]][]).map(([key, cfg]) => (
                    <SelectItem key={key} value={key}>
                      {cfg.label} ({cfg.source})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {ROLE_CONFIG[inviteRole].description}
              </p>
            </div>

            <div className="space-y-2">
              <Label className="text-sm">Категории вакансий</Label>
              <div className="grid grid-cols-2 gap-2">
                {VACANCY_CATEGORIES.map(cat => (
                  <label key={cat.id} className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={inviteCategories.includes(cat.id)}
                      onCheckedChange={() => toggleInviteCategory(cat.id)}
                    />
                    <span className="text-sm text-foreground">{cat.name}</span>
                  </label>
                ))}
              </div>
            </div>

            <Button className="w-full gap-1.5" onClick={handleInvite}>
              <Mail className="w-4 h-4" />
              Отправить приглашение
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  )
}
