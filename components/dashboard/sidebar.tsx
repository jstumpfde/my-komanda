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
  ScrollText, ClipboardList, ClipboardCheck, UserCheck2, Trophy, HeartHandshake, BookOpen, Award, Zap,
  AlertTriangle, UserMinus, Brain, Radar, Bot, Store, TrendingDown, Handshake,
  BookMarked, GraduationCap, Target, PieChart, FilePlus, Lock, Library,
  Sparkles, Plus, Coins, SlidersHorizontal, Sunrise, Activity, Inbox, Network,
  Mail, Send,
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
import { isOwnerEmail, isRestrictedWorkspace } from "@/lib/owner"
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
  Settings, Shield, Calendar, CalendarDays, Share2, ShieldCheck, ScrollText, ClipboardList, ClipboardCheck,
  UserCheck2, Trophy, BarChart2, HeartHandshake, BookOpen, Award, Zap, ChevronRight,
  AlertTriangle, UserMinus, Brain, Radar, Bot, Store, TrendingDown, Handshake,
  BookMarked, GraduationCap, Target, PieChart, FilePlus, Library,
  Sparkles, Plus, Coins, Activity, Inbox, Network, Mail, Send,
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
  // Аудит 04.07: без этих записей лицензионный фильтр молча вырезал модули
  // у ЛЮБОГО клиента с активной подпиской (не по продуктовому флагу, а как
  // побочка недостающей записи). Видят их по-прежнему только владельцы и
  // компании с явной лицензией learning/knowledge в tenant_modules.
  'learning':    'learning',
  'knowledge':   'knowledge',
  // Аудит 04.07 (продолжение): та же дыра для модулей без записи в seed.ts —
  // slug совпадает с moduleId (конвенция уже установлена для learning/knowledge
  // выше). Другой конвенции для slug в кодовой базе не найдено (grep по
  // modules.slug/tenant_modules) — реальные slug создаются вручную в админке.
  'tasks':           'tasks',
  'booking':         'booking',
  'dialer':          'dialer',
  'qc':              'qc',
  'b2b':             'b2b',
  'email_marketing': 'email_marketing',
}

const MODULE_SHORT: Record<ModuleId, string> = {
  hr:        'HR',
  knowledge: 'БЗ',
  learning:  'ОБУ',
  tasks:     'ЗДЧ',
  marketing: 'МКТ',
  sales:     'ПРД',
  b2b:       'B2B',
  warehouse: 'СКЛ',
  logistics: 'ЛГС',
  booking:   'БРН',
  dialer:    'ЗВН',
  qc:        'ОКК',
  email_marketing: 'ЕМЛ',
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
  warehouse: 'text-orange-500',
  logistics: 'text-orange-500',
  booking:   'text-teal-500',
  dialer:    'text-red-500',
  qc:        'text-indigo-500',
  email_marketing: 'text-rose-500',
}

const MODULE_BG_COLORS: Record<ModuleId, string> = {
  hr:        'bg-blue-500/10',
  knowledge: 'bg-amber-500/10',
  learning:  'bg-violet-500/10',
  tasks:     'bg-sky-500/10',
  marketing: 'bg-purple-500/10',
  sales:     'bg-emerald-500/10',
  b2b:       'bg-cyan-500/10',
  warehouse: 'bg-orange-500/10',
  logistics: 'bg-orange-500/10',
  booking:   'bg-teal-500/10',
  dialer:    'bg-red-500/10',
  qc:        'bg-indigo-500/10',
  email_marketing: 'bg-rose-500/10',
}

const MODULE_BORDER_COLORS: Record<ModuleId, string> = {
  hr:        '#3b82f6',
  knowledge: '#f59e0b',
  learning:  '#8b5cf6',
  tasks:     '#0ea5e9',
  marketing: '#a855f7',
  sales:     '#10b981',
  b2b:       '#06b6d4',
  warehouse: '#f97316',
  logistics: '#f97316',
  booking:   '#14b8a6',
  dialer:    '#ef4444',
  qc:        '#6366f1',
  email_marketing: '#f43f5e',
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
  const { role: rawRole, effectiveRole, user, logout } = useAuth()
  // Под impersonation (партнёр «Войти как клиент») роль для меню/секций = director.
  const role = effectiveRole ?? rawRole
  // Owner-only фичи (Календарь и пр.) — пока обкатываются, видны только владельцу-полигону.
  const isOwner = isOwnerEmail(user?.email)
  // Урезанный сайдбар (Ксения Сафронова / Орлинк): скрыт пункт «Кандидаты».
  const isRestricted = isRestrictedWorkspace(user?.email)

  const vis = getVisibleSections(role) ?? { main: true, hiring: false, tools: false, settings: false, admin: false }
  const isAdminOrManager = role === 'platform_admin' || role === 'platform_manager'
  const visSettings = getVisibleSettings(role) ?? ['profile']

  // Company branding — предпочитаем brandName (короткий бренд), fallback на name.
  // fullName (юр. название) в sidebar не показываем.
  const [companyLogo, setCompanyLogo] = useState<string | null>(null)
  const [companyFavicon, setCompanyFavicon] = useState<string | null>(null)
  const [companyName, setCompanyName] = useState<string | null>(null)
  const [companySlogan, setCompanySlogan] = useState<string | null>(null)
  // Вид логотипа: подложка-бейдж (padded, по умолчанию) или без неё (plain).
  // Выбирается в Настройки → Брендинг (customTheme.sidebarLogoMode).
  const [logoPadded, setLogoPadded] = useState(true)
  // Per-company оверрайд модулей из companies.enabled_modules. Берём из живого
  // ответа /api/companies (а не только из сессии), чтобы тумблеры в админке
  // применялись БЕЗ релогина — событие `company-updated` ниже перезагружает.
  // undefined = ещё не загружено (используем значение из сессии как fallback).
  const [companyModulesLive, setCompanyModulesLive] = useState<string[] | null | undefined>(undefined)
  useEffect(() => {
    const loadCompany = () => {
      fetch('/api/companies').then(r => r.ok ? r.json() : null)
        .then((d: { logoUrl?: string; name?: string; brandName?: string; brandSlogan?: string; customTheme?: Record<string, unknown>; enabledModules?: string[] | null } | null) => {
          if (d) {
            setCompanyLogo(d.logoUrl ?? null)
            const display = d.brandName?.trim() || d.name?.trim() || null
            setCompanyName(display)
            setCompanySlogan(d.brandSlogan?.trim() || null)
            const theme = d.customTheme as Record<string, unknown> | undefined
            setLogoPadded(theme?.sidebarLogoMode !== "plain")
            setCompanyFavicon((theme?.faviconUrl as string | undefined) ?? null)
            setCompanyModulesLive(Array.isArray(d.enabledModules) && d.enabledModules.length > 0 ? d.enabledModules : null)
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

  // ── Hydration-safe mounted flag ──
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  // ── «Найм → Вакансии»: раскрывающийся список активных вакансий ──
  // Развёрнутость — localStorage; список грузится лениво, только когда раздел
  // раскрыт (и ещё не загружен).
  const VACANCIES_EXPANDED_KEY = 'sidebar:vacanciesExpanded'
  const [vacanciesExpanded, setVacanciesExpanded] = useState(false)
  const [vacanciesList, setVacanciesList] = useState<{ id: string; title: string; createdAt: string | null }[] | null>(null)
  const [vacanciesLoading, setVacanciesLoading] = useState(false)

  useEffect(() => {
    if (!mounted) return
    try {
      setVacanciesExpanded(localStorage.getItem(VACANCIES_EXPANDED_KEY) === 'true')
    } catch {}
  }, [mounted])

  const loadVacanciesList = useCallback(() => {
    if (vacanciesList !== null || vacanciesLoading) return
    setVacanciesLoading(true)
    fetch('/api/modules/hr/vacancies?limit=200&scope=active')
      .then(r => r.ok ? r.json() : null)
      .then((d: { vacancies?: { id: string; title: string; createdAt: string | null }[] } | null) => {
        setVacanciesList(Array.isArray(d?.vacancies) ? d.vacancies : [])
      })
      .catch(() => setVacanciesList([]))
      .finally(() => setVacanciesLoading(false))
  }, [vacanciesList, vacanciesLoading])

  const toggleVacancies = useCallback(() => {
    setVacanciesExpanded(prev => {
      const next = !prev
      try { localStorage.setItem(VACANCIES_EXPANDED_KEY, String(next)) } catch {}
      if (next) loadVacanciesList()
      return next
    })
  }, [loadVacanciesList])

  // Если развёрнуто уже при загрузке (сохранено в localStorage) — подгружаем список.
  useEffect(() => {
    if (mounted && vacanciesExpanded) loadVacanciesList()
  }, [mounted, vacanciesExpanded]) // eslint-disable-line react-hooks/exhaustive-deps

  const vacanciesTop5 = (vacanciesList ?? [])
    .slice()
    .sort((a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime())
    .slice(0, 5)
  const vacanciesHasMore = (vacanciesList?.length ?? 0) > 5

  // Active modules — берутся из getVisibleSections(role) на основе роли пользователя
  // platform_admin/platform_manager → все модули
  // director/hr_lead/hr_manager/... → только HR + БЗ (для клиентов)
  // E-commerce: убран из меню, планируется позже
  const ALL_MODULES_FOR_ROLE = (vis.modules ?? ['hr', 'knowledge', 'learning', 'tasks', 'sales', 'marketing', 'warehouse', 'logistics', 'booking', 'dialer', 'qc', 'b2b']) as ModuleId[]
  const [activeModules, setActiveModules] = useState<ModuleId[]>(ALL_MODULES_FOR_ROLE)

  // STAGING-ONLY: всем КЛИЕНТСКИМ ролям на new.company24.pro открываем ПОЛНЫЙ HR +
  // Базу знаний (для редактирования/тестов). На проде остаётся клиентский lite-режим.
  // Гейт по hostname — клиентский, поэтому через состояние после маунта (без
  // SSR-рассинхрона). Прод НЕ затрагивается. Позже откроем и на проде по команде.
  const [stagingFullAccess, setStagingFullAccess] = useState(false)
  useEffect(() => {
    setStagingFullAccess(
      !isAdminOrManager && role !== 'employee' &&
      typeof window !== 'undefined' && window.location.hostname === 'new.company24.pro'
    )
  }, [role, isAdminOrManager])
  // PROD-пилот: компаниям из NEXT_PUBLIC_PILOT_COMPANY_IDS открываем полное
  // HR-меню (как на стейджинге) — для догфудинга на проде. Остальные клиенты — lite.
  const pilotCompanyIds = (process.env.NEXT_PUBLIC_PILOT_COMPANY_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  const pilotCompanyFull =
    !isAdminOrManager && !!user?.companyId && pilotCompanyIds.includes(user.companyId)
  // ПОЛНЫЙ сайдбар (ВСЕ модули) для отдельных компаний: демо-витрина и компании из
  // NEXT_PUBLIC_FULL_MODULE_COMPANY_IDS. Нужно, чтобы партнёр, зайдя «как клиент»,
  // видел всю платформу, и чтобы демо показывало все модули — БЕЗ повышения роли
  // до platform_admin (роль остаётся director — это «как у клиента»).
  const fullModuleCompanyIds = (process.env.NEXT_PUBLIC_FULL_MODULE_COMPANY_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  const DEMO_SHOWCASE_COMPANY_ID = "ae75117f-a3b7-49f5-abf3-8b3fbd9e3de9"
  const fullModulesCompany =
    !isAdminOrManager && !!user?.companyId &&
    (user.companyId === DEMO_SHOWCASE_COMPANY_ID || fullModuleCompanyIds.includes(user.companyId))
  // Директор/владелец компании видят ПОЛНОЕ HR-меню (Рабочий стол, Кандидаты,
  // Отчёт, Настройки HR), а не урезанное «только Вакансии». Урезанное — для
  // прочих HR-ролей (hr_lead/hr_manager/observer и т.п.).
  const hrLite = !isOwner && !isAdminOrManager && !stagingFullAccess && !pilotCompanyFull && !fullModulesCompany && role !== 'director' && role !== 'client'

  // Per-company оверрайд модулей из админки (companies.enabled_modules → session).
  //   null/пусто      → grandfather (модули по роли + существующие оверрайды);
  //   непустой массив → компания видит ИМЕННО эти ключи модулей (с hr как минимум).
  // НЕ применяется для платформенных ролей, owner-полигона и демо-витрины
  // (fullModulesCompany) — они всегда видят всё.
  const ALL_MODULE_KEYS = useRef(new Set<ModuleId>(['hr', 'knowledge', 'learning', 'tasks', 'sales', 'marketing', 'warehouse', 'logistics', 'booking', 'dialer', 'qc', 'b2b'])).current
  // Источник истины — живой ответ /api/companies (применяется без релогина);
  // пока он не загружен (undefined) — fallback на значение из сессии.
  const companyModulesRaw = companyModulesLive !== undefined ? companyModulesLive : (user?.enabledModules ?? null)
  // Нормализация: оставляем только валидные ключи; всегда гарантируем hr.
  const companyEnabledModules: ModuleId[] | null =
    !isOwner && !isAdminOrManager && !fullModulesCompany &&
    Array.isArray(companyModulesRaw) && companyModulesRaw.length > 0
      ? (() => {
          const set = new Set<ModuleId>(['hr'])
          for (const k of companyModulesRaw) if (ALL_MODULE_KEYS.has(k as ModuleId)) set.add(k as ModuleId)
          return Array.from(set)
        })()
      : null
  const companyEnabledKey = companyEnabledModules ? companyEnabledModules.join(',') : ''

  // Пересчёт модулей при изменении роли (когда useSession догружает данные)
  useEffect(() => {
    const base = (vis.modules ?? ['hr', 'knowledge', 'learning', 'tasks', 'sales', 'marketing', 'warehouse', 'logistics', 'booking', 'dialer', 'qc', 'b2b']) as ModuleId[]
    const newModules: ModuleId[] = [...base]
    const add = (m: ModuleId) => { if (!newModules.includes(m)) newModules.push(m) }
    // Стейджинг: клиентам открываем Базу знаний + Продажи для тестов.
    if (stagingFullAccess) { add('knowledge' as ModuleId); add('sales' as ModuleId) }
    // PROD-пилот (по NEXT_PUBLIC_PILOT_COMPANY_IDS): открываем Продажи указанным компаниям.
    if (pilotCompanyFull) add('sales' as ModuleId)
    // Демо-витрина / полнодоступные компании: открываем ВСЕ модули сайдбара.
    if (fullModulesCompany) {
      for (const m of (['hr', 'knowledge', 'learning', 'tasks', 'sales', 'marketing', 'warehouse', 'logistics', 'booking', 'dialer', 'qc', 'b2b'] as ModuleId[])) add(m)
    }
    // Админ-оверрайд видимых модулей (companies.enabled_modules) — ПОСЛЕДНИЙ в
    // цепочке. Непустой список → показываем РОВНО заданные модули (hr гарантирован
    // нормализацией). Это ОВЕРРАЙД роли и стейджинг/пилот-расширений: например,
    // если админ задал ['hr'], стейджинг-добавки knowledge/sales отбрасываются.
    const finalModules = companyEnabledModules
      ? newModules.filter((m) => companyEnabledModules.includes(m))
      : newModules
    // Защита: если фильтр случайно опустошил список — оставляем hr (никогда пусто).
    const safeModules = finalModules.length > 0 ? finalModules : (['hr'] as ModuleId[])
    setActiveModules(prev => {
      if (prev.length === safeModules.length && prev.every((m, i) => m === safeModules[i])) return prev
      return safeModules
    })
  }, [vis.modules, stagingFullAccess, pilotCompanyFull, fullModulesCompany, companyEnabledKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sidebar visibility customization ──
  const { visibility: sidebarVis, setVisibility: setSidebarVis, isModuleVisible, isItemVisible, resetToDefault: resetSidebarVis } = useSidebarVisibility()
  const [customizeOpen, setCustomizeOpen] = useState(false)

  // ── Лицензированные модули из /api/tenant/modules ──
  // Логика grandfather: платформенным админам и при пустом/ошибочном ответе —
  // показываем всё (как раньше, по роли). Гейтим только если API вернул
  // непустой список — тогда пересекаем с ролевым списком.
  useEffect(() => {
    // OPT-IN: фильтр меню по лицензии включается только NEXT_PUBLIC_MODULE_GATING=true
    // (синхронно с middleware MODULE_GATING_ENABLED). Пока реестр модулей неполный —
    // ВЫКЛ по умолчанию, чтобы не прятать «База знаний»/«Обучение» у текущих клиентов.
    if (process.env.NEXT_PUBLIC_MODULE_GATING !== "true") return
    // Платформенные администраторы видят все модули всегда
    if (isAdminOrManager) return

    fetch('/api/tenant/modules')
      .then(r => r.ok ? r.json() : null)
      .then((json: unknown) => {
        if (!json) return // ошибка → grandfather (не скрываем)

        const rows: { slug: string; isActive: boolean }[] =
          (json as { data?: { slug: string; isActive: boolean }[] }).data
          ?? (json as { slug: string; isActive: boolean }[])
          ?? []

        // Grandfather: если у компании нет ни одной записи → не ограничиваем
        if (!Array.isArray(rows) || rows.length === 0) return

        // Есть записи — вычисляем лицензированные moduleId
        const licensedIds = Array.from(new Set(
          rows
            .filter(m => m.isActive)
            .map(m => SLUG_TO_MODULE_ID[m.slug])
            .filter((id): id is ModuleId => !!id)
        ))

        // Grandfather: если нет ни одного активного модуля (все деактивированы) → не ограничиваем
        if (licensedIds.length === 0) return

        // Пересечение: ролевой список ∩ лицензированный список
        setActiveModules(prev => {
          const filtered = prev.filter(id => licensedIds.includes(id))
          // Если пересечение пустое → grandfather (возвращаем всё)
          if (filtered.length === 0) return prev
          if (filtered.length === prev.length && filtered.every((m, i) => m === prev[i])) return prev
          return filtered
        })
      })
      .catch(() => {}) // ошибка сети → grandfather (не скрываем)
  }, [isAdminOrManager])

  // Filtered modules: active AND visible
  const visibleModules = activeModules.filter((id) => isModuleVisible(id))

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
      for (const group of getModuleGroups(id, hrLite)) {
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
      for (const group of getModuleGroups(id, hrLite)) {
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

  // «Вакансии» — раскрывающийся пункт меню (после «Рабочего стола»): клик по
  // шеврону/пункту показывает топ-5 активных вакансий компании + «Все вакансии →».
  // 0 вакансий → пункт ведёт сразу на /hr/vacancies без раскрытия.
  const renderVacanciesItem = (pl: string) => {
    const isVacanciesActive = pathname === '/hr/vacancies' || pathname.startsWith('/hr/vacancies/')
    const noVacancies = vacanciesList !== null && vacanciesList.length === 0

    if (noVacancies) {
      return (
        <SidebarMenuItem key="/hr/vacancies">
          <SidebarMenuButton
            asChild
            isActive={isVacanciesActive}
            className={cn("hover:bg-sidebar-accent hover:text-sidebar-accent-foreground h-9", pl, "text-sidebar-foreground/90")}
          >
            <Link href="/hr/vacancies">
              <Briefcase className="size-4" />
              <span className="flex-1 text-sm select-none">Вакансии</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      )
    }

    return (
      <SidebarMenuItem key="/hr/vacancies">
        <div className="flex items-center">
          <SidebarMenuButton
            asChild
            isActive={isVacanciesActive && !vacanciesExpanded}
            className={cn("hover:bg-sidebar-accent hover:text-sidebar-accent-foreground h-9 flex-1", pl, "text-sidebar-foreground/90")}
          >
            <Link href="/hr/vacancies">
              <Briefcase className="size-4" />
              <span className="flex-1 text-sm select-none">Вакансии</span>
            </Link>
          </SidebarMenuButton>
          <button
            type="button"
            onClick={toggleVacancies}
            aria-label={vacanciesExpanded ? "Свернуть список вакансий" : "Развернуть список вакансий"}
            aria-expanded={vacanciesExpanded}
            className="shrink-0 h-9 w-7 flex items-center justify-center text-sidebar-foreground/40 hover:text-sidebar-foreground/80 hover:bg-sidebar-accent rounded-md"
          >
            <ChevronRight className={cn("size-3.5 transition-transform duration-150", vacanciesExpanded && "rotate-90")} />
          </button>
        </div>
        {vacanciesExpanded && (
          <div className={cn("mt-0.5 space-y-0.5", pl === "pl-4" ? "pl-4" : "pl-6")}>
            {vacanciesLoading && vacanciesList === null && (
              <div className="px-2 py-1.5 text-xs text-sidebar-foreground/40 select-none">Загрузка…</div>
            )}
            {vacanciesTop5.map((v) => {
              const href = `/hr/vacancies/${v.id}?tab=candidates`
              const isActive = pathname === `/hr/vacancies/${v.id}`
              return (
                <Link
                  key={v.id}
                  href={href}
                  className={cn(
                    "flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors truncate",
                    isActive
                      ? "bg-sidebar-accent/60 text-sidebar-foreground"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground/90"
                  )}
                >
                  <span className="truncate select-none">{v.title}</span>
                </Link>
              )
            })}
            {vacanciesHasMore && (
              <Link
                href="/hr/vacancies"
                className="flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-sidebar-foreground/50 hover:bg-sidebar-accent/40 hover:text-sidebar-foreground/80 transition-colors"
              >
                Все вакансии →
              </Link>
            )}
          </div>
        )}
      </SidebarMenuItem>
    )
  }

  const filteredSettings = SETTINGS_MENU.filter((item) => {
    const key = item.href.split('/settings/')[1]
    return isOwner || !key || visSettings.includes(key)
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
      <SidebarHeader className="p-4 group-data-[collapsible=icon]:p-2 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          {companyLogo ? (
            <div className={cn(
              // Подложка-бейдж выбирается в Брендинге: padded — белый фон (любой
              // логотип читается на тёмном сайдбаре), plain — логотип без подложки.
              "shrink-0 flex items-center justify-center overflow-hidden rounded-md",
              logoPadded && "bg-white p-0.5",
              "h-10 w-auto max-w-[140px] min-w-10",
              // Свёрнутый сайдбар: ровный квадрат 32×32 (сбрасываем min-w-10, иначе
              // бокс растягивается до 40×32 — «вытянутость»), центрируем по рейлу.
              "group-data-[collapsible=icon]:w-8 group-data-[collapsible=icon]:h-8 group-data-[collapsible=icon]:min-w-0 group-data-[collapsible=icon]:max-w-8 group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:rounded-[6px] group-data-[collapsible=icon]:p-0.5",
            )}>
              {/* Раскрытый сайдбар → полный логотип */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={companyLogo}
                alt=""
                className={cn(
                  "max-h-full max-w-full object-contain",
                  // C: если задан фавикон — скрываем логотип в свёрнутом состоянии
                  companyFavicon && "group-data-[collapsible=icon]:hidden",
                )}
              />
              {/* C: фавикон — показывается только в свёрнутом состоянии */}
              {companyFavicon && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={companyFavicon}
                  alt=""
                  className="hidden group-data-[collapsible=icon]:block max-h-full max-w-full object-contain"
                />
              )}
            </div>
          ) : companyName ? (
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground shrink-0 text-base font-semibold">
              {companyName.trim().charAt(0).toUpperCase()}
            </div>
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground shrink-0">
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
          {/* AI-инструменты: Конфигуратор, Цели, Утренний обзор */}
          {isAdminOrManager && (<>
          <SidebarMenuButton
            tooltip="Конфигуратор"
            isActive={pathname.startsWith("/configurator")}
            onClick={() => router.push("/configurator")}
            className={cn(
              "justify-center h-10 w-10",
              pathname.startsWith("/configurator") && "text-indigo-400"
            )}
          >
            <Sparkles className="size-5" />
          </SidebarMenuButton>
          <SidebarMenuButton
            tooltip="Мои цели"
            isActive={pathname.startsWith("/goals")}
            onClick={() => router.push("/goals")}
            className={cn(
              "justify-center h-10 w-10",
              pathname.startsWith("/goals") && "text-violet-400"
            )}
          >
            <Target className="size-5" />
          </SidebarMenuButton>
          <SidebarMenuButton
            tooltip="Утренний обзор"
            isActive={pathname.startsWith("/morning-brief")}
            onClick={() => router.push("/morning-brief")}
            className={cn(
              "justify-center h-10 w-10",
              pathname.startsWith("/morning-brief") && "text-amber-400"
            )}
          >
            <Sunrise className="size-5" />
          </SidebarMenuButton>
          </>)}
          <div className="my-1 w-6 border-t border-sidebar-border" />

          {/* Module switcher icons */}
          {(Object.keys(MODULE_REGISTRY) as ModuleId[])
            .filter((id) => isOwner || ((id !== 'hr' || vis.hiring || stagingFullAccess) && isModuleVisible(id) && activeModules.includes(id)))
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
          {/* «Календарь» — отдельный пункт после модулей (owner-only, обкатка) */}
          {isOwner && (
            <SidebarMenuButton
              tooltip="Календарь"
              isActive={pathname.startsWith('/hr/calendar')}
              onClick={() => router.push('/hr/calendar')}
              className="justify-center h-10 w-10"
            >
              <Calendar className="size-5" />
            </SidebarMenuButton>
          )}
          <div className="my-1 w-6 border-t border-sidebar-border" />

          {/* Active module GROUP icons (one per group) */}
          {(() => {
            const activeId = activeModules.find(id => pathname.startsWith(MODULE_REGISTRY[id].basePath)) || activeModules[0]
            if (!activeId) return null
            const groups = getModuleGroups(activeId, hrLite)
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
          {/* AI-инструменты: Конфигуратор / Мои цели / Утренний обзор */}
          {isAdminOrManager && ([
            { href: "/configurator", label: "Конфигуратор", Icon: Sparkles, accent: "indigo", color: "#818cf8" },
            { href: "/goals",        label: "Мои цели",      Icon: Target,   accent: "violet", color: "#a78bfa" },
            { href: "/morning-brief",label: "Утренний обзор", Icon: Sunrise,  accent: "amber",  color: "#fbbf24" },
          ] as const).map(({ href, label, Icon, accent, color }) => {
            const isActive = pathname.startsWith(href)
            const textActive =
              accent === "indigo" ? "bg-indigo-500/10 text-indigo-400"
              : accent === "violet" ? "bg-violet-500/10 text-violet-400"
              : "bg-amber-500/10 text-amber-400"
            const iconActive =
              accent === "indigo" ? "text-indigo-400"
              : accent === "violet" ? "text-violet-400"
              : "text-amber-400"
            return (
              <Link
                key={href}
                href={href}
                style={isActive ? { borderLeft: `3px solid ${color}` } : { borderLeft: "3px solid transparent" }}
                className={cn(
                  "flex items-center gap-2.5 w-full px-3 py-2.5 text-sm font-semibold transition-all duration-150 rounded-none rounded-r-lg",
                  "hover:bg-sidebar-accent",
                  isActive ? textActive : "text-sidebar-foreground/70"
                )}
              >
                <Icon className={cn("size-4 shrink-0", isActive && iconActive)} />
                <span className="flex-1 text-left">{label}</span>
                {href === "/configurator" && (
                  <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-indigo-500/15 text-indigo-400">AI</span>
                )}
              </Link>
            )
          })}
          <div className="my-1.5 mx-3 border-t border-sidebar-border/60" />

          {(Object.keys(MODULE_REGISTRY) as ModuleId[])
            .filter((id) => isOwner || ((id !== 'hr' || vis.hiring || stagingFullAccess) && isModuleVisible(id) && activeModules.includes(id)))
            .map((id) => {
            const isModuleEnabled = isOwner || activeModules.includes(id)
            const mod = MODULE_REGISTRY[id]
            const ModIcon = getIcon(mod.icon)
            const isExpanded = expandedModules.has(id)
            const isModuleActive = pathname.startsWith(mod.basePath)
            const groups = isModuleEnabled ? getModuleGroups(id, hrLite) : []
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
                            {group.items.filter((item) => isOwner || (isItemVisible(id, item.href) && !(isRestricted && item.href === '/hr/candidates'))).map((item) => {
                              if (item.href === '/hr/vacancies') {
                                return renderVacanciesItem("pl-4")
                              }
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
                                    asChild
                                    isActive={isActive}
                                    className={cn(
                                      "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground h-9 pl-4",
                                      item.legacy
                                        ? "text-sidebar-foreground/40 hover:text-sidebar-foreground/60"
                                        : "text-sidebar-foreground/90"
                                    )}
                                  >
                                    <Link href={item.href}>
                                      <ItemIcon className="size-4" />
                                      <span className="flex-1 text-sm select-none">{item.label}</span>
                                      {itemBadge !== null && (
                                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-400">
                                          {itemBadge}
                                        </span>
                                      )}
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
                          open={mounted && isGroupExpanded}
                          onOpenChange={() => toggleGroup(groupKey)}
                        >
                          <CollapsibleTrigger className={cn(
                            "flex items-center gap-2 w-full px-3 py-2 rounded-md text-xs font-semibold tracking-wide transition-colors",
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
                            <ChevronRight className={cn(
                              "size-3 shrink-0 transition-transform duration-150",
                              mounted && isGroupExpanded && "rotate-90"
                            )} />
                          </CollapsibleTrigger>

                          <CollapsibleContent forceMount className="data-[state=closed]:hidden">
                            <SidebarMenu className="gap-0.5 mt-1">
                              {group.items.filter((item) => isOwner || (isItemVisible(id, item.href) && !(isRestricted && item.href === '/hr/candidates'))).map((item) => {
                                if (item.href === '/hr/vacancies') {
                                  return renderVacanciesItem("pl-6")
                                }
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
                                      asChild
                                      isActive={isActive}
                                      className={cn(
                                        "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground h-9 pl-6",
                                        item.legacy
                                          ? "text-sidebar-foreground/40 hover:text-sidebar-foreground/60"
                                          : "text-sidebar-foreground/90"
                                      )}
                                    >
                                      <Link href={item.href}>
                                        <ItemIcon className="size-4" />
                                        <span className="flex-1 text-sm select-none">{item.label}</span>
                                        {itemBadge !== null && (
                                          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-400">
                                            {itemBadge}
                                          </span>
                                        )}
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

          {/* «Календарь» — отдельный пункт меню после модулей (owner-only, обкатка) */}
          {isOwner && (() => {
            const calActive = pathname === '/hr/calendar' || pathname.startsWith('/hr/calendar/')
            return (
              <Link
                href="/hr/calendar"
                style={calActive ? { borderLeft: '3px solid #a78bfa' } : { borderLeft: '3px solid transparent' }}
                className={cn(
                  "flex items-center gap-2.5 w-full px-3 py-2.5 text-sm font-semibold transition-all duration-150 rounded-none rounded-r-lg hover:bg-sidebar-accent",
                  calActive ? "bg-sidebar-accent text-sidebar-foreground" : "text-sidebar-foreground/70",
                )}
              >
                <Calendar className="size-4 shrink-0" />
                <span className="flex-1 text-left">Календарь</span>
              </Link>
            )
          })()}
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

        {/* Customize menu button — только для platform_admin / platform_manager */}
        {isAdminOrManager && (
          <button
            onClick={() => setCustomizeOpen(true)}
            className="group-data-[collapsible=icon]:hidden flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-sidebar-foreground/40 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors w-full"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            Настроить меню
          </button>
        )}

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
