"use client"

import { useEffect, useRef, useState } from "react"
import { useTheme } from "next-themes"
import { useSession } from "next-auth/react"
import { toast } from "sonner"
import { useSidebar } from "@/components/ui/sidebar"
import { Button } from "@/components/ui/button"
import { Sun, Moon, Coffee, PanelLeftClose, PanelLeft, Bell, Building2, CreditCard, Users, Plug, Clock, User, LogOut, Palette, ScrollText, ChevronDown, Loader2 } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { useAuth } from "@/lib/auth"
import type { UserRole } from "@/lib/auth"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"

// Единый порядок табов Settings (sync с lib/sidebar/config.ts SETTINGS_MENU):
// Компания → Профиль → Команда → Расписание → Уведомления → Интеграции →
// Тариф и оплата → Брендинг. Админский «Юр. документы» прячется через
// roles и идёт последним.
// IA-рефактор (D8): пункты сгруппированы в 4 раздела. Роуты не меняются.
const GROUP_ORDER = ["Профиль и компания", "Интеграции", "Служебные"] as const
type NavGroup = (typeof GROUP_ORDER)[number]
const navItems: { href: string; label: string; icon: typeof Building2; roles?: UserRole[]; group: NavGroup }[] = [
  { href: "/settings/company",       label: "Компания",       icon: Building2,  group: "Профиль и компания" },
  { href: "/settings/profile",       label: "Профиль",        icon: User,       group: "Профиль и компания" },
  { href: "/settings/team",          label: "Команда",        icon: Users,      group: "Профиль и компания" },
  { href: "/settings/branding",      label: "Брендинг",       icon: Palette,    group: "Профиль и компания" },
  { href: "/settings/integrations",  label: "Интеграции",     icon: Plug,       group: "Интеграции" },
  { href: "/settings/schedule",      label: "Расписание",     icon: Clock,      group: "Профиль и компания" },
  { href: "/settings/notifications", label: "Уведомления",    icon: Bell,       group: "Служебные" },
  { href: "/settings/billing",       label: "Тариф и оплата", icon: CreditCard, group: "Служебные" },
  { href: "/settings/legal",         label: "Юр. документы",  icon: ScrollText, roles: ["platform_admin", "director"], group: "Служебные" },
]

const NOTIFICATIONS = [
  { id: "n1", text: "Иванов А. завершил демонстрацию (94%)", time: "5 мин назад", color: "bg-emerald-500", read: false },
  { id: "n2", text: "Смирнова Е. выбрала слот: завтра 14:00", time: "12 мин назад", color: "bg-blue-500", read: false },
  { id: "n3", text: "Козлов И. не пришёл на интервью", time: "1 час назад", color: "bg-red-500", read: false },
  { id: "n4", text: "3 новых кандидата ожидают решения HR", time: "2 часа назад", color: "bg-amber-500", read: false },
]

export function SettingsHeader() {
  const { theme, setTheme } = useTheme()
  const { state, toggleSidebar } = useSidebar()
  const pathname = usePathname()
  const { user, role, logout } = useAuth()
  const { update: updateSession } = useSession()
  const visibleNav = navItems.filter(item => !item.roles || item.roles.includes(role))
  const [mounted, setMounted] = useState(false)
  const [notifications, setNotifications] = useState(NOTIFICATIONS)
  const [localAvatar, setLocalAvatar] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setMounted(true) }, [])

  const handleAvatarUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) { toast.error("Только изображения"); return }
    if (file.size > 2 * 1024 * 1024) { toast.error("Максимум 2 МБ"); return }
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch("/api/team/avatar", { method: "POST", body: fd })
      const data = await res.json().catch(() => ({})) as { avatarUrl?: string; error?: string }
      if (!res.ok || !data.avatarUrl) throw new Error(data.error || "Ошибка загрузки")
      setLocalAvatar(data.avatarUrl)
      await updateSession?.().catch(() => {})
      toast.success("Фото обновлено")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ошибка")
    } finally {
      setUploading(false)
    }
  }

  const unreadCount = notifications.filter(n => !n.read).length
  const markAllRead = () => setNotifications(prev => prev.map(n => ({ ...n, read: true })))

  const initials = user?.name
    ? user.name.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase()
    : "?"

  return (
    <header className="sticky top-0 z-40 bg-background">
      {/* Row 1: Top bar */}
      <div className="flex items-center justify-between h-14 border-b border-border" style={{ paddingLeft: 56, paddingRight: 56 }}>
        <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={toggleSidebar}>
          {state === "expanded" ? <PanelLeftClose className="h-5 w-5" /> : <PanelLeft className="h-5 w-5" />}
        </Button>

        <div className="flex items-center gap-2">
          {/* Theme switcher переехал в dropdown профиля (см. ниже). */}

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
                {notifications.map(n => (
                  <div key={n.id} className={cn("flex items-start gap-3 px-4 py-3 border-b last:border-0 hover:bg-muted/30", !n.read && "bg-primary/5")}>
                    <div className={cn("w-2.5 h-2.5 rounded-full mt-1.5 shrink-0", n.color)} />
                    <div className="flex-1 min-w-0">
                      <p className={cn("text-sm leading-snug", !n.read ? "text-foreground font-medium" : "text-muted-foreground")}>{n.text}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{n.time}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-t px-4 py-2.5">
                <Link href="/settings/notifications" className="text-xs text-primary hover:underline">Все уведомления →</Link>
              </div>
            </PopoverContent>
          </Popover>

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

          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              title="Загрузить фото профиля"
              className="relative h-8 w-8 rounded-full overflow-hidden ring-0 hover:ring-2 hover:ring-primary/30 transition-all disabled:opacity-50"
            >
              <Avatar className="h-8 w-8">
                {(localAvatar || user?.avatar) && (
                  <AvatarImage src={localAvatar || user?.avatar} alt={user?.name ?? ""} />
                )}
                <AvatarFallback className="text-xs font-semibold">{initials}</AvatarFallback>
              </Avatar>
              {uploading && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/40">
                  <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
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
                    {(localAvatar || user?.avatar) && (
                      <AvatarImage src={localAvatar || user?.avatar} alt={user?.name ?? ""} />
                    )}
                    <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{user?.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                  </div>
                </div>
                <DropdownMenuItem className="text-sm cursor-pointer" asChild>
                  <Link href="/settings/company"><Building2 className="w-4 h-4 mr-2" />Настройки компании</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {mounted && (
                  <>
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
                  </>
                )}
                <DropdownMenuItem className="text-sm cursor-pointer" onClick={() => logout()}>
                  <LogOut className="w-4 h-4 mr-2" />Выход
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      {/* Row 2: Settings tabs — IA D8: 4 раздела с метками групп */}
      <div className="border-b border-border overflow-x-auto">
        <nav className="flex items-end gap-x-6" style={{ paddingLeft: 56, paddingRight: 56 }}>
          {GROUP_ORDER.map((g) => {
            const items = visibleNav.filter((i) => i.group === g)
            if (items.length === 0) return null
            return (
              <div key={g} className="flex flex-col">
                <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground/50 pl-3 pt-2">{g}</span>
                <div className="flex items-center gap-0.5">
                  {items.map(({ href, label, icon: Icon }) => (
                    <Link
                      key={href}
                      href={href}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2",
                        pathname === href
                          ? "text-primary border-primary"
                          : "text-muted-foreground hover:text-foreground border-transparent"
                      )}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {label}
                    </Link>
                  ))}
                </div>
              </div>
            )
          })}
        </nav>
      </div>
    </header>
  )
}
