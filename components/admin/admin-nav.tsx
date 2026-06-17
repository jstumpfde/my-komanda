"use client"

// Левое боковое меню единой платформенной панели администратора.
// Встраивается ВНУТРИ main (не заменяет DashboardSidebar).
// Сворачивается в узкую иконочную полоску (состояние в localStorage).
// Группы: Обзор / Клиенты / Тарифы и модули / Шаблоны / Платформа / Инфраструктура / Настройки.

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard, Building2, Package, Library, ShieldAlert, Shield, Handshake,
  Inbox, Bot, BookOpen, Activity, Wrench, Palette, Sparkles,
  PanelLeftClose, PanelLeftOpen, type LucideIcon,
} from "lucide-react"

interface NavItem {
  label: string
  href: string
  icon: LucideIcon
}

interface NavGroup {
  title: string
  items: NavItem[]
}

const NAV_GROUPS: NavGroup[] = [
  {
    title: "Обзор",
    items: [
      { label: "Дашборд",        href: "/admin/dashboard",                  icon: LayoutDashboard },
    ],
  },
  {
    title: "Клиенты",
    items: [
      { label: "Компании",           href: "/admin/clients",              icon: Building2  },
      { label: "Запросы на email",   href: "/admin/requests",             icon: Inbox      },
      { label: "Партнёры",           href: "/admin/integrators",          icon: Handshake  },
    ],
  },
  {
    title: "Тарифы и модули",
    items: [
      { label: "Тарифные планы",  href: "/admin/plans",                    icon: Package    },
    ],
  },
  {
    title: "Шаблоны и AI",
    items: [
      { label: "Шаблоны воронок",  href: "/admin/platform/templates",      icon: Library    },
      { label: "Юлия",             href: "/admin/platform/yulia",          icon: Bot        },
    ],
  },
  {
    title: "Платформа",
    items: [
      { label: "Компании (AI)",    href: "/admin/platform/companies",      icon: Building2  },
      { label: "AI вакансии",      href: "/admin/platform/vacancies",      icon: BookOpen   },
      { label: "Emergency",        href: "/admin/platform/emergency",      icon: ShieldAlert },
      { label: "Логи действий",    href: "/admin/platform/logs",           icon: Activity   },
      { label: "Миграции",         href: "/admin/platform/migrations",     icon: Wrench     },
      { label: "Демо-данные",      href: "/admin/platform/demo",           icon: Sparkles   },
    ],
  },
  {
    title: "Инфраструктура",
    items: [
      { label: "Сроки / health",   href: "/admin/platform/deadlines",     icon: Activity   },
      { label: "Cron-запуски",     href: "/admin/platform/cron",          icon: Wrench     },
      { label: "Присутствие",      href: "/admin/platform/presence",      icon: LayoutDashboard },
    ],
  },
  {
    title: "Настройки",
    items: [
      { label: "Брендинг и SEO",   href: "/admin/platform/branding",      icon: Palette    },
      { label: "Роли и доступ",    href: "/admin/roles",                   icon: Shield     },
    ],
  },
]

function isActive(pathname: string, href: string): boolean {
  if (href === "/admin/dashboard") return pathname === "/admin/dashboard"
  return pathname === href || pathname.startsWith(href + "/")
}

export function AdminNav() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  // Восстанавливаем состояние сворачивания из localStorage.
  useEffect(() => {
    setCollapsed(localStorage.getItem("admin-nav-collapsed") === "1")
  }, [])

  function toggle() {
    setCollapsed((c) => {
      const next = !c
      try { localStorage.setItem("admin-nav-collapsed", next ? "1" : "0") } catch {}
      return next
    })
  }

  return (
    <nav
      className={cn(
        "shrink-0 border-r border-border bg-background py-3 overflow-y-auto overflow-x-hidden transition-[width] duration-200",
        collapsed ? "w-14" : "w-52",
      )}
    >
      {/* Кнопка сворачивания */}
      <div className={cn("flex mb-2", collapsed ? "justify-center" : "justify-end px-3")}>
        <button
          type="button"
          onClick={toggle}
          title={collapsed ? "Развернуть меню" : "Свернуть меню"}
          aria-label={collapsed ? "Развернуть меню" : "Свернуть меню"}
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
        >
          {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
        </button>
      </div>

      {NAV_GROUPS.map((group) => (
        <div key={group.title} className="mb-3">
          {collapsed ? (
            <div className="mx-2 mb-1 border-t border-border/50" />
          ) : (
            <p className="px-4 mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              {group.title}
            </p>
          )}
          {group.items.map((item) => {
            const active = isActive(pathname, item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                title={collapsed ? item.label : undefined}
                className={cn(
                  "flex items-center gap-2.5 mx-2 px-2 py-1.5 rounded-md text-sm transition-colors",
                  collapsed && "justify-center mx-1.5 px-0",
                  active
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
                )}
              >
                <item.icon className={cn("w-4 h-4 shrink-0", active ? "text-primary" : "")} />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            )
          })}
        </div>
      ))}
    </nav>
  )
}
