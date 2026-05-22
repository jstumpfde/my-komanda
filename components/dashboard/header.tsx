"use client"

import { Button } from "@/components/ui/button"
import { Bell, Moon, Sun, Coffee, LogOut, PanelLeftClose, PanelLeft, ChevronDown, ArrowLeft, Building2, User as UserIcon, Loader2, Shield } from "lucide-react"
import { useTheme } from "next-themes"
import { useEffect, useRef, useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import { useSession } from "next-auth/react"
import { toast } from "sonner"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { useSidebar } from "@/components/ui/sidebar"
import { Badge } from "@/components/ui/badge"
import { useAuth, ROLE_LABELS, ROLE_ICONS, type UserRole } from "@/lib/auth"
import Link from "next/link"
import { cn } from "@/lib/utils"

interface Notification {
  id: string; title: string; body: string | null; severity: string; href: string | null; isRead: boolean; createdAt: string
}

const SEVERITY_COLORS: Record<string, string> = {
  danger: "bg-red-500",
  warning: "bg-amber-500",
  info: "bg-blue-500",
  success: "bg-emerald-500",
}

const ALL_ROLES: UserRole[] = ["platform_admin", "platform_manager", "director", "hr_lead", "hr_manager", "department_head", "observer"]

export function DashboardHeader() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const { state, toggleSidebar } = useSidebar()
  const { user, role, realRole, isViewingAs, setRole, returnToAdmin, logout } = useAuth()
  const { data: session, update: updateSession } = useSession()
  const isPlatformAdmin = session?.user?.isPlatformAdmin === true
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const router = useRouter()
  const pathname = usePathname()

  // Локальный preview аватара после upload (до того как обновится сессия).
  const [localAvatar, setLocalAvatar] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleAvatarUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Только изображения")
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Максимум 2 МБ")
      return
    }
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch("/api/team/avatar", { method: "POST", body: fd })
      const data = await res.json().catch(() => ({})) as { avatarUrl?: string; error?: string }
      if (!res.ok || !data.avatarUrl) throw new Error(data.error || "Ошибка загрузки")
      setLocalAvatar(data.avatarUrl)
      // Обновляем JWT-сессию, чтобы новый avatarUrl попал в useAuth().user.avatar
      // во всех компонентах. Не блокирующий: если update() упадёт — localAvatar
      // покрывает визуальный результат до следующей навигации.
      await updateSession?.().catch(() => {})
      toast.success("Фото обновлено")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка")
    } finally {
      setUploading(false)
    }
  }

  // Fetch notifications from API
  useEffect(() => {
    fetch("/api/notifications")
      .then(r => r.json())
      .then((data: Notification[]) => {
        if (Array.isArray(data)) setNotifications(data)
      })
      .catch(() => {})
    fetch("/api/notifications?count=true")
      .then(r => r.json())
      .then((data: { unreadCount?: number }) => {
        setUnreadCount(data.unreadCount ?? 0)
      })
      .catch(() => {})
  }, [])

  // ── Visit tracking ──
  useEffect(() => {
    if (!pathname) return
    const sessionId = typeof window !== "undefined"
      ? (sessionStorage.getItem("mk_sid") || (() => { const id = crypto.randomUUID(); sessionStorage.setItem("mk_sid", id); return id })())
      : null
    fetch("/api/visit-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page: pathname, referrer: document.referrer || null, sessionId }),
    }).catch(() => {})
  }, [pathname])

  const markAllRead = async () => {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "mark-all-read" }),
    })
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })))
    setUnreadCount(0)
  }

  function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return "только что"
    if (mins < 60) return `${mins} мин назад`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours} ч назад`
    const days = Math.floor(hours / 24)
    return `${days} дн назад`
  }

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "b") { e.preventDefault(); toggleSidebar() }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [toggleSidebar])

  const handleRoleSwitch = (r: UserRole) => {
    setRole(r)
    router.push("/overview")
  }

  const initials = user?.name
    ? user.name.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()
    : "?"

  if (!mounted) return null

  return (
    <>
      {/* View-as banner */}
      {isViewingAs && (
        <div className="bg-amber-400 text-amber-950 px-4 py-1.5 flex items-center justify-between text-sm">
          <span className="font-medium">
            {ROLE_ICONS[role]} Вы просматриваете платформу как: <strong>{ROLE_LABELS[role]}</strong>
            {user.company && <span className="opacity-70"> · {user.company}</span>}
          </span>
          <Button size="sm" variant="outline" className="h-7 text-xs bg-white/80 border-amber-600 text-amber-900 hover:bg-white gap-1" onClick={returnToAdmin}>
            <ArrowLeft className="w-3 h-3" /> Вернуться к Admin
          </Button>
        </div>
      )}

      <header className="sticky top-0 z-40 border-b border-border bg-background">
        <div className="flex items-center justify-between h-14" style={{ paddingLeft: 56, paddingRight: 56 }}>
          <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={toggleSidebar}>
            {state === "expanded" ? <PanelLeftClose className="h-5 w-5" /> : <PanelLeft className="h-5 w-5" />}
          </Button>

          <div className="flex items-center gap-2">
            {/* Role Switcher — только для платформенных админов */}
            {(realRole === "platform_admin" || realRole === "platform_manager") ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                    <span>{ROLE_ICONS[role]}</span>
                    <span className="hidden sm:inline">{ROLE_LABELS[role]}</span>
                    <ChevronDown className="w-3 h-3 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  {ALL_ROLES.map((r, i) => {
                    const isSep = (i === 2 || i === 5) // after platform roles, after main client roles
                    return (
                      <div key={r}>
                        {isSep && <DropdownMenuSeparator />}
                        <DropdownMenuItem
                          className={cn("gap-2 cursor-pointer", role === r && "bg-primary/5")}
                          onClick={() => handleRoleSwitch(r)}
                        >
                          <span className="text-base">{ROLE_ICONS[r]}</span>
                          <span className="flex-1 text-sm">{ROLE_LABELS[r]}</span>
                          {role === r && <Badge variant="secondary" className="text-[9px] h-4 px-1">текущая</Badge>}
                        </DropdownMenuItem>
                      </div>
                    )
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <div className="flex items-center gap-1.5 h-8 px-3 text-xs text-muted-foreground">
                <span>{ROLE_ICONS[role]}</span>
                <span className="hidden sm:inline">{ROLE_LABELS[role]}</span>
              </div>
            )}

            {/* Theme Switcher переехал в dropdown профиля (см. ниже).
                В хедере остался только колокольчик + аватар, чтобы освободить
                место и не дублировать поверхностные действия. */}

            {/* Platform admin shortcut — виден только тем, чей email есть в
                PLATFORM_ADMIN_EMAILS. Сам /admin/platform защищён ещё и
                layout-проверкой, так что это просто удобная точка входа. */}
            {isPlatformAdmin && (
              <Link
                href="/admin/platform"
                title="Настройки платформы"
                className="relative inline-flex items-center justify-center h-9 w-9 rounded-md hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                <Shield className="h-5 w-5" />
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-orange-500 ring-2 ring-background" />
              </Link>
            )}

            {/* Notifications */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9 relative">
                  <Bell className="h-5 w-5" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1">{unreadCount}</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 p-0">
                <div className="flex items-center justify-between px-4 py-3 border-b">
                  <span className="text-sm font-semibold text-foreground">Уведомления</span>
                  {unreadCount > 0 && <button className="text-xs text-primary hover:underline" onClick={markAllRead}>Прочитать все</button>}
                </div>
                <div className="max-h-[360px] overflow-y-auto">
                  {notifications.length === 0 ? (
                    <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                      Нет уведомлений
                    </div>
                  ) : notifications.map(n => (
                    <div
                      key={n.id}
                      className={cn("flex items-start gap-3 px-4 py-3 border-b last:border-0 hover:bg-muted/30 cursor-pointer", !n.isRead && "bg-primary/5")}
                      onClick={() => n.href && router.push(n.href)}
                    >
                      <div className={cn("w-2.5 h-2.5 rounded-full mt-1.5 shrink-0", SEVERITY_COLORS[n.severity] || "bg-blue-500")} />
                      <div className="flex-1 min-w-0">
                        <p className={cn("text-sm leading-snug", !n.isRead ? "text-foreground font-medium" : "text-muted-foreground")}>{n.title}</p>
                        {n.body && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>}
                        <p className="text-[10px] text-muted-foreground mt-0.5">{timeAgo(n.createdAt)}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="border-t px-4 py-2.5">
                  <Link href="/settings/notifications" className="text-xs text-primary hover:underline">Все уведомления →</Link>
                </div>
              </PopoverContent>
            </Popover>

            {/* Hidden file input — общий для аватара в хедере и в dropdown. */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handleAvatarUpload(f)
                e.target.value = ""
              }}
            />

            {/* Avatar — клик открывает file picker (см. user request).
                Dropdown открывается через chevron справа от аватара. */}
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                title="Загрузить фото профиля"
                className="relative h-10 w-10 rounded-full overflow-hidden ring-0 hover:ring-2 hover:ring-primary/30 transition-all disabled:opacity-50"
              >
                <Avatar className="h-10 w-10">
                  {(localAvatar || user.avatar) && (
                    <AvatarImage src={localAvatar || user.avatar} alt={user.name} />
                  )}
                  <AvatarFallback className="text-sm font-semibold">{initials}</AvatarFallback>
                </Avatar>
                {uploading && (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/40">
                    <Loader2 className="w-4 h-4 text-white animate-spin" />
                  </span>
                )}
              </button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-6 px-0" title="Меню профиля">
                    <ChevronDown className="w-3.5 h-3.5 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <div className="flex items-center gap-3 p-3 border-b">
                    <Avatar className="h-10 w-10">
                      {(localAvatar || user.avatar) && (
                        <AvatarImage src={localAvatar || user.avatar} alt={user.name} />
                      )}
                      <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{user.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                      <Badge variant="secondary" className="text-[10px] mt-1 h-4 px-1.5">{ROLE_LABELS[role]}</Badge>
                    </div>
                  </div>
                  <DropdownMenuItem className="text-sm cursor-pointer" asChild>
                    <Link href="/settings/company"><Building2 className="w-4 h-4 mr-2" />Компания</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem className="text-sm cursor-pointer" asChild>
                    <Link href="/settings/profile"><UserIcon className="w-4 h-4 mr-2" />Профиль</Link>
                  </DropdownMenuItem>
                  {isPlatformAdmin && (
                    <DropdownMenuItem className="text-sm cursor-pointer" asChild>
                      <Link href="/admin/platform">
                        <Shield className="w-4 h-4 mr-2" />
                        Настройки платформы
                        <span className="ml-auto w-2 h-2 rounded-full bg-orange-500" />
                      </Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  {/* Inline-переключатель темы — 3 варианта. Используем 3 строки
                      вместо группы кнопок, чтобы помещалось в стандартный 224px
                      dropdown и было кликабельно с тач-устройств. */}
                  <DropdownMenuItem
                    className={cn("text-sm cursor-pointer", theme === "light" && "bg-primary/10 text-primary")}
                    onClick={(e) => { e.preventDefault(); setTheme("light") }}
                  >
                    <Sun className="w-4 h-4 mr-2" />Светлая
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className={cn("text-sm cursor-pointer", theme === "dark" && "bg-primary/10 text-primary")}
                    onClick={(e) => { e.preventDefault(); setTheme("dark") }}
                  >
                    <Moon className="w-4 h-4 mr-2" />Тёмная
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className={cn("text-sm cursor-pointer", theme === "warm" && "bg-primary/10 text-primary")}
                    onClick={(e) => { e.preventDefault(); setTheme("warm") }}
                  >
                    <Coffee className="w-4 h-4 mr-2" />Тёплая
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-sm cursor-pointer" onClick={() => logout()}>
                    <LogOut className="w-4 h-4 mr-2" />Выход
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </header>
    </>
  )
}
