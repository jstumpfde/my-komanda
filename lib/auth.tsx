"use client"

import { createContext, useContext, useState, type ReactNode } from "react"
import { useSession } from "next-auth/react"
import { signOut as nextAuthSignOut } from "next-auth/react"

// ─── Роли ──────────────────────────────────────────────────────
// Платформа (скрыты от клиента): platform_admin, platform_manager
// Клиент: director, hr_lead, hr_manager, department_head, observer

// Роли и роль-хелперы вынесены в серверно-безопасный lib/roles.ts (без "use client").
// Здесь импортируем для локального использования и реэкспортируем — чтобы все
// существующие импорты `from "@/lib/auth"` (тип и хелперы) продолжали работать.
import {
  type UserRole,
  PLATFORM_ROLES,
  CLIENT_ROLES,
  COMPANY_OWNER_ROLES,
  isPlatformRole,
  isCompanyOwner,
} from "@/lib/roles"

export type { UserRole }
export { PLATFORM_ROLES, CLIENT_ROLES, COMPANY_OWNER_ROLES, isPlatformRole, isCompanyOwner }

export interface User {
  id: string
  name: string
  firstName?: string | null
  lastName?: string | null
  email: string
  role: UserRole
  companyId?: string | null
  company?: string
  avatar?: string
  // Per-company оверрайд видимых модулей сайдбара (companies.enabled_modules).
  //   null/undefined  — grandfather (модули по роли, текущее поведение);
  //   непустой массив — компания видит ИМЕННО эти ключи модулей.
  enabledModules?: string[] | null
}

interface AuthContextValue {
  user: User
  role: UserRole
  realRole: UserRole
  // Эффективная роль с учётом impersonation (партнёр «Войти как клиент» = director).
  // null = обычный режим. Сайдбар/секции используют effectiveRole ?? role.
  effectiveRole: UserRole | null
  // Активная impersonation-сессия партнёра (плашка возврата).
  actingAs: { clientCompanyId: string; clientName: string; mode?: "partner" | "admin" } | null
  isLoggedIn: boolean
  isViewingAs: boolean
  setRole: (role: UserRole) => void
  hasAccess: (allowed: UserRole[]) => boolean
  returnToAdmin: () => void
  login: (role: UserRole) => void
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

const STORAGE_VIEW_ROLE = "hireflow-view-role"

const FALLBACK_USER: User = {
  id: "",
  // #29: было "Загрузка..." — пугало пользователя при первом заходе, что
  // система не помнит его. Пустая строка позволяет UI решать fallback
  // (например, в dashboard: `${greeting}!` без имени).
  name: "",
  email: "",
  role: "platform_admin",
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession()
  const [viewRole, setViewRoleState] = useState<UserRole | null>(null)

  const ROLE_MIGRATION: Record<string, string> = { admin: "platform_admin", manager: "platform_manager", client: "director", client_hr: "hr_manager", candidate: "observer" }
  const rawDbRole = session?.user?.role ?? "platform_admin"
  const realRole = (ROLE_MIGRATION[rawDbRole] ?? rawDbRole) as UserRole
  const role: UserRole = (viewRole ?? realRole)

  // Impersonation (партнёр «Войти как клиент») — приходит из session callback.
  const effectiveRole: UserRole | null = (session?.user?.effectiveRole as UserRole | undefined) ?? null
  const actingAs = session?.user?.actingAs ?? null

  const isLoggedIn = status === "authenticated" && !!session?.user

  const user: User = session?.user
    ? {
        id: session.user.id,
        name: session.user.name ?? "",
        firstName: session.user.firstName ?? null,
        lastName: session.user.lastName ?? null,
        email: session.user.email ?? "",
        role,
        companyId: session.user.companyId ?? null,
        avatar: session.user.avatarUrl ?? undefined,
        enabledModules: session.user.enabledModules ?? null,
      }
    : FALLBACK_USER

  const setRole = (r: UserRole) => {
    setViewRoleState(r)
    if (typeof window !== "undefined") localStorage.setItem(STORAGE_VIEW_ROLE, r)
  }

  const returnToAdmin = () => {
    setViewRoleState(null)
    if (typeof window !== "undefined") localStorage.removeItem(STORAGE_VIEW_ROLE)
  }

  const login = (_r: UserRole) => {}

  const logout = () => {
    setViewRoleState(null)
    nextAuthSignOut({ callbackUrl: "/login" })
  }

  const isViewingAs = viewRole !== null && viewRole !== realRole
  const hasAccess = (allowed: UserRole[]) => allowed.includes(role)

  return (
    <AuthContext.Provider value={{
      user, role, realRole, effectiveRole, actingAs, isLoggedIn, isViewingAs,
      setRole, hasAccess, returnToAdmin, login, logout,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error("useAuth must be used within AuthProvider")
  return ctx
}

export const ROLE_LABELS: Record<UserRole, string> = {
  platform_admin: "Админ",
  platform_manager: "Менеджер платформы",
  admin: "Администратор",
  director: "Директор",
  client: "Владелец компании",
  hr_lead: "Главный HR",
  hr_manager: "HR-менеджер",
  department_head: "Руководитель отдела",
  observer: "Наблюдатель",
  tester_hr: "Тестировщик HR",
  employee: "Сотрудник",
  partner: "Партнёр",
  sales_manager: "Менеджер продаж",
  account_manager: "Клиентский менеджер",
}

export const ROLE_ICONS: Record<UserRole, string> = {
  platform_admin: "👑",
  platform_manager: "🤝",
  admin: "👑",
  director: "👔",
  client: "👔",
  hr_lead: "🛡️",
  hr_manager: "🏢",
  department_head: "👥",
  observer: "👁️",
  tester_hr: "🧪",
  employee: "👤",
  partner: "🤝",
  sales_manager: "💼",
  account_manager: "🧑‍💼",
}

// Sidebar visibility per role
// Полный список модулей для платформенных ролей
const ALL_MODULES_LIST = ['hr', 'knowledge', 'learning', 'tasks', 'sales', 'marketing', 'warehouse', 'logistics', 'booking', 'dialer', 'qc', 'b2b']
// Урезанный список для клиентов (видят только HR + БЗ)
const CLIENT_MODULES_LIST = ['hr']

export function getVisibleSections(role: UserRole) {
  switch (role) {
    case "platform_admin":
      return { main: true, hiring: true, tools: true, settings: true, admin: true, modules: ALL_MODULES_LIST }
    case "admin": // legacy супер-админ = уровень platform_admin
      return { main: true, hiring: true, tools: true, settings: true, admin: true, modules: ALL_MODULES_LIST }
    case "platform_manager":
      return { main: true, hiring: true, tools: true, settings: false, admin: false, modules: ALL_MODULES_LIST }
    case "director":
      return { main: true, hiring: true, tools: true, settings: true, admin: false, modules: CLIENT_MODULES_LIST }
    case "client": // legacy владелец компании = уровень director
      return { main: true, hiring: true, tools: true, settings: true, admin: false, modules: CLIENT_MODULES_LIST }
    case "hr_lead":
      return { main: true, hiring: true, tools: true, settings: true, admin: false, modules: CLIENT_MODULES_LIST }
    case "hr_manager":
      return { main: true, hiring: true, tools: false, settings: false, admin: false, modules: CLIENT_MODULES_LIST }
    case "department_head":
      return { main: true, hiring: false, tools: false, settings: false, admin: false, modules: CLIENT_MODULES_LIST }
    case "observer":
      return { main: true, hiring: false, tools: false, settings: false, admin: false, modules: CLIENT_MODULES_LIST }
    case "tester_hr":
      return { main: true, hiring: true, tools: false, settings: false, admin: false, modules: CLIENT_MODULES_LIST }
    case "employee":
      return { main: false, hiring: false, tools: false, settings: false, admin: false, modules: [] }
  }
}

// Settings items visible per role
export function getVisibleSettings(role: UserRole): string[] {
  switch (role) {
    case "platform_admin": return ["company", "profile", "team", "branding", "integrations", "schedule", "notifications", "billing", "legal", "roles"]
    case "admin": return ["company", "profile", "team", "branding", "integrations", "schedule", "notifications", "billing", "legal", "roles"]
    case "platform_manager": return ["profile", "notifications"]
    // Компанийские настройки редактирует только директор/владелец (см. requireDirector / COMPANY_OWNER_ROLES).
    case "director": return ["company", "profile", "team", "branding", "integrations", "schedule", "notifications", "billing", "legal", "roles"]
    case "client": return ["company", "profile", "team", "branding", "integrations", "schedule", "notifications", "billing", "legal", "roles"]
    // hr_lead больше не видит компанийские настройки — только личные.
    case "hr_lead": return ["profile", "notifications"]
    case "hr_manager": return ["profile", "notifications"]
    case "department_head": return ["profile", "notifications"]
    case "observer": return ["profile"]
    case "tester_hr": return ["profile"]
    case "employee": return ["profile"]
  }
}
