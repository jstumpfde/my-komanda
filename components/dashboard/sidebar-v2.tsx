"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayoutDashboard, Users, Briefcase, BarChart3, FileText, Calendar,
  ClipboardList, ClipboardCheck, BookOpen, Award, BarChart2,
  Settings, LogOut, ChevronRight, ChevronDown,
  type LucideIcon,
} from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  SidebarRail,
} from "@/components/ui/sidebar"
import {
  Collapsible, CollapsibleTrigger, CollapsibleContent,
} from "@/components/ui/collapsible"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { useAuth, ROLE_LABELS } from "@/lib/auth"
import { signOut } from "next-auth/react"
import { HR_MENU_GROUPS_V2, COMING_SOON_MODULES } from "@/lib/sidebar/module-menus-v2"

// ─── Иконки ────────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, LucideIcon> = {
  vacancies: Briefcase, candidates: Users, funnel: BarChart3,
  "demo-editor": FileText, interviews: Calendar, calendar: Calendar,
  onboarding: ClipboardList, plans: ClipboardCheck,
  assignments: Users, analytics: BarChart2,
  courses: BookOpen, certificates: Award,
  overview: LayoutDashboard, settings: Settings,
}

function getMenuIcon(href: string): LucideIcon {
  const key = href.split("/").pop() ?? ""
  return ICON_MAP[key] ?? LayoutDashboard
}

// ─── Активный модуль ────────────────────────────────────────────────────────

type ActiveModule = "hr" | "coming-soon"

// ─── Компонент Sidebar V2 ───────────────────────────────────────────────────

export function DashboardSidebarV2() {
  const pathname = usePathname()
  const { user, returnToAdmin, isImpersonating } = useAuth()
  const [activeModule] = useState<ActiveModule>("hr")

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + "/")

  const initials = user?.name
    ? user.name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase()
    : "?"

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <Link href="/overview" className="flex items-center gap-2 px-2 py-1.5">
              <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center shrink-0">
                <span className="text-xs font-bold text-primary-foreground">МК</span>
              </div>
              <span className="font-semibold text-sm truncate group-data-[collapsible=icon]:hidden">
                my-komanda
              </span>
            </Link>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="gap-0">
        {/* Модуль HR — рабочие группы */}
        <div className="px-2 py-1">
          {HR_MENU_GROUPS_V2.map((group) => (
            <SidebarMenuGroup
              key={group.label}
              label={group.label}
              items={group.items}
              isActive={isActive}
            />
          ))}
        </div>

        {/* Разделитель */}
        <div className="mx-4 border-t my-2 group-data-[collapsible=icon]:hidden" />

        {/* Модули "Скоро" */}
        <div className="px-2 group-data-[collapsible=icon]:hidden">
          <p className="px-2 py-1 text-xs font-medium text-muted-foreground/60 uppercase tracking-wider">
            Скоро
          </p>
          {COMING_SOON_MODULES.map((mod) => (
            <div
              key={mod.id}
              className="flex items-center gap-2 px-2 py-1.5 rounded-md text-muted-foreground/50 cursor-default text-sm"
            >
              <span className="text-base">{mod.icon}</span>
              <span>{mod.label}</span>
              <Badge variant="secondary" className="ml-auto text-xs h-4 px-1.5">
                Скоро
              </Badge>
            </div>
          ))}
        </div>

        {/* Общие ссылки */}
        <div className="mt-auto px-2 pb-2">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={isActive("/overview")}
                tooltip="Обзор"
              >
                <Link href="/overview">
                  <LayoutDashboard className="w-4 h-4" />
                  <span>Обзор</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={isActive("/settings")}
                tooltip="Настройки"
              >
                <Link href="/settings/profile">
                  <Settings className="w-4 h-4" />
                  <span>Настройки</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </div>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex items-center gap-2 px-2 py-1.5">
              <Avatar className="w-7 h-7 shrink-0">
                <AvatarFallback className="text-xs bg-primary/10 text-primary">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                <p className="text-xs font-medium truncate">{user?.name ?? "Пользователь"}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {ROLE_LABELS[user?.role ?? "observer"] ?? user?.role}
                </p>
              </div>
            </div>
          </SidebarMenuItem>

          {isImpersonating && (
            <SidebarMenuItem>
              <SidebarMenuButton onClick={returnToAdmin} size="sm">
                <ChevronRight className="w-4 h-4" />
                <span>Вернуться к admin</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}

          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={() => signOut({ callbackUrl: "/login" })}
              tooltip="Выйти"
              className="text-muted-foreground hover:text-foreground"
            >
              <LogOut className="w-4 h-4" />
              <span>Выйти</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

// ─── Группа меню с коллапсом ─────────────────────────────────────────────────

function SidebarMenuGroup({
  label, items, isActive,
}: {
  label: string
  items: { href: string; label: string; disabled?: boolean; badge?: string }[]
  isActive: (href: string) => boolean
}) {
  const hasActive = items.some((i) => isActive(i.href))
  const [open, setOpen] = useState(hasActive)

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="group/collapsible">
      <CollapsibleTrigger asChild>
        <button className="flex items-center w-full px-2 py-1 text-xs font-medium text-muted-foreground/70 hover:text-muted-foreground group-data-[collapsible=icon]:hidden">
          <span className="flex-1 uppercase tracking-wider">{label}</span>
          <ChevronDown className={cn("w-3 h-3 transition-transform", open && "rotate-180")} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <SidebarMenu>
          {items.map((item) => {
            const Icon = getMenuIcon(item.href)
            return (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  asChild={!item.disabled}
                  isActive={isActive(item.href)}
                  tooltip={item.label}
                  disabled={item.disabled}
                  className={cn(item.disabled && "opacity-40 cursor-not-allowed")}
                >
                  {item.disabled ? (
                    <span className="flex items-center gap-2">
                      <Icon className="w-4 h-4" />
                      <span>{item.label}</span>
                      {item.badge && (
                        <Badge variant="secondary" className="ml-auto text-xs h-4 px-1">
                          {item.badge}
                        </Badge>
                      )}
                    </span>
                  ) : (
                    <Link href={item.href}>
                      <Icon className="w-4 h-4" />
                      <span>{item.label}</span>
                    </Link>
                  )}
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </CollapsibleContent>
    </Collapsible>
  )
}
