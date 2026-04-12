"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { createPortal } from "react-dom"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  LayoutDashboard, Users, User, Briefcase, UserCheck, Layers, MessageSquare,
  Globe, Database, Rocket, BarChart3, BarChart2, FileText, Search, TrendingUp, Megaphone,
  DollarSign, Truck, Gift, Building2, CreditCard, Plug, Clock, Bell, Palette, LayoutGrid,
  Settings, Shield, ChevronRight, ChevronDown, LogOut, Calendar, CalendarDays, Share2, ShieldCheck,
  ClipboardList, ClipboardCheck, UserCheck2, Trophy, HeartHandshake, BookOpen, Award, Zap,
  AlertTriangle, UserMinus, Brain, Radar, Bot, Store, TrendingDown, Handshake,
  BookMarked, GraduationCap, Target, PieChart, FilePlus, Lock, Library,
  Sparkles, Plus, Coins, SlidersHorizontal,
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
import { PlatformBadge } from "@/components/platform-badge"
import { MODULE_REGISTRY } from "@/lib/modules/registry"
import type { ModuleId } from "@/lib/modules/types"
import { getModuleGroups } from "@/lib/sidebar/module-menus"
import { SETTINGS_MENU, ADMIN_MENU } from "@/lib/sidebar/config"
import { useSidebarVisibility } from "@/lib/hooks/use-sidebar-visibility"
import { SidebarCustomizationSheet } from "@/components/dashboard/sidebar-customization-sheet"

// ── Icon resolver ──────────────────────────────────────────────────────────
const ICON_MAP: Record<string, LucideIcon> = {
  LayoutDashboard, Users, User, Briefcase, UserCheck, Layers, MessageSquare,
  Globe, Database, Rocket, BarChart3, FileText, Search, TrendingUp, Megaphone,
  DollarSign, Truck, Gift, Building2, CreditCard, Plug, Clock, Bell, Palette, LayoutGrid,
  Settings, Shield, Calendar, CalendarDays, Share2, ShieldCheck, ClipboardList, ClipboardCheck,
  UserCheck2, Trophy, BarChart2, HeartHandshake, BookOpen, Award, Zap, ChevronRight,
  AlertTriangle, UserMinus, Brain, Radar, Bot, Store, TrendingDown, Handshake,
  BookMarked, GraduationCap, Target, PieChart, FilePlus, Library,
  Sparkles, Plus, Coins,
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
  'logistics':   'warehouse',
  'warehouse':   'warehouse',
}

const MODULE_SHORT: Record<ModuleId, string> = {
  hr:        'HR',
  knowledge: 'БЗ',
  learning:  'ОБУ',
  tasks:     'ЗДЧ',
  marketing: 'МКТ',
  sales:     'ПРД',
  b2b:       'B2B',
  ecommerce: 'ECM',
  warehouse: 'СКЛ',
  logistics: 'ЛГС',
  booking:   'БРН',
  dialer:    'ЗВН',
  qc:        'ОКК',
}

// Module accent colors for visual distinction
const MODULE_COLORS: Record<ModuleId, string> = {
  hr:        'text-blue-500',
  knowledge: 'text-amber-500',
  learning:  'text-violet-500',
  tasks:     'text-sky-500',
  marketing: 'text-purple-500',
  sales:     'text-emerald-500',
  b2b:       'text-cyan-500',
  ecommerce: 'text-rose-500',
  warehouse: 'text-orange-500',
  logistics: 'text-orange-500',
  booking:   'text-teal-500',
  dialer:    'text-red-500',
  qc:        'text-indigo-500',
}

const MODULE_BG_COLORS: Record<ModuleId, string> = {
  hr:        'bg-blue-500/10',
  knowledge: 'bg-amber-500/10',
  learning:  'bg-violet-500/10',
  tasks:     'bg-sky-500/10',
  marketing: 'bg-purple-500/10',
  sales:     'bg-emerald-500/10',
  b2b:       'bg-cyan-500/10',
  ecommerce: 'bg-rose-500/10',
  warehouse: 'bg-orange-500/10',
  logistics: 'bg-orange-500/10',
  booking:   'bg-teal-500/10',
  dialer:    'bg-red-500/10',
  qc:        'bg-indigo-500/10',
}

const MODULE_BORDER_COLORS: Record<ModuleId, string> = {
  hr:        '#3b82f6',
  knowledge: '#f59e0b',
  learning:  '#8b5cf6',
  tasks:     '#0ea5e9',
  marketing: '#a855f7',
  sales:     '#10b981',
  b2b:       '#06b6d4',
  ecommerce: '#f43f5e',
  warehouse: '#f97316',
  logistics: '#f97316',
  booking:   '#14b8a6',
  dialer:    '#ef4444',
  qc:        '#6366f1',
}

// Group colors for style C (colored icons + badge)
const GROUP_COLORS: Record<string, { text: string; bg: string }> = {
  // HR groups
  'Найм':           { text: 'text-blue-400',    bg: 'bg-blue-500/15 text-blue-400' },
  'Адаптация':      { text: 'text-teal-400',    bg: 'bg-teal-500/15 text-teal-400' },
  'Lifecycle':      { text: 'text-violet-400',  bg: 'bg-violet-500/15 text-violet-400' },
  'Обучение':       { text: 'text-pink-400',    bg: 'bg-pink-500/15 text-pink-400' },
  'Развитие':       { text: 'text-amber-400',   bg: 'bg-amber-500/15 text-amber-400' },
  'Аналитика HR':   { text: 'text-red-400',     bg: 'bg-red-500/15 text-red-400' },
  'Персонал':       { text: 'text-indigo-400',  bg: 'bg-indigo-500/15 text-indigo-400' },
  'Инструменты':    { text: 'text-emerald-400', bg: 'bg-emerald-500/15 text-emerald-400' },
  'Обзор':          { text: 'text-gray-400',    bg: 'bg-gray-500/15 text-gray-400' },
  // HR v1 accordion groups — muted slate
  'Найм (v1)':      { text: 'text-slate-500',   bg: 'bg-slate-500/10 text-slate-500' },
  'Адаптация (v1)': { text: 'text-slate-500',   bg: 'bg-slate-500/10 text-slate-500' },
  'Обучение (v1)':  { text: 'text-slate-500',   bg: 'bg-slate-500/10 text-slate-500' },
  // Marketing groups
  'Контент':       { text: 'text-purple-400',  bg: 'bg-purple-500/15 text-purple-400' },
  'Продвижение':   { text: 'text-fuchsia-400', bg: 'bg-fuchsia-500/15 text-fuchsia-400' },
  // Sales groups
  'CRM':           { text: 'text-emerald-400', bg: 'bg-emerald-500/15 text-emerald-400' },
  'Клиенты':       { text: 'text-cyan-400',    bg: 'bg-cyan-500/15 text-cyan-400' },
  'Активности':    { text: 'text-orange-400',  bg: 'bg-orange-500/15 text-orange-400' },
  // Shared
  'Аналитика':     { text: 'text-blue-400',    bg: 'bg-blue-500/15 text-blue-400' },
}

// ── Component ──────────────────────────────────────────────────────────────
export function DashboardSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { role, user, logout } = useAuth()

  const vis = getVisibleSections(role) ?? { main: true, hiring: false, tools: false, settings: false, admin: false }
  const visSettings = getVisibleSettings(role) ?? ['profile']

  // Company branding — предпочитаем brandName (короткий бренд), fallback на name.
  // fullName (юр. название) в sidebar не показываем.
  const [companyLogo, setCompanyLogo] = useState<string | null>(null)
  const [companyName, setCompanyName] = useState<string | null>(null)
  const [companySlogan, setCompanySlogan] = useState<string | null>(null)
  useEffect(() => {
    const loadCompany = () => {
      fetch('/api/companies').then(r => r.ok ? r.json() : null)
        .then((d: { logoUrl?: string; name?: string; brandName?: string; brandSlogan?: string } | null) => {
          if (d) {
            setCompanyLogo(d.logoUrl ?? null)
            const display = d.brandName?.trim() || d.name?.trim() || null
            setCompanyName(display)
            setCompanySlogan(d.brandSlogan?.trim() || null)
          }
        }).catch(() => {})
    }
    loadCompany()

    // Слушаем событие `company-updated` — branding-страница диспатчит его
    // после successful save, чтобы sidebar обновил имя/лого без перезагрузки.
    const handleUpdate = () => loadCompany()
    window.addEventListener('company-updated', handleUpdate)
    return () => window.removeEventListener('company-updated', handleUpdate)
  }, [])

  // Knowledge: review-count badge (статьи со status=review/expired)
  const [reviewCount, setReviewCount] = useState<number>(0)
  useEffect(() => {
    fetch('/api/modules/knowledge/review-count')
      .then(r => r.ok ? r.json() : null)
      .then((d: { count?: number } | null) => {
        if (typeof d?.count === 'number') setReviewCount(d.count)
      })
      .catch(() => {})
  }, [pathname])

  // Active modules fetched from API
  // TODO: включить обратно когда настроим биллинг
  // Временно все модули активны для демо
  const ALL_MODULES: ModuleId[] = ['hr', 'knowledge', 'learning', 'tasks', 'sales', 'marketing', 'warehouse', 'logistics', 'booking', 'dialer', 'qc', 'b2b', 'ecommerce']
  const [activeModules, setActiveModules] = useState<ModuleId[]>(ALL_MODULES)

  // ── Sidebar visibility customization ──
  const { visibility: sidebarVis, setVisibility: setSidebarVis, isModuleVisible, isItemVisible, resetToDefault: resetSidebarVis } = useSidebarVisibility()
  const [customizeOpen, setCustomizeOpen] = useState(false)

  // Filtered modules: active AND visible
  const visibleModules = activeModules.filter((id) => isModuleVisible(id))
  /*
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
        if (ids.length > 0) setActiveModules([...ids, ...(['knowledge', 'learning', 'sales'] as ModuleId[]).filter(k => !ids.includes(k))])
      })
      .catch(() => {})
  }, [])
  */

  // ── Hydration-safe mounted flag ──
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  // ── Accordion state: which modules are expanded ──
  // Initial value is deterministic (same on server & client) — no hydration mismatch
  const [expandedModules, setExpandedModules] = useState<Set<ModuleId>>(new Set())

  // After mount: expand module matching current path (or default to hr)
  useEffect(() => {
    if (!mounted) return
    const matchId = activeModules.find(id => pathname.startsWith(MODULE_REGISTRY[id].basePath))
    setExpandedModules(new Set<ModuleId>([matchId ?? 'hr']))
  }, [mounted]) // intentionally only on mount

  // On path change (after mount): expand matching module
  useEffect(() => {
    if (!mounted) return
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
  }, [pathname, activeModules, mounted])

  const toggleModule = useCallback((id: ModuleId) => {
    setExpandedModules(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  // ── Sub-group accordion state (persisted in sessionStorage) ──
  const GROUPS_KEY = 'sidebar:expandedGroups'
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())

  // Load from sessionStorage + auto-expand matching group on mount
  useEffect(() => {
    if (!mounted) return
    const next = new Set<string>()
    // Restore from session
    try {
      const saved = sessionStorage.getItem(GROUPS_KEY)
      if (saved) for (const k of JSON.parse(saved) as string[]) next.add(k)
    } catch {}
    // Auto-expand group matching current path
    for (const id of activeModules) {
      for (const group of getModuleGroups(id)) {
        if (group.label && group.items.some(i => !i.divider && (pathname === i.href || pathname.startsWith(i.href + '/')))) {
          next.add(`${id}:${group.label}`)
        }
      }
    }
    setExpandedGroups(next)
  }, [mounted]) // intentionally only on mount

  // Persist to sessionStorage
  useEffect(() => {
    if (!mounted) return
    try { sessionStorage.setItem(GROUPS_KEY, JSON.stringify([...expandedGroups])) } catch {}
  }, [expandedGroups, mounted])

  // On path change: auto-expand matching group
  useEffect(() => {
    if (!mounted) return
    for (const id of activeModules) {
      for (const group of getModuleGroups(id)) {
        if (group.label && group.items.some(i => !i.divider && (pathname === i.href || pathname.startsWith(i.href + '/')))) {
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
  }, [pathname, activeModules, mounted])

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
          {companyLogo ? (
            <div className="h-9 max-w-[160px] shrink-0 flex items-center justify-center overflow-hidden group-data-[collapsible=icon]:max-w-9 group-data-[collapsible=icon]:w-9">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={companyLogo}
                alt=""
                className="max-h-8 max-w-[140px] w-auto h-auto object-contain group-data-[collapsible=icon]:max-w-9"
              />
            </div>
          ) : companyName ? (
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sidebar-primary text-sidebar-primary-foreground shrink-0 text-base font-semibold">
              {companyName.trim().charAt(0).toUpperCase()}
            </div>
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sidebar-primary text-sidebar-primary-foreground shrink-0">
              <Briefcase className="size-5" />
            </div>
          )}
          <div className="overflow-hidden group-data-[collapsible=icon]:hidden min-w-0 flex-1">
            <span className="font-semibold text-sidebar-foreground text-sm tracking-tight leading-tight line-clamp-1 block">
              {companyName || "Company24.Pro"}
            </span>
            {companySlogan && (
              <span className="text-xs text-sidebar-foreground/60 line-clamp-1 block mt-0.5">
                {companySlogan}
              </span>
            )}
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 py-2 overflow-y-auto">

        {/* ══════════════════════════════════════════════════════════════════
            COLLAPSED STATE (56px): Module icons + active module menu items
           ══════════════════════════════════════════════════════════════════ */}
        <div className="hidden group-data-[collapsible=icon]:flex flex-col gap-0.5 items-center">
          {/* Module switcher icons */}
          {(Object.keys(MODULE_REGISTRY) as ModuleId[])
            .filter((id) => (id !== 'hr' || vis.hiring) && isModuleVisible(id))
            .map((id) => {
            const mod = MODULE_REGISTRY[id]
            const Icon = getIcon(mod.icon)
            const isActive = pathname.startsWith(mod.basePath)
            const isEnabled = activeModules.includes(id)
            return (
              <SidebarMenuButton
                key={id}
                tooltip={isEnabled ? mod.name : `${mod.name} — скоро`}
                isActive={isActive}
                onClick={() => isEnabled && router.push(mod.basePath)}
                className={cn(
                  "justify-center h-10 w-10",
                  isEnabled ? (isActive && MODULE_COLORS[id]) : "opacity-30 cursor-default"
                )}
              >
                <Icon className="size-5" />
              </SidebarMenuButton>
            )
          })}
          <div className="my-1 w-6 border-t border-sidebar-border" />

          {/* Active module GROUP icons (one per group) */}
          {(() => {
            const activeId = activeModules.find(id => pathname.startsWith(MODULE_REGISTRY[id].basePath)) || activeModules[0]
            if (!activeId) return null
            const groups = getModuleGroups(activeId)
            return groups.filter(g => g.items.some(i => !i.divider)).map((group) => {
              const firstItem = group.items.find(i => !i.divider)!
              const GroupIcon = getIcon(firstItem.icon)
              const gc = GROUP_COLORS[group.label]
              const hasActiveItem = group.items.some(
                item => !item.divider && (pathname === item.href || pathname.startsWith(item.href + '/'))
              )
              // Click → navigate to first item in group
              return (
                <SidebarMenuButton
                  key={group.label || '__root'}
                  tooltip={group.label || firstItem.label}
                  isActive={hasActiveItem}
                  onClick={() => router.push(firstItem.href)}
                  className={cn("justify-center h-9 w-9", gc?.text)}
                >
                  <GroupIcon className="size-4" />
                </SidebarMenuButton>
              )
            })
          })()}
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            EXPANDED STATE: Module accordions with nested group accordions
           ══════════════════════════════════════════════════════════════════ */}
        <div className="group-data-[collapsible=icon]:hidden space-y-1">
          {(Object.keys(MODULE_REGISTRY) as ModuleId[])
            .filter((id) => (id !== 'hr' || vis.hiring) && isModuleVisible(id))
            .map((id) => {
            const isModuleEnabled = activeModules.includes(id)
            const mod = MODULE_REGISTRY[id]
            const ModIcon = getIcon(mod.icon)
            const isExpanded = expandedModules.has(id)
            const isModuleActive = pathname.startsWith(mod.basePath)
            const groups = isModuleEnabled ? getModuleGroups(id) : []
            const hasItems = isModuleEnabled && groups.some(g => g.items.length > 0)

            // Single-item module → render as direct link (no accordion)
            const allItems = groups.flatMap(g => g.items)
            if (isModuleEnabled && allItems.length === 1) {
              const item = allItems[0]
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
              return (
                <Link
                  key={id}
                  href={item.href}
                  style={isActive ? { borderLeft: `3px solid ${MODULE_BORDER_COLORS[id]}` } : { borderLeft: '3px solid transparent' }}
                  className={cn(
                    "flex items-center gap-2.5 w-full px-3 py-2.5 text-sm font-semibold transition-all duration-150 rounded-none rounded-r-lg",
                    "hover:bg-sidebar-accent",
                    isActive
                      ? cn(MODULE_BG_COLORS[id], MODULE_COLORS[id])
                      : "text-sidebar-foreground/70"
                  )}
                >
                  <ModIcon className={cn("size-4 shrink-0", isActive && MODULE_COLORS[id])} />
                  <span className="flex-1 text-left">{mod.name}</span>
                </Link>
              )
            }

            return (
              <Collapsible
                key={id}
                open={mounted && isModuleEnabled && isExpanded}
                onOpenChange={() => isModuleEnabled && toggleModule(id)}
              >
                {/* ── Module header (accordion trigger) — Style A: color bar left ── */}
                {!isModuleEnabled ? (
                  <Link
                    href={`/upgrade?module=${id}`}
                    style={{ borderLeft: '3px solid transparent' }}
                    className="flex items-center gap-2.5 w-full px-3 py-2.5 text-sm font-semibold transition-all duration-150 rounded-none rounded-r-lg hover:bg-sidebar-accent/50 opacity-50 text-sidebar-foreground/70"
                  >
                    <ModIcon className="size-4 shrink-0" />
                    <span className="flex-1 text-left">{mod.name}</span>
                    <Lock className="size-3.5 text-sidebar-foreground/30" />
                  </Link>
                ) : (
                <CollapsibleTrigger
                  style={isModuleActive ? { borderLeft: `3px solid ${MODULE_BORDER_COLORS[id]}` } : { borderLeft: '3px solid transparent' }}
                  className={cn(
                    "flex items-center gap-2.5 w-full px-3 py-2.5 text-sm font-semibold transition-all duration-150 rounded-none rounded-r-lg",
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
                    <ChevronRight className={cn(
                      "size-3.5 text-sidebar-foreground/40 transition-transform duration-200",
                      mounted && isExpanded && "rotate-90"
                    )} />
                  )}
                </CollapsibleTrigger>
                )}

                {/* ── Module content: sub-groups as nested accordions ── */}
                {hasItems && (
                  <CollapsibleContent forceMount className="pl-2 mt-1 data-[state=closed]:hidden">
                    {groups.map((group) => {
                      if (group.items.length === 0) return null
                      const groupKey = `${id}:${group.label}`
                      const isGroupExpanded = expandedGroups.has(groupKey) || !group.label
                      const hasActiveItem = group.items.some(
                        item => !item.divider && (pathname === item.href || pathname.startsWith(item.href + '/'))
                      )

                      // If no label → render items directly (root group)
                      if (!group.label) {
                        return (
                          <SidebarMenu key="__root" className="gap-0.5 mt-1">
                            {group.items.filter((item) => isItemVisible(id, item.href)).map((item) => {
                              if (item.divider) {
                                return (
                                  <div key={item.href} className="px-4 py-1.5 text-[10px] text-sidebar-foreground/30 font-medium tracking-wide select-none">
                                    {item.label}
                                  </div>
                                )
                              }
                              const ItemIcon = getIcon(item.icon)
                              const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
                              const itemBadge = item.href === '/knowledge-v2/review' && reviewCount > 0 ? reviewCount : null
                              return (
                                <SidebarMenuItem key={item.href}>
                                  <SidebarMenuButton
                                    isActive={isActive}
                                    onClick={() => router.push(item.href)}
                                    className={cn(
                                      "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground h-9 pl-4",
                                      item.legacy
                                        ? "text-sidebar-foreground/40 hover:text-sidebar-foreground/60"
                                        : "text-sidebar-foreground/90"
                                    )}
                                  >
                                    <ItemIcon className="size-4" />
                                    <span className="flex-1 text-sm">{item.label}</span>
                                    {itemBadge !== null && (
                                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-400">
                                        {itemBadge}
                                      </span>
                                    )}
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
                          open={mounted && isGroupExpanded}
                          onOpenChange={() => toggleGroup(groupKey)}
                        >
                          <CollapsibleTrigger className={cn(
                            "flex items-center gap-2 w-full px-3 py-2 rounded-md text-xs font-semibold uppercase tracking-wider transition-colors",
                            group.legacy
                              ? hasActiveItem
                                ? "text-sidebar-foreground/50 bg-sidebar-accent/20"
                                : "text-sidebar-foreground/35 hover:text-sidebar-foreground/50 hover:bg-sidebar-accent/20"
                              : hasActiveItem
                                ? "text-sidebar-foreground/90 bg-sidebar-accent/40"
                                : "text-sidebar-foreground/80 hover:text-sidebar-foreground/90 hover:bg-sidebar-accent/50"
                          )}>
                            {(() => {
                              const gc = GROUP_COLORS[group.label]
                              const firstItem = group.items.find(i => !i.divider)
                              const GroupIcon = firstItem ? getIcon(firstItem.icon) : null
                              return GroupIcon ? <GroupIcon className={cn("size-3.5 shrink-0", gc?.text || (group.legacy ? "text-sidebar-foreground/30" : "text-sidebar-foreground/50"))} /> : null
                            })()}
                            <span className="flex-1 text-left">
                              {group.legacy
                                ? <>{group.label.replace(' (v1)', '')}<span className="ml-1 text-[9px] font-normal normal-case opacity-50">(v1)</span></>
                                : group.label}
                            </span>
                            <span className={cn(
                              "text-[10px] font-medium px-1.5 py-0.5 rounded-full",
                              GROUP_COLORS[group.label]?.bg || (group.legacy ? "bg-slate-500/10 text-sidebar-foreground/30" : "bg-sidebar-accent/50 text-sidebar-foreground/50")
                            )}>{group.items.filter(i => !i.divider && !i.legacy).length}</span>
                            <ChevronRight className={cn(
                              "size-3 shrink-0 transition-transform duration-150",
                              mounted && isGroupExpanded && "rotate-90"
                            )} />
                          </CollapsibleTrigger>

                          <CollapsibleContent forceMount className="data-[state=closed]:hidden">
                            <SidebarMenu className="gap-0.5 mt-1">
                              {group.items.filter((item) => isItemVisible(id, item.href)).map((item) => {
                                if (item.divider) {
                                  return (
                                    <div key={item.href} className="px-6 py-1.5 text-[10px] text-sidebar-foreground/30 font-medium tracking-wide select-none">
                                      {item.label}
                                    </div>
                                  )
                                }
                                const ItemIcon = getIcon(item.icon)
                                const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
                                const itemBadge = item.href === '/knowledge-v2/review' && reviewCount > 0 ? reviewCount : null
                                return (
                                  <SidebarMenuItem key={item.href}>
                                    <SidebarMenuButton
                                      isActive={isActive}
                                      onClick={() => router.push(item.href)}
                                      className={cn(
                                        "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground h-9 pl-6",
                                        item.legacy
                                          ? "text-sidebar-foreground/40 hover:text-sidebar-foreground/60"
                                          : "text-sidebar-foreground/90"
                                      )}
                                    >
                                      <ItemIcon className="size-4" />
                                      <span className="flex-1 text-sm">{item.label}</span>
                                      {itemBadge !== null && (
                                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-400">
                                          {itemBadge}
                                        </span>
                                      )}
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

        {/* Customize menu button */}
        <button
          onClick={() => setCustomizeOpen(true)}
          className="group-data-[collapsible=icon]:hidden flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-sidebar-foreground/40 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors w-full"
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          Настроить меню
        </button>

        <SidebarCustomizationSheet
          open={customizeOpen}
          onOpenChange={setCustomizeOpen}
          visibility={sidebarVis}
          onSave={setSidebarVis}
          onReset={resetSidebarVis}
        />

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

        <PlatformBadge />
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  )
}
