"use client"

import { createContext, useContext, useState, type ReactNode } from "react"
import { useSession } from "next-auth/react"
import { signOut as nextAuthSignOut } from "next-auth/react"

export type UserRole = "admin" | "manager" | "client" | "client_hr" | "candidate"

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

// Fallback пользователь пока сессия загружается
const FALLBACK_USER: User = {
  id: "",
  name: "Загрузка...",
  email: "",
  role: "admin",
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession()
  const [viewRole, setViewRoleState] = useState<UserRole | null>(null)

  // Реальная роль из сессии
  const realRole = (session?.user?.role ?? "admin") as UserRole

  // Отображаемая роль — может быть переключена для демо (только для admin)
  const role: UserRole = (viewRole ?? realRole)

  const isLoggedIn = status === "authenticated" && !!session?.user

  const user: User = session?.user
    ? {
        id: session.user.id,
        name: session.user.name ?? "",
        email: session.user.email ?? "",
        role,
        companyId: session.user.companyId ?? null,
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

  const login = (_r: UserRole) => {
    // Реальный логин — через NextAuth signIn("credentials", ...) в login page
    // Эта заглушка сохранена для обратной совместимости
  }

  const logout = () => {
    setViewRoleState(null)
    nextAuthSignOut({ callbackUrl: "/login" })
  }

  const isViewingAs = viewRole !== null && viewRole !== realRole
  const hasAccess = (allowed: UserRole[]) => allowed.includes(role)

  return (
    <AuthContext.Provider value={{
      user,
      role,
      realRole,
      isLoggedIn,
      isViewingAs,
      setRole,
      hasAccess,
      returnToAdmin,
      login,
      logout,
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
  admin: "Администратор",
  manager: "Клиентский менеджер",
  client: "Клиент — Главный HR",
  client_hr: "Клиент — HR менеджер",
  candidate: "Кандидат",
}

export const ROLE_ICONS: Record<UserRole, string> = {
  admin: "👑",
  manager: "🤝",
  client: "👔",
  client_hr: "👤",
  candidate: "🔍",
}

// Sidebar visibility per role
export function getVisibleSections(role: UserRole) {
  switch (role) {
    case "admin":
      return { main: true, hiring: true, tools: true, settings: true, admin: true }
    case "manager":
      return { main: true, hiring: true, tools: true, settings: false, admin: false }
    case "client":
      return { main: true, hiring: true, tools: true, settings: true, admin: false }
    case "client_hr":
      return { main: true, hiring: true, tools: false, settings: false, admin: false }
    case "candidate":
      return { main: false, hiring: false, tools: false, settings: false, admin: false }
  }
}

// Settings items visible per role
export function getVisibleSettings(role: UserRole): string[] {
  switch (role) {
    case "admin": return ["company", "team", "integrations", "schedule", "notifications", "billing"]
    case "client": return ["company", "team", "integrations", "schedule", "notifications", "billing"]
    case "manager": return ["notifications"]
    case "client_hr": return ["notifications"]
    case "candidate": return []
  }
}
