"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  LayoutDashboard, Users, User, Briefcase, UserCheck, Layers, MessageSquare,
  Globe, Database, Rocket, BarChart3, BarChart2, FileText, Search, TrendingUp, Megaphone,
  DollarSign, Truck, Gift, Building2, CreditCard, Plug, Clock, Bell, Palette, LayoutGrid,
  Settings, Shield, ChevronRight, ChevronDown, LogOut, Calendar, Share2, ShieldCheck,
  ClipboardList, ClipboardCheck, UserCheck2, Trophy, HeartHandshake, BookOpen, Award, Zap,
  AlertTriangle,
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
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
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
  DollarSign, Truck, Gift, Building2, CreditCard, Plug, Clock, Bell, Palette, LayoutGrid,
  Settings, Shield, Calendar, Share2, ShieldCheck, ClipboardList, ClipboardCheck,
  UserCheck2, Trophy, BarChart2, HeartHandshake, BookOpen, Award, Zap, ChevronRight,
  AlertTriangle, MessageSquare,
}
function getIcon(name: string): LucideIcon {
  return ICON_MAP[name] ?? Settings
}

// ── Module config ──────────────────────────────────────────────────────────
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

// Module accent colors for visual distinction
const MODULE_COLORS: Record<ModuleId, string> = {
  hr:        'text-blue-500',
  marketing: 'text-purple-500',
  sales:     'text-emerald-500',
  logistics: 'text-orange-500',
}

const MODULE_BG_COLORS: Record<ModuleId, string> = {
  hr:        'bg-blue-500/10',
  marketing: 'bg-purple-500/10',
  sales:     'bg-emerald-500/10',
  logistics: 'bg-orange-500/10',
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

  // ── Accordion state: which modules are expanded ──
  const [expandedModules, setExpandedModules] = useState<Set<ModuleId>>(() => new Set<ModuleId>(['hr']))

  // Auto-expand module matching current path
  useEffect(() => {
    for (const id of activeModules) {
      if (pathname.startsWith(MODULE_REGISTRY[id].basePath)) {
        setExpandedModules(prev => {
          if (prev.has(id)) return prev
          const next = new Set(prev)
          next.add(id)
          return next
        })
        return
      }
    }
  }, [pathname, activeModules])

  const toggleModule = useCallback((id: ModuleId) => {
    setExpandedModules(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  // ── Sub-group accordion state ──
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set())

  // Auto-expand group matching current path
  useEffect(() => {
    for (const id of activeModules) {
      const groups = getModuleGroups(id)
      for (const group of groups) {
        const match = group.items.some(
          item => pathname === item.href || pathname.startsWith(item.href + '/')
        )
        if (match && group.label) {
          const key = `${id}:${group.label}`
          setExpandedGroups(prev => {
            if (prev.has(key)) return prev
            const next = new Set(prev)
            next.add(key)
            return next
          })
        }
      }
    }
  }, [pathname, activeModules])

  const toggleGroup = useCallback((key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const filteredSettings = SETTINGS_MENU.filter((item) => {
    const key = item.href.split('/settings/')[1]
    return !key || visSettings.includes(key)
  })

  // ── Flyout state (positioned UPWARD — fixes cut-off bug) ────────────────
  type FlyoutPos = { bottom: number; left: number }
  const [settingsFlyout, setSettingsFlyout] = useState(false)
  const [adminFlyout, setAdminFlyout]       = useState(false)
  const [settingsPos, setSettingsPos]       = useState<FlyoutPos>({ bottom: 0, left: 0 })
  const [adminPos, setAdminPos]             = useState<FlyoutPos>({ bottom: 0, left: 0 })

  const settingsBtnRef  = useRef<HTMLDivElement>(null)
  const settingsPanelRef = useRef<HTMLDivElement>(null)
  const adminBtnRef     = useRef<HTMLDivElement>(null)
  const adminPanelRef   = useRef<HTMLDivElement>(null)

  // Close flyout on outside click
  useEffect(() => {
    if (!settingsFlyout && !adminFlyout) return
    const handler = (e: MouseEvent) => {
      const t = e.target as Node
      if (settingsFlyout &&
          !settingsPanelRef.current?.contains(t) &&
          !settingsBtnRef.current?.contains(t)) {
        setSettingsFlyout(false)
      }
      if (adminFlyout &&
          !adminPanelRef.current?.contains(t) &&
          !adminBtnRef.current?.contains(t)) {
        setAdminFlyout(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [settingsFlyout, adminFlyout])

  // Close on route change
  useEffect(() => {
    setSettingsFlyout(false)
    setAdminFlyout(false)
  }, [pathname])

  // FIX: Flyout opens UPWARD — bottom aligns with top of trigger button
  const openSettingsFlyout = useCallback(() => {
    if (settingsBtnRef.current) {
      const r = settingsBtnRef.current.getBoundingClientRect()
      setSettingsPos({ bottom: window.innerHeight - r.top + 4, left: r.right + 8 })
    }
    setSettingsFlyout(v => !v)
    setAdminFlyout(false)
  }, [])

  const openAdminFlyout = useCallback(() => {
    if (adminBtnRef.current) {
      const r = adminBtnRef.current.getBoundingClientRect()
      setAdminPos({ bottom: window.innerHeight - r.top + 4, left: r.right + 8 })
    }
    setAdminFlyout(v => !v)
    setSettingsFlyout(false)
  }, [])

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
            <p className="text-[11px] text-sidebar-foreground/50 tracking-wide truncate">my-komanda</p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 py-2 overflow-y-auto">

        {/* ══════════════════════════════════════════════════════════════════
            COLLAPSED STATE (56px): Vertical module icons
           ══════════════════════════════════════════════════════════════════ */}
        <div className="hidden group-data-[collapsible=icon]:flex flex-col gap-1 items-center">
          {activeModules
            .filter((id) => id !== 'hr' || vis.hiring)
            .map((id) => {
            const mod = MODULE_REGISTRY[id]
            const Icon = getIcon(mod.icon)
            const isActive = pathname.startsWith(mod.basePath)
            return (
              <SidebarMenuButton
                key={id}
                tooltip={mod.name}
                isActive={isActive}
                onClick={() => router.push(mod.basePath)}
                className={cn(
                  "justify-center h-10 w-10",
                  isActive && MODULE_COLORS[id]
                )}
              >
                <Icon className="size-5" />
              </SidebarMenuButton>
            )
          })}
          <div className="my-1.5 w-6 border-t border-sidebar-border" />
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            EXPANDED STATE: Module accordions with nested group accordions
           ══════════════════════════════════════════════════════════════════ */}
        <div className="group-data-[collapsible=icon]:hidden space-y-1">
          {activeModules
            .filter((id) => id !== 'hr' || vis.hiring)
            .map((id) => {
            const mod = MODULE_REGISTRY[id]
            const ModIcon = getIcon(mod.icon)
            const isExpanded = expandedModules.has(id)
            const isModuleActive = pathname.startsWith(mod.basePath)
            const groups = getModuleGroups(id)
            const hasItems = groups.some(g => g.items.length > 0)

            return (
              <Collapsible
                key={id}
                open={isExpanded}
                onOpenChange={() => toggleModule(id)}
              >
                {/* ── Module header (accordion trigger) ── */}
                <CollapsibleTrigger className={cn(
                  "flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm font-semibold transition-all duration-150",
                  "hover:bg-sidebar-accent",
                  isModuleActive
                    ? cn(MODULE_BG_COLORS[id], MODULE_COLORS[id])
                    : "text-sidebar-foreground/70"
                )}>
                  <ModIcon className={cn("size-4 shrink-0", isModuleActive && MODULE_COLORS[id])} />
                  <span className="flex-1 text-left">{mod.name}</span>
                  {!hasItems ? (
                    <span className="text-[10px] text-sidebar-foreground/30 font-normal">Скоро</span>
                  ) : (
                    <ChevronDown className={cn(
                      "size-3.5 text-sidebar-foreground/40 transition-transform duration-200",
                      isExpanded && "rotate-180"
                    )} />
                  )}
                </CollapsibleTrigger>

                {/* ── Module content: sub-groups as nested accordions ── */}
                {hasItems && (
                  <CollapsibleContent className="pl-2 mt-0.5">
                    {groups.map((group) => {
                      if (group.items.length === 0) return null
                      const groupKey = `${id}:${group.label}`
                      const isGroupExpanded = expandedGroups.has(groupKey) || !group.label

                      // If no label → render items directly (root group)
                      if (!group.label) {
                        return (
                          <SidebarMenu key="__root" className="gap-0.5 mt-0.5">
                            {group.items.map((item) => {
                              const ItemIcon = getIcon(item.icon)
                              const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
                              return (
                                <SidebarMenuItem key={item.href}>
                                  <SidebarMenuButton
                                    asChild
                                    isActive={isActive}
                                    className="text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground h-8 pl-4"
                                  >
                                    <Link href={item.href}>
                                      <ItemIcon className="size-3.5" />
                                      <span className="text-[13px]">{item.label}</span>
                                    </Link>
                                  </SidebarMenuButton>
                                </SidebarMenuItem>
                              )
                            })}
                          </SidebarMenu>
                        )
                      }

                      // Named group → nested accordion
                      return (
                        <Collapsible
                          key={groupKey}
                          open={isGroupExpanded}
                          onOpenChange={() => toggleGroup(groupKey)}
                        >
                          <CollapsibleTrigger className={cn(
                            "flex items-center gap-2 w-full px-3 py-1.5 rounded-md text-xs font-medium uppercase tracking-wider transition-colors",
                            "text-sidebar-foreground/45 hover:text-sidebar-foreground/70 hover:bg-sidebar-accent/50"
                          )}>
                            <ChevronRight className={cn(
                              "size-3 shrink-0 transition-transform duration-150",
                              isGroupExpanded && "rotate-90"
                            )} />
                            <span>{group.label}</span>
                          </CollapsibleTrigger>

                          <CollapsibleContent>
                            <SidebarMenu className="gap-0.5 mt-0.5">
                              {group.items.map((item) => {
                                const ItemIcon = getIcon(item.icon)
                                const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
                                return (
                                  <SidebarMenuItem key={item.href}>
                                    <SidebarMenuButton
                                      asChild
                                      isActive={isActive}
                                      className="text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground h-8 pl-6"
                                    >
                                      <Link href={item.href}>
                                        <ItemIcon className="size-3.5" />
                                        <span className="text-[13px]">{item.label}</span>
                                      </Link>
                                    </SidebarMenuButton>
                                  </SidebarMenuItem>
                                )
                              })}
                            </SidebarMenu>
                          </CollapsibleContent>
                        </Collapsible>
                      )
                    })}
                  </CollapsibleContent>
                )}
              </Collapsible>
            )
          })}
        </div>

      </SidebarContent>

      {/* ── Footer: Settings + Admin + Profile ── */}
      <SidebarFooter className="border-t border-sidebar-border p-2 space-y-1">

        {/* Settings trigger */}
        {vis.settings && (
          <div ref={settingsBtnRef}>
            <SidebarMenuButton
              tooltip="Настройки"
              onClick={openSettingsFlyout}
              isActive={settingsFlyout || pathname.startsWith("/settings")}
              className="text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground h-8 w-full"
            >
              <Settings className="size-4 shrink-0" />
              <span className="flex-1 group-data-[collapsible=icon]:hidden">Настройки</span>
              <ChevronRight className={cn(
                "size-3.5 text-sidebar-foreground/40 transition-transform duration-150 group-data-[collapsible=icon]:hidden",
                settingsFlyout && "rotate-90"
              )} />
            </SidebarMenuButton>
          </div>
        )}

        {/* Admin trigger */}
        {vis.admin && (
          <div ref={adminBtnRef}>
            <SidebarMenuButton
              tooltip="Платформа"
              onClick={openAdminFlyout}
              isActive={adminFlyout || pathname.startsWith("/admin")}
              className="text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground h-8 w-full"
            >
              <Shield className="size-4 shrink-0" />
              <span className="flex-1 group-data-[collapsible=icon]:hidden">Платформа</span>
              <ChevronRight className={cn(
                "size-3.5 text-sidebar-foreground/40 transition-transform duration-150 group-data-[collapsible=icon]:hidden",
                adminFlyout && "rotate-90"
              )} />
            </SidebarMenuButton>
          </div>
        )}

        {/* Settings flyout portal — positioned UPWARD */}
        {settingsFlyout && typeof document !== "undefined" && createPortal(
          <div
            ref={settingsPanelRef}
            style={{ position: "fixed", bottom: settingsPos.bottom, left: settingsPos.left, zIndex: 100 }}
            className="w-56 rounded-xl border border-border bg-popover shadow-xl p-1.5 animate-in slide-in-from-left-2 fade-in-0 duration-150"
          >
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest px-2 py-1.5">
              Настройки
            </p>
            {filteredSettings.map((item) => {
              const ItemIcon = getIcon(item.icon)
              const isActive = pathname === item.href || pathname.startsWith(item.href + "/")
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors",
                    isActive
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-foreground/80 hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  <ItemIcon className={cn("size-4 shrink-0", isActive && "text-primary")} />
                  <span>{item.name}</span>
                </Link>
              )
            })}
          </div>,
          document.body
        )}

        {/* Admin flyout portal — positioned UPWARD */}
        {adminFlyout && typeof document !== "undefined" && createPortal(
          <div
            ref={adminPanelRef}
            style={{ position: "fixed", bottom: adminPos.bottom, left: adminPos.left, zIndex: 100 }}
            className="w-56 rounded-xl border border-border bg-popover shadow-xl p-1.5 animate-in slide-in-from-left-2 fade-in-0 duration-150"
          >
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest px-2 py-1.5">
              Платформа
            </p>
            {ADMIN_MENU.map((item) => {
              const ItemIcon = getIcon(item.icon)
              const isActive = pathname === item.href || pathname.startsWith(item.href + "/")
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors",
                    isActive
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-foreground/80 hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  <ItemIcon className={cn("size-4 shrink-0", isActive && "text-primary")} />
                  <span>{item.name}</span>
                </Link>
              )
            })}
          </div>,
          document.body
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
