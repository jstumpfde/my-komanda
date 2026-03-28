"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  LayoutDashboard, Users, User, Briefcase, UserCheck, Layers, MessageSquare,
  Globe, Database, Rocket, BarChart3, FileText, Search, TrendingUp, Megaphone,
  DollarSign, Truck, Gift, Building2, CreditCard, Plug, Clock, Bell,
  Settings, Shield, ChevronDown, LogOut, Calendar, Share2, ShieldCheck, type LucideIcon,
} from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarFooter,
  SidebarRail,
} from "@/components/ui/sidebar"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { cn } from "@/lib/utils"
import { useAuth, getVisibleSections, getVisibleSettings, ROLE_LABELS } from "@/lib/auth"
import { MODULE_REGISTRY } from "@/lib/modules/registry"
import type { ModuleId } from "@/lib/modules/types"
import { getModuleGroups } from "@/lib/sidebar/module-menus"
import { SETTINGS_MENU, ADMIN_MENU } from "@/lib/sidebar/config"

// ── Icon resolver ──────────────────────────────────────────────────────────
const ICON_MAP: Record<string, LucideIcon> = {
  LayoutDashboard, Users, User, Briefcase, UserCheck, Layers, MessageSquare,
  Globe, Database, Rocket, BarChart3, FileText, Search, TrendingUp, Megaphone,
  DollarSign, Truck, Gift, Building2, CreditCard, Plug, Clock, Bell,
  Settings, Shield, Calendar, Share2, ShieldCheck,
}
function getIcon(name: string): LucideIcon {
  return ICON_MAP[name] ?? Settings
}

// ── Module config ──────────────────────────────────────────────────────────

// Maps DB module slugs → sidebar ModuleId
const SLUG_TO_MODULE_ID: Partial<Record<string, ModuleId>> = {
  'recruiting':  'hr',
  'hr-ops':      'hr',
  'talent-pool': 'hr',
  'marketing':   'marketing',
  'sales':       'sales',
  'logistics':   'logistics',
}

const MODULE_SHORT: Record<ModuleId, string> = {
  hr: 'HR',
  marketing: 'МКТ',
  sales: 'ПРД',
  logistics: 'ЛГС',
}

// ── Component ──────────────────────────────────────────────────────────────
export function DashboardSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { role, user, logout } = useAuth()

  const vis = getVisibleSections(role) ?? { main: true, hiring: false, tools: false, settings: false, admin: false }
  const visSettings = getVisibleSettings(role) ?? ['profile']

  // Active modules fetched from API
  const [activeModules, setActiveModules] = useState<ModuleId[]>(['hr'])
  useEffect(() => {
    fetch('/api/tenant/modules')
      .then(r => r.json())
      .then((json: unknown) => {
        const rows = (json as { data?: { slug: string; isActive: boolean }[] }).data
          ?? (json as { slug: string; isActive: boolean }[])
        const ids = Array.from(new Set(
          rows
            .filter(m => m.isActive)
            .map(m => SLUG_TO_MODULE_ID[m.slug])
            .filter((id): id is ModuleId => !!id)
        ))
        if (ids.length > 0) setActiveModules(ids)
      })
      .catch(() => { /* keep default */ })
  }, [])

  // Derive active module from pathname
  const [activeModule, setActiveModule] = useState<ModuleId>('hr')
  useEffect(() => {
    for (const id of activeModules) {
      if (pathname.startsWith(MODULE_REGISTRY[id].basePath)) {
        setActiveModule(id)
        return
      }
    }
  }, [pathname, activeModules])

  const groups = getModuleGroups(activeModule)
  const currentModule = MODULE_REGISTRY[activeModule]
  const ModuleIcon = getIcon(currentModule.icon)

  const filteredSettings = SETTINGS_MENU.filter((item) => {
    const key = item.href.split('/settings/')[1]
    return !key || visSettings.includes(key)
  })

  return (
    <Sidebar collapsible="icon" className="border-r-0">

      {/* ── Header ── */}
      <SidebarHeader className="p-4 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground shrink-0">
            <Briefcase className="size-5" />
          </div>
          <div className="overflow-hidden group-data-[collapsible=icon]:hidden">
            <span className="font-semibold text-sidebar-foreground text-base tracking-tight">Команда</span>
            <p className="text-[11px] text-sidebar-foreground/50 tracking-wide truncate">Найм лучших, создание команды</p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 py-2">

        {/* ── Module switcher: collapsed → vertical icons ── */}
        <div className="hidden group-data-[collapsible=icon]:flex flex-col gap-1 mb-2">
          {activeModules.map((id) => {
            const mod = MODULE_REGISTRY[id]
            const Icon = getIcon(mod.icon)
            return (
              <SidebarMenuButton
                key={id}
                tooltip={mod.name}
                isActive={activeModule === id}
                onClick={() => { setActiveModule(id); router.push(mod.basePath) }}
                className="justify-center"
              >
                <Icon className="size-4" />
              </SidebarMenuButton>
            )
          })}
          <div className="mx-2 my-1 border-t border-sidebar-border" />
        </div>

        {/* ── Module switcher: expanded → horizontal tabs ── */}
        <div className="group-data-[collapsible=icon]:hidden mb-3 px-1">
          <div className="flex gap-1 flex-wrap">
            {activeModules.map((id) => {
              const mod = MODULE_REGISTRY[id]
              const Icon = getIcon(mod.icon)
              return (
                <button
                  key={id}
                  onClick={() => setActiveModule(id)}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors",
                    activeModule === id
                      ? "bg-sidebar-primary text-sidebar-primary-foreground"
                      : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  )}
                >
                  <Icon className="size-3.5" />
                  {MODULE_SHORT[id]}
                </button>
              )
            })}
          </div>
        </div>

        {/* ── Module groups (динамически из registry) ── */}
        {vis.hiring && groups.map((group) => (
          <SidebarGroup key={group.label || '__root'} className="py-0 mb-0">
            {group.label && (
              <SidebarGroupLabel className="text-sidebar-foreground/40 text-[10px] font-medium uppercase tracking-widest px-3 mb-1 group-data-[collapsible=icon]:hidden">
                {group.label}
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              {group.items.length > 0 ? (
                <SidebarMenu className="gap-0.5">
                  {group.items.map((item) => {
                    const ItemIcon = getIcon(item.icon)
                    const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
                    return (
                      <SidebarMenuItem key={item.href}>
                        <SidebarMenuButton
                          asChild
                          isActive={isActive}
                          tooltip={item.label}
                          className="text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground h-8"
                        >
                          <Link href={item.href}>
                            <ItemIcon className="size-4" />
                            <span className="text-sm">{item.label}</span>
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )
                  })}
                </SidebarMenu>
              ) : (
                <p className="text-[11px] text-sidebar-foreground/30 px-3 py-1 group-data-[collapsible=icon]:hidden">
                  Скоро
                </p>
              )}
            </SidebarGroupContent>
          </SidebarGroup>
        ))}


      </SidebarContent>

      {/* ── Footer: Settings + Admin + Profile ── */}
      <SidebarFooter className="border-t border-sidebar-border p-2 space-y-1">

        {/* Settings */}
        {vis.settings && (
          <Collapsible>
            <SidebarMenuItem className="list-none">
              <CollapsibleTrigger asChild>
                <SidebarMenuButton
                  tooltip="Настройки"
                  className="text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground h-8 group/trigger"
                >
                  <Settings className="size-4" />
                  <span className="flex-1 font-medium">Настройки</span>
                  <ChevronDown className="size-3.5 transition-transform duration-200 group-data-[state=open]/trigger:rotate-180 text-sidebar-foreground/40 group-data-[collapsible=icon]:hidden" />
                </SidebarMenuButton>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SidebarMenuSub className="mt-0.5 gap-0.5">
                  {filteredSettings.map((item) => {
                    const ItemIcon = getIcon(item.icon)
                    return (
                      <SidebarMenuSubItem key={item.href}>
                        <SidebarMenuSubButton
                          asChild
                          isActive={pathname === item.href}
                          className="text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground h-7 text-xs"
                        >
                          <Link href={item.href}>
                            <ItemIcon className="size-3.5" />
                            <span>{item.name}</span>
                          </Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    )
                  })}
                </SidebarMenuSub>
              </CollapsibleContent>
            </SidebarMenuItem>
          </Collapsible>
        )}

        {/* Admin */}
        {vis.admin && (
          <Collapsible>
            <SidebarMenuItem className="list-none">
              <CollapsibleTrigger asChild>
                <SidebarMenuButton
                  tooltip="Платформа"
                  className="text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground h-8 group/trigger"
                >
                  <Shield className="size-4" />
                  <span className="flex-1 font-medium">Настройки платформы</span>
                  <ChevronDown className="size-3.5 transition-transform duration-200 group-data-[state=open]/trigger:rotate-180 text-sidebar-foreground/40 group-data-[collapsible=icon]:hidden" />
                </SidebarMenuButton>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <SidebarMenuSub className="mt-0.5 gap-0.5">
                  {ADMIN_MENU.map((item) => {
                    const ItemIcon = getIcon(item.icon)
                    return (
                      <SidebarMenuSubItem key={item.href}>
                        <SidebarMenuSubButton
                          asChild
                          isActive={pathname === item.href}
                          className="text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground h-7 text-xs"
                        >
                          <Link href={item.href}>
                            <ItemIcon className="size-3.5" />
                            <span>{item.name}</span>
                          </Link>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    )
                  })}
                </SidebarMenuSub>
              </CollapsibleContent>
            </SidebarMenuItem>
          </Collapsible>
        )}

        {/* Profile */}
        <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-sidebar-accent transition-colors group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-1">
          <Avatar className="size-8 shrink-0">
            <AvatarImage src={user.avatar} />
            <AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground text-xs font-medium">
              {user.name ? user.name.split(" ").map((w) => w[0]).slice(0, 2).join("") : '?'}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
            <p className="text-[13px] font-medium text-sidebar-foreground truncate">{user.name}</p>
            <p className="text-[11px] text-sidebar-foreground/50 truncate">{ROLE_LABELS[role]}</p>
          </div>
          <button
            onClick={() => { logout(); router.push('/login') }}
            title="Выйти"
            className="shrink-0 group-data-[collapsible=icon]:hidden w-7 h-7 rounded-md flex items-center justify-center text-sidebar-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>

      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}
