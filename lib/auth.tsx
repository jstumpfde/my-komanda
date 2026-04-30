"use client"

import { createContext, useContext, useState, type ReactNode } from "react"
import { useSession } from "next-auth/react"
import { signOut as nextAuthSignOut } from "next-auth/react"

// ─── Роли ──────────────────────────────────────────────────────
// Платформа (скрыты от клиента): platform_admin, platform_manager
// Клиент: director, hr_lead, hr_manager, department_head, observer

export type UserRole =
  | "platform_admin"
  | "platform_manager"
  | "director"
  | "hr_lead"
  | "hr_manager"
  | "department_head"
  | "observer"
  | "employee"

export const PLATFORM_ROLES: UserRole[] = ["platform_admin", "platform_manager"]
export const CLIENT_ROLES: UserRole[] = ["director", "hr_lead", "hr_manager", "department_head", "observer"]

export function isPlatformRole(role: UserRole): boolean {
  return PLATFORM_ROLES.includes(role)
}

export interface User {
  id: string
  name: string
  email: string
  role: UserRole
  companyId?: string | null
  company?: string
  avatar?: string
}

interface AuthContextValue {
  user: User
  role: UserRole
  realRole: UserRole
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
  name: "Загрузка...",
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

  const isLoggedIn = status === "authenticated" && !!session?.user

  const user: User = session?.user
    ? {
        id: session.user.id,
        name: session.user.name ?? "",
        email: session.user.email ?? "",
        role,
        companyId: session.user.companyId ?? null,
        avatar: session.user.avatarUrl ?? undefined,
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
      user, role, realRole, isLoggedIn, isViewingAs,
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
  platform_admin: "Администратор платформы",
  platform_manager: "Менеджер платформы",
  director: "Директор",
  hr_lead: "Главный HR",
  hr_manager: "HR-менеджер",
  department_head: "Руководитель отдела",
  observer: "Наблюдатель",
  employee: "Сотрудник",
}

export const ROLE_ICONS: Record<UserRole, string> = {
  platform_admin: "👑",
  platform_manager: "🤝",
  director: "👔",
  hr_lead: "🛡️",
  hr_manager: "🏢",
  department_head: "👥",
  observer: "👁️",
  employee: "👤",
}

// Sidebar visibility per role
export function getVisibleSections(role: UserRole) {
  switch (role) {
    case "platform_admin":
      return { main: true, hiring: true, tools: true, settings: true, admin: true }
    case "platform_manager":
      return { main: true, hiring: true, tools: true, settings: false, admin: false }
    case "director":
      return { main: true, hiring: true, tools: true, settings: true, admin: false }
    case "hr_lead":
      return { main: true, hiring: true, tools: true, settings: true, admin: false }
    case "hr_manager":
      return { main: true, hiring: true, tools: false, settings: false, admin: false }
    case "department_head":
      return { main: true, hiring: false, tools: false, settings: false, admin: false }
    case "observer":
      return { main: true, hiring: false, tools: false, settings: false, admin: false }
    case "employee":
      return { main: false, hiring: false, tools: false, settings: false, admin: false }
  }
}

// Settings items visible per role
export function getVisibleSettings(role: UserRole): string[] {
  switch (role) {
    case "platform_admin": return ["company", "profile", "team", "integrations", "schedule", "notifications", "billing", "legal"]
    case "platform_manager": return ["profile", "notifications"]
    case "director": return ["company", "profile", "team", "integrations", "schedule", "notifications", "billing"]
    case "hr_lead": return ["company", "profile", "team", "integrations", "schedule", "notifications"]
    case "hr_manager": return ["profile", "notifications"]
    case "department_head": return ["profile", "notifications"]
    case "observer": return ["profile"]
    case "employee": return ["profile"]
  }
}
