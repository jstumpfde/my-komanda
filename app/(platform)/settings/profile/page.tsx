"use client"

import { useState, useEffect, useRef, Suspense } from "react"
import { useSession } from "next-auth/react"
import { useSearchParams, useRouter, usePathname } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import { Loader2, User, Mail, Lock, Shield, Save, Eye, EyeOff, Camera, Trash2, Clock, MessageCircle, Video } from "lucide-react"
import { ManagerReminderBotCard } from "@/components/telegram/manager-reminder-bot-card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { useAuth, ROLE_LABELS } from "@/lib/auth"
import type { UserCustomSchedule } from "@/lib/db/schema"
import { PasskeySection } from "@/components/settings/passkey-section"

// ─── Helpers ──────────────────────────────────────────────────

const WEEKDAY_IDS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const
const WEEKDAY_SHORT: Record<string, string> = { mon: "Пн", tue: "Вт", wed: "Ср", thu: "Чт", fri: "Пт", sat: "Сб", sun: "Вс" }
const HALF_HOURS = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, "0")}:00`)
  .flatMap((h) => [h, h.replace(":00", ":30")])

type ScheduleDay = { active: boolean; start: string; end: string }
const DEFAULT_DAYS: Record<string, ScheduleDay> = {
  mon: { active: true, start: "09:00", end: "18:00" }, tue: { active: true, start: "09:00", end: "18:00" },
  wed: { active: true, start: "09:00", end: "18:00" }, thu: { active: true, start: "09:00", end: "18:00" },
  fri: { active: true, start: "09:00", end: "18:00" }, sat: { active: false, start: "10:00", end: "15:00" },
  sun: { active: false, start: "10:00", end: "15:00" },
}

const ROLE_COLORS: Record<string, string> = {
  platform_admin: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800",
  platform_manager: "bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-800",
  admin: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800",
  // Бирюзовый — чтобы должность не путалась с фиолетовым «цветом нейросети».
  director: "bg-teal-500/10 text-teal-700 dark:text-teal-400 border-teal-200 dark:border-teal-800",
  client: "bg-teal-500/10 text-teal-700 dark:text-teal-400 border-teal-200 dark:border-teal-800",
  hr_lead: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800",
  hr_manager: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800",
  department_head: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800",
  observer: "bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-200 dark:border-gray-800",
  tester_hr: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800",
  employee: "bg-gray-500/10 text-gray-700 dark:text-gray-400 border-gray-200 dark:border-gray-800",
}

interface UserProfile {
  id: string
  email: string
  name: string
  firstName?: string | null
  lastName?: string | null
  role: string
  companyId: string | null
  avatarUrl: string | null
  customSchedule?: UserCustomSchedule | null
  managerReminderChatId?: string | null
  contactTelegram?: string | null
  contactMax?: string | null
  contactPhone?: string | null
}

export default function ProfileSettingsPage() {
  return (
    <Suspense fallback={null}>
      <ProfileSettingsPageInner />
    </Suspense>
  )
}

function ProfileSettingsPageInner() {
  const { data: session, update: updateSession } = useSession()
  const { role } = useAuth()
  const isOwner = role === "director"

  // Profile state
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loadingProfile, setLoadingProfile] = useState(true)

  // Name form
  const [name, setName] = useState("")
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [savingName, setSavingName] = useState(false)

  // Password form
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)

  // Avatar
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Личный рабочий график (users.custom_schedule)
  const [scheduleDays, setScheduleDays] = useState<Record<string, ScheduleDay>>(DEFAULT_DAYS)
  const [lunch, setLunch] = useState<{ enabled: boolean; start: string; end: string }>({ enabled: false, start: "13:00", end: "14:00" })
  const [savingSchedule, setSavingSchedule] = useState(false)

  const updateScheduleDay = (dayId: string, patch: Partial<ScheduleDay>) =>
    setScheduleDays(prev => ({ ...prev, [dayId]: { ...(prev[dayId] ?? DEFAULT_DAYS[dayId]), ...patch } }))

  // Контакты для оперативной связи с кандидатом (Юрий 10.07) — подставляются
  // в сообщение со ссылкой на встречу («подтвердите получение»).
  const [contactTelegram, setContactTelegram] = useState("")
  const [contactMax, setContactMax] = useState("")
  const [contactPhone, setContactPhone] = useState("")
  const [savingContacts, setSavingContacts] = useState(false)
  const handleSaveContacts = async () => {
    setSavingContacts(true)
    try {
      const res = await fetch("/api/auth/me", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactTelegram, contactMax, contactPhone }),
      })
      if (!res.ok) throw new Error()
      toast.success("Контакты сохранены")
    } catch { toast.error("Не удалось сохранить") }
    finally { setSavingContacts(false) }
  }

  // Личный Zoom менеджера (Юрий 10.07: «каждый менеджер имеет свой Зум») —
  // используется в интервью для авто-создания встречи (event-modal.tsx).
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const [zoomConnected, setZoomConnected] = useState(false)
  const [zoomEmail, setZoomEmail] = useState<string | null>(null)
  const [loadingZoom, setLoadingZoom] = useState(true)
  const [disconnectingZoom, setDisconnectingZoom] = useState(false)

  const loadZoomStatus = () => {
    fetch("/api/integrations/zoom/status")
      .then(r => r.ok ? r.json() : null)
      // apiSuccess отдаёт ПЛОСКИЙ JSON {connected, email} — без обёртки data
      // (баг 11.07: парсили j.data → карточка вечно «Подключить Zoom»).
      .then((j: { connected?: boolean; email?: string | null } | null) => {
        setZoomConnected(!!j?.connected)
        setZoomEmail(j?.email ?? null)
      })
      .catch(() => {})
      .finally(() => setLoadingZoom(false))
  }

  useEffect(() => {
    loadZoomStatus()
    const zoomConnectedParam = searchParams.get("zoomConnected")
    const zoomError = searchParams.get("zoomError")
    if (zoomConnectedParam) { toast.success("Zoom подключён"); router.replace(pathname) }
    if (zoomError) { toast.error("Не удалось подключить Zoom"); router.replace(pathname) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleDisconnectZoom = async () => {
    setDisconnectingZoom(true)
    try {
      const res = await fetch("/api/integrations/zoom/disconnect", { method: "POST" })
      if (!res.ok) throw new Error()
      setZoomConnected(false)
      setZoomEmail(null)
      toast.success("Zoom отключён")
    } catch { toast.error("Не удалось отключить") }
    finally { setDisconnectingZoom(false) }
  }

  const handleSaveSchedule = async () => {
    setSavingSchedule(true)
    try {
      const res = await fetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customSchedule: { enabled: true, days: scheduleDays, lunch } }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(json.error ?? "Ошибка сохранения"); return }
      setProfile(prev => prev ? { ...prev, customSchedule: { enabled: true, days: scheduleDays, lunch } } : prev)
      toast.success("Рабочий график сохранён")
    } catch { toast.error("Ошибка сети") }
    finally { setSavingSchedule(false) }
  }

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { toast.error("Максимум 2 МБ"); return }
    setUploadingAvatar(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch("/api/team/avatar", { method: "POST", body: fd })
      const data = await res.json() as { data?: { avatarUrl?: string } }
      if (res.ok && data.data?.avatarUrl) {
        setAvatarUrl(data.data.avatarUrl)
        await updateSession({})
        toast.success("Фото обновлено")
      } else { toast.error("Ошибка загрузки") }
    } catch { toast.error("Ошибка сети") }
    finally { setUploadingAvatar(false); if (fileInputRef.current) fileInputRef.current.value = "" }
  }

  const handleAvatarDelete = async () => {
    try {
      await fetch("/api/team/avatar", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) })
      setAvatarUrl(null)
      await updateSession({})
      toast.success("Фото удалено")
    } catch { toast.error("Ошибка") }
  }

  // Load profile from API
  useEffect(() => {
    fetch("/api/auth/me")
      .then(res => res.ok ? res.json() : Promise.reject(res))
      .then((data: { data?: UserProfile }) => {
        const p = data.data ?? (data as unknown as UserProfile)
        setProfile(p)
        setName(p.name ?? "")
        setFirstName(p.firstName ?? "")
        setLastName(p.lastName ?? "")
        setAvatarUrl((p as unknown as { avatarUrl?: string }).avatarUrl ?? null)
        setContactTelegram(p.contactTelegram ?? "")
        setContactMax(p.contactMax ?? "")
        setContactPhone(p.contactPhone ?? "")
        if (p.customSchedule?.days) {
          setScheduleDays({ ...DEFAULT_DAYS, ...p.customSchedule.days })
          if (p.customSchedule.lunch) setLunch(p.customSchedule.lunch)
        }
      })
      .catch(() => {
        // Fallback to session data
        if (session?.user) {
          setName(session.user.name ?? "")
        }
      })
      .finally(() => setLoadingProfile(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Save name ────────────────────────────────────────────────
  const handleSaveName = async () => {
    const first = firstName.trim()
    const last = lastName.trim()
    // Если заданы оба — вычисляем name автоматически; иначе берём поле name
    const computedName = (first && last) ? `${first} ${last}` : (first || last || name.trim())
    if (!computedName) {
      toast.error("Имя не может быть пустым")
      return
    }
    setSavingName(true)
    try {
      const res = await fetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName: first || null, lastName: last || null }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error ?? "Ошибка сохранения")
        return
      }
      setProfile(prev => prev ? { ...prev, name: computedName, firstName: first || null, lastName: last || null } : prev)
      setName(computedName)
      await updateSession({})
      toast.success("Имя обновлено")
    } catch {
      toast.error("Ошибка сети")
    } finally {
      setSavingName(false)
    }
  }

  // ── Save password ────────────────────────────────────────────
  const handleSavePassword = async () => {
    if (!currentPassword) {
      toast.error("Введите текущий пароль")
      return
    }
    if (newPassword.length < 6) {
      toast.error("Новый пароль — минимум 6 символов")
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error("Пароли не совпадают")
      return
    }
    setSavingPassword(true)
    try {
      const res = await fetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error ?? "Ошибка смены пароля")
        return
      }
      setCurrentPassword("")
      setNewPassword("")
      setConfirmPassword("")
      toast.success("Пароль изменён")
    } catch {
      toast.error("Ошибка сети")
    } finally {
      setSavingPassword(false)
    }
  }

  const [emailChangeOpen, setEmailChangeOpen] = useState(false)
  const [newEmail, setNewEmail] = useState("")
  const [emailReason, setEmailReason] = useState("")
  const [emailSubmitting, setEmailSubmitting] = useState(false)

  const handleEmailChangeRequest = async () => {
    const trimmed = newEmail.trim()
    if (!trimmed) { toast.error("Введите новый email"); return }
    setEmailSubmitting(true)
    try {
      // Директор не может менять email сам — отправляем заявку платформ-админу.
      // Остальные роли — прямой PATCH через /api/auth/me, без запроса.
      if (isOwner) {
        const res = await fetch("/api/support/requests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "email_change", data: { newEmail: trimmed, reason: emailReason.trim() || undefined, currentEmail: displayEmail } }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) { toast.error(json.error ?? "Ошибка отправки запроса"); return }
        toast.success("Запрос отправлен администратору")
      } else {
        const res = await fetch("/api/auth/me", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ newEmail: trimmed }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) { toast.error(json.error ?? "Не удалось изменить email"); return }
        setProfile(prev => prev ? { ...prev, email: trimmed } : prev)
        await updateSession({ email: trimmed })
        toast.success("Email изменён")
      }
      setEmailChangeOpen(false)
      setNewEmail("")
      setEmailReason("")
    } catch { toast.error("Ошибка сети") }
    finally { setEmailSubmitting(false) }
  }

  const displayName = profile?.name ?? session?.user?.name ?? "—"
  const displayEmail = profile?.email ?? session?.user?.email ?? "—"
  const displayRole = profile?.role ?? session?.user?.role ?? "client"
  const initials = displayName
    .split(" ")
    .map((s: string) => s[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)

  return (
        <>
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-1">
                <User className="h-5 w-5 text-violet-600" />
                <h1 className="text-lg font-semibold text-foreground">Профиль</h1>
              </div>
              <p className="text-muted-foreground text-sm">Личные данные и настройки безопасности</p>
            </div>

            <div className="space-y-4">
              {/* ═══ Аккаунт + Имя — одна секция ═══════════════════
                  Раньше было две карточки с дублирующимся displayName
                  (в Аккаунт-карточке + Input в Имя-карточке). Объединил
                  в одну: аватар + редактируемое имя слева, email + роль
                  справа в той же строке. */}
              <Card>
                <CardHeader className="pb-2 pt-4 px-5">
                  <CardTitle className="text-base flex items-center gap-2">
                    <User className="w-4 h-4" />
                    Аккаунт
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-5 pb-4 pt-0">
                  {loadingProfile ? (
                    <div className="flex items-center gap-3 py-2">
                      <div className="w-14 h-14 rounded-full bg-muted animate-pulse" />
                      <div className="space-y-2 flex-1">
                        <div className="h-4 w-40 rounded bg-muted animate-pulse" />
                        <div className="h-3 w-56 rounded bg-muted animate-pulse" />
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-4 py-1">
                      {/* Avatar — click открывает file picker (как в хедере) */}
                      <div className="relative group shrink-0">
                        <button type="button" onClick={() => fileInputRef.current?.click()} className="rounded-full focus:outline-none focus:ring-2 focus:ring-primary/30" disabled={uploadingAvatar}>
                          <Avatar className="w-14 h-14 text-lg">
                            {avatarUrl && <AvatarImage src={avatarUrl} alt={displayName} />}
                            <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                              {uploadingAvatar ? <Loader2 className="w-5 h-5 animate-spin" /> : (initials || "?")}
                            </AvatarFallback>
                          </Avatar>
                          <div className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <Camera className="w-5 h-5 text-white" />
                          </div>
                        </button>
                        <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleAvatarUpload} />
                        {avatarUrl && (
                          <button type="button" onClick={handleAvatarDelete} className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-destructive text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity" title="Удалить фото">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>

                      <div className="flex-1 min-w-0 space-y-2.5">
                        {/* Имя + Фамилия — два раздельных подписанных поля (#33) */}
                        <div className="max-w-xl">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Имя</Label>
                              <Input
                                value={firstName}
                                onChange={e => setFirstName(e.target.value)}
                                placeholder="Иван"
                                onKeyDown={e => { if (e.key === "Enter") handleSaveName() }}
                                maxLength={100}
                                className="h-8 text-sm"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[11px] uppercase tracking-wider text-muted-foreground">Фамилия</Label>
                              <Input
                                value={lastName}
                                onChange={e => setLastName(e.target.value)}
                                placeholder="Иванов"
                                onKeyDown={e => { if (e.key === "Enter") handleSaveName() }}
                                maxLength={100}
                                className="h-8 text-sm"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Email + роль в одной строке */}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-muted-foreground">
                          <span className="inline-flex items-center gap-1.5">
                            <Mail className="w-3.5 h-3.5" />
                            {displayEmail}
                          </span>
                          <button
                            type="button"
                            onClick={() => setEmailChangeOpen(true)}
                            className="text-xs text-primary hover:underline cursor-pointer"
                          >
                            {isOwner ? "Запросить смену email" : "Изменить email"}
                          </button>
                          <Badge
                            variant="outline"
                            className={`text-xs ${ROLE_COLORS[displayRole] ?? ROLE_COLORS.client}`}
                          >
                            <Shield className="w-3 h-3 mr-1" />
                            {(ROLE_LABELS as Record<string, string>)[displayRole] ?? displayRole}
                          </Badge>
                        </div>

                        {/* Кнопка сохранения — в правом нижнем углу карточки */}
                        <div className="flex justify-end pt-2">
                          <Button
                            size="sm"
                            className="h-8 gap-1.5"
                            onClick={handleSaveName}
                            disabled={
                              savingName ||
                              (firstName.trim() === (profile?.firstName ?? "") &&
                                lastName.trim() === (profile?.lastName ?? ""))
                            }
                          >
                            {savingName
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              : <Save className="w-3.5 h-3.5" />
                            }
                            {savingName ? "..." : "Сохранить"}
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* ═══ Смена пароля ════════════════════════════════ */}
              <Card>
                <CardHeader className="pb-2 pt-4 px-5">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Lock className="w-4 h-4" />
                    Пароль
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-5 pb-4 pt-0 space-y-3">
                  <div className="space-y-1">
                    <Label className="text-sm">Текущий пароль</Label>
                    <div className="relative">
                      <Input
                        type={showCurrent ? "text" : "password"}
                        value={currentPassword}
                        onChange={e => setCurrentPassword(e.target.value)}
                        placeholder="••••••••"
                        className="pr-10"
                      />
                      <button
                        type="button"
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        onClick={() => setShowCurrent(v => !v)}
                      >
                        {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-1">
                    <Label className="text-sm">Новый пароль</Label>
                    <div className="relative">
                      <Input
                        type={showNew ? "text" : "password"}
                        value={newPassword}
                        onChange={e => setNewPassword(e.target.value)}
                        placeholder="Минимум 6 символов"
                        className="pr-10"
                      />
                      <button
                        type="button"
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        onClick={() => setShowNew(v => !v)}
                      >
                        {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-sm">Повторите новый пароль</Label>
                    <div className="relative">
                      <Input
                        type={showConfirm ? "text" : "password"}
                        value={confirmPassword}
                        onChange={e => setConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        className={`pr-10 ${
                          confirmPassword && confirmPassword !== newPassword
                            ? "border-destructive focus-visible:ring-destructive/30"
                            : ""
                        }`}
                      />
                      <button
                        type="button"
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        onClick={() => setShowConfirm(v => !v)}
                      >
                        {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {confirmPassword && confirmPassword !== newPassword && (
                      <p className="text-[11px] text-destructive">Пароли не совпадают</p>
                    )}
                  </div>

                  {/* Password strength bar */}
                  {newPassword && (
                    <div className="space-y-1">
                      <div className="flex gap-1">
                        {[1, 2, 3, 4].map(i => {
                          const strength = Math.min(
                            Math.floor(newPassword.length / 3) +
                            (newPassword.length >= 8 ? 1 : 0) +
                            (/[A-Z]/.test(newPassword) ? 0.5 : 0) +
                            (/[0-9]/.test(newPassword) ? 0.5 : 0),
                            4
                          )
                          return (
                            <div
                              key={i}
                              className={`h-1.5 flex-1 rounded-full transition-colors ${
                                i <= strength
                                  ? strength <= 1 ? "bg-destructive"
                                    : strength <= 2 ? "bg-amber-500"
                                    : strength <= 3 ? "bg-blue-500"
                                    : "bg-emerald-500"
                                  : "bg-muted"
                              }`}
                            />
                          )
                        })}
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        {newPassword.length < 6 ? "Слишком короткий"
                          : newPassword.length < 8 ? "Слабый"
                          : newPassword.length < 12 ? "Хороший"
                          : "Надёжный"} пароль
                      </p>
                    </div>
                  )}

                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-2"
                    onClick={handleSavePassword}
                    disabled={
                      savingPassword ||
                      !currentPassword ||
                      newPassword.length < 6 ||
                      newPassword !== confirmPassword
                    }
                  >
                    {savingPassword
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <Lock className="w-3.5 h-3.5" />
                    }
                    {savingPassword ? "Смена пароля..." : "Сменить пароль"}
                  </Button>
                </CardContent>
              </Card>

              {/* ═══ Ключи входа (passkey) ══════════════════════════ */}
              <PasskeySection />

              {/* ═══ Мой рабочий график ══════════════════════════
                  Личный график сотрудника (users.custom_schedule).
                  Раньше редактировался на /settings/schedule через
                  несуществующий /api/team/[id] — перенесён сюда, в
                  настройки самого сотрудника, и сохраняется через /api/auth/me. */}
              <Card>
                <CardHeader className="pb-2 pt-4 px-5">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Мой рабочий график
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-5 pb-4 pt-0">
                  <p className="text-xs text-muted-foreground mb-3">
                    Индивидуальные рабочие дни и часы. Если не задавать — действует общий график компании.
                  </p>
                  <div className="space-y-1">
                    {WEEKDAY_IDS.map((dayId, di) => {
                      const d = scheduleDays[dayId] ?? DEFAULT_DAYS[dayId]
                      return (
                        <div key={dayId} className={cn("grid grid-cols-[44px_44px_1fr] items-center py-1.5", di % 2 !== 0 && "bg-muted/20 -mx-2 px-2 rounded")}>
                          <Switch checked={d.active} onCheckedChange={v => updateScheduleDay(dayId, { active: v })} />
                          <span className={cn("text-sm font-medium", !d.active && "text-muted-foreground")}>{WEEKDAY_SHORT[dayId]}</span>
                          {d.active ? (
                            <div className="flex items-center gap-2">
                              <Select value={d.start} onValueChange={v => updateScheduleDay(dayId, { start: v })}>
                                <SelectTrigger className="w-24 h-7 text-sm bg-[var(--input-bg)]"><SelectValue /></SelectTrigger>
                                <SelectContent>{HALF_HOURS.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent>
                              </Select>
                              <span className="text-muted-foreground text-xs">—</span>
                              <Select value={d.end} onValueChange={v => updateScheduleDay(dayId, { end: v })}>
                                <SelectTrigger className="w-24 h-7 text-sm bg-[var(--input-bg)]"><SelectValue /></SelectTrigger>
                                <SelectContent>{HALF_HOURS.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent>
                              </Select>
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground">Выходной</span>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {/* Обед — один перерыв на все рабочие дни */}
                  <div className="grid grid-cols-[44px_44px_1fr] items-center py-1.5 mt-2 border-t pt-3">
                    <Switch checked={lunch.enabled} onCheckedChange={v => setLunch(prev => ({ ...prev, enabled: v }))} />
                    <span className={cn("text-sm font-medium", !lunch.enabled && "text-muted-foreground")}>Обед</span>
                    {lunch.enabled ? (
                      <div className="flex items-center gap-2">
                        <Select value={lunch.start} onValueChange={v => setLunch(prev => ({ ...prev, start: v }))}>
                          <SelectTrigger className="w-24 h-7 text-sm bg-[var(--input-bg)]"><SelectValue /></SelectTrigger>
                          <SelectContent>{HALF_HOURS.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent>
                        </Select>
                        <span className="text-muted-foreground text-xs">—</span>
                        <Select value={lunch.end} onValueChange={v => setLunch(prev => ({ ...prev, end: v }))}>
                          <SelectTrigger className="w-24 h-7 text-sm bg-[var(--input-bg)]"><SelectValue /></SelectTrigger>
                          <SelectContent>{HALF_HOURS.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">Без перерыва</span>
                    )}
                  </div>

                  <div className="flex justify-end pt-3">
                    <Button size="sm" className="gap-2" onClick={handleSaveSchedule} disabled={savingSchedule || loadingProfile}>
                      {savingSchedule ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      Сохранить график
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* ═══ Напоминания об интервью в Telegram ══════════════════
                  Общий компонент (тот же — в шестерёнке календаря).
                  users.manager_reminder_chat_id, миграция 0270. */}
              <ManagerReminderBotCard />

              {/* ═══ Zoom (личный, Юрий 10.07) ══════════════════════════
                  Каждый менеджер подключает СВОЙ Zoom-аккаунт — используется
                  в интервью для кнопки «Создать Zoom-встречу» (event-modal.tsx). */}
              <Card>
                <CardHeader className="pb-2 pt-4 px-5">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Video className="w-4 h-4" />
                    Zoom
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-5 pb-4 pt-0 space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Подключите свой Zoom, чтобы создавать ссылку на встречу прямо из карточки интервью — от вашего имени.
                  </p>
                  {loadingZoom ? (
                    <div className="h-8 w-40 rounded bg-muted animate-pulse" />
                  ) : zoomConnected ? (
                    <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2">
                      <span className="text-sm flex items-center gap-2">
                        <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800">Подключено</Badge>
                        {zoomEmail && <span className="text-muted-foreground">{zoomEmail}</span>}
                      </span>
                      <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={handleDisconnectZoom} disabled={disconnectingZoom}>
                        {disconnectingZoom ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Отключить"}
                      </Button>
                    </div>
                  ) : (
                    <Button variant="outline" size="sm" className="gap-2" asChild>
                      <a href="/api/integrations/zoom/auth">
                        <Video className="w-3.5 h-3.5" />
                        Подключить Zoom
                      </a>
                    </Button>
                  )}
                </CardContent>
              </Card>

              {/* ═══ Контакты для оперативной связи с кандидатом ══════════════
                  Юрий 10.07: подставляются в сообщение со ссылкой на встречу
                  («подтвердите получение» + как связаться, если что-то не так). */}
              <Card>
                <CardHeader className="pb-2 pt-4 px-5">
                  <CardTitle className="text-base flex items-center gap-2">
                    <MessageCircle className="w-4 h-4" />
                    Контакты для кандидатов
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-5 pb-4 pt-0 space-y-3">
                  <p className="text-xs text-muted-foreground">
                    Подставляются в сообщение со ссылкой на встречу — чтобы кандидат мог оперативно связаться, если что-то не получается. Пустое поле не показывается.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div className="space-y-1">
                      <Label htmlFor="contact-telegram" className="text-xs text-muted-foreground">Telegram</Label>
                      <Input id="contact-telegram" value={contactTelegram} onChange={e => setContactTelegram(e.target.value)} placeholder="@username" className="h-8 text-sm bg-[var(--input-bg)]" />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="contact-max" className="text-xs text-muted-foreground">Max</Label>
                      <Input id="contact-max" value={contactMax} onChange={e => setContactMax(e.target.value)} placeholder="+7 900 000-00-00" className="h-8 text-sm bg-[var(--input-bg)]" />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="contact-phone" className="text-xs text-muted-foreground">Телефон</Label>
                      <Input id="contact-phone" value={contactPhone} onChange={e => setContactPhone(e.target.value)} placeholder="+7 900 000-00-00" className="h-8 text-sm bg-[var(--input-bg)]" />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button size="sm" className="gap-1.5" onClick={handleSaveContacts} disabled={savingContacts}>
                      {savingContacts ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      Сохранить
                    </Button>
                  </div>
                </CardContent>
              </Card>

            </div>

      {/* ═══ Модалка: смена email (запрос для директора, прямой PATCH для остальных) ═══ */}
      <Dialog open={emailChangeOpen} onOpenChange={setEmailChangeOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{isOwner ? "Запрос на изменение email" : "Изменить email"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Новый email *</Label>
              <Input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="new@example.com" className="h-9 text-sm bg-[var(--input-bg)]" />
            </div>
            {isOwner && (
              <div className="space-y-1.5">
                <Label className="text-xs">Причина (необязательно)</Label>
                <Textarea value={emailReason} onChange={e => setEmailReason(e.target.value)} rows={2} placeholder="Почему нужно сменить email" className="text-sm bg-[var(--input-bg)]" />
              </div>
            )}
            <Button onClick={handleEmailChangeRequest} disabled={emailSubmitting || !newEmail.trim()} className="w-full">
              {emailSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {isOwner ? "Отправить запрос" : "Изменить email"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
