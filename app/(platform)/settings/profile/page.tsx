"use client"

import { useState, useEffect, useRef } from "react"
import { useSession } from "next-auth/react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import { toast } from "sonner"
import { Loader2, User, Mail, Lock, Shield, Save, Eye, EyeOff, Camera, Trash2 } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"

// ─── Helpers ──────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  admin: "Администратор",
  manager: "Менеджер",
  client: "Клиент",
  client_hr: "HR-клиент",
  candidate: "Кандидат",
}

const ROLE_COLORS: Record<string, string> = {
  admin: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800",
  manager: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800",
  client: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800",
  client_hr: "bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-200 dark:border-violet-800",
  candidate: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800",
}

interface UserProfile {
  id: string
  email: string
  name: string
  role: string
  companyId: string | null
  avatarUrl: string | null
}

export default function ProfileSettingsPage() {
  const { data: session, update: updateSession } = useSession()

  // Profile state
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loadingProfile, setLoadingProfile] = useState(true)

  // Name form
  const [name, setName] = useState("")
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
        setAvatarUrl((p as unknown as { avatarUrl?: string }).avatarUrl ?? null)
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
    if (!name.trim()) {
      toast.error("Имя не может быть пустым")
      return
    }
    setSavingName(true)
    try {
      const res = await fetch("/api/auth/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error ?? "Ошибка сохранения")
        return
      }
      setProfile(prev => prev ? { ...prev, name: name.trim() } : prev)
      await updateSession({ name: name.trim() })
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
    if (!newEmail.trim()) { toast.error("Введите новый email"); return }
    setEmailSubmitting(true)
    try {
      const res = await fetch("/api/access-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestType: "email_change", newValue: newEmail.trim(), message: emailReason.trim() || undefined }),
      })
      if (!res.ok) throw new Error()
      toast.success("Запрос отправлен")
      setEmailChangeOpen(false)
      setNewEmail("")
      setEmailReason("")
    } catch { toast.error("Ошибка отправки запроса") }
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
              <h1 className="text-xl font-semibold text-foreground mb-1">Профиль</h1>
              <p className="text-muted-foreground text-sm">Личные данные и настройки безопасности</p>
            </div>

            <div className="space-y-4">
              {/* ═══ Информация об аккаунте ══════════════════════ */}
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
                      <div className="space-y-2">
                        <div className="h-4 w-40 rounded bg-muted animate-pulse" />
                        <div className="h-3 w-56 rounded bg-muted animate-pulse" />
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-4 py-1">
                      <div className="relative group">
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
                      <div>
                        <p className="font-semibold text-foreground text-base">{displayName}</p>
                        <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-0.5">
                          <Mail className="w-3.5 h-3.5" />
                          {displayEmail}
                          <button
                            type="button"
                            onClick={() => setEmailChangeOpen(true)}
                            className="ml-2 text-sm text-primary hover:underline cursor-pointer"
                          >
                            Изменить email
                          </button>
                        </p>
                        <div className="mt-2">
                          <Badge
                            variant="outline"
                            className={`text-xs ${ROLE_COLORS[displayRole] ?? ROLE_COLORS.client}`}
                          >
                            <Shield className="w-3 h-3 mr-1" />
                            {ROLE_LABELS[displayRole] ?? displayRole}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* ═══ Изменить имя ════════════════════════════════ */}
              <Card>
                <CardHeader className="pb-2 pt-4 px-5">
                  <CardTitle className="text-base flex items-center gap-2">
                    <User className="w-4 h-4" />
                    Имя
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-5 pb-4 pt-0 space-y-3">
                  <div className="space-y-1">
                    <Label className="text-sm">Полное имя</Label>
                    <Input
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="Иван Иванов"
                      onKeyDown={e => { if (e.key === "Enter") handleSaveName() }}
                      maxLength={100}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Отображается в системе и письмах кандидатам
                    </p>
                  </div>
                  <Button
                    size="sm"
                    className="gap-2"
                    onClick={handleSaveName}
                    disabled={savingName || !name.trim() || name.trim() === (profile?.name ?? "")}
                  >
                    {savingName
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <Save className="w-3.5 h-3.5" />
                    }
                    {savingName ? "Сохранение..." : "Сохранить имя"}
                  </Button>
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

            </div>

      {/* ═══ Модалка: запрос смены email ═══ */}
      <Dialog open={emailChangeOpen} onOpenChange={setEmailChangeOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Запрос на изменение email</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Новый email *</Label>
              <Input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="new@example.com" className="h-9 text-sm bg-[var(--input-bg)]" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Причина (необязательно)</Label>
              <Textarea value={emailReason} onChange={e => setEmailReason(e.target.value)} rows={2} placeholder="Почему нужно сменить email" className="text-sm bg-[var(--input-bg)]" />
            </div>
            <Button onClick={handleEmailChangeRequest} disabled={emailSubmitting || !newEmail.trim()} className="w-full">
              {emailSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Отправить запрос
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
